/**
 * Faktenspeicher (Wissens-Runtime, Zug 1): eine EIGENE SQLite-Datei
 * (`facts.sqlite` im Zustandsordner), nicht die des Index.
 *
 * Warum eine eigene Datei (Messung am Code, nicht am Gefuehl):
 * `openIndex` in `index-core.js` droppt bei einer Schema-Abweichung alle
 * PRIMARY_TABLES. Fakten, die in derselben Datei lagen, haetten einen zweiten
 * Loeschpfad gebraucht, der bei jedem Index-Versionssprung greift. Eine eigene
 * Datei hat eigene Fassung (FACTS_VERSION), eigene Migrationen und keine
 * gemeinsame Loeschlogik mit dem abgeleiteten Index.
 *
 * Regeln:
 *  - Migrationen sind additiv. Kein `drop` in irgendeinem Schritt; der Test
 *    prueft das am Quelltext der Migrationen.
 *  - Eine Datei mit NEUERER Fassung wird abgelehnt, nie verstanden geraten.
 *  - Jeder Schreibvorgang laeuft in einer Transaktion; ein Fehler rollt zurueck.
 *  - Uebergaenge und Zyklen prueft der Kern (`facts-core.js`), nicht der Store.
 */
import { DatabaseSync } from 'node:sqlite';
import { ACTORS, canTransition, checkFact, factId, wouldCreateCycle } from './facts-core.js';
import { mayRevalidate, staleClosure } from './facts-invalidate.js';

export const FACTS_FILE_NAME = 'facts.sqlite';

/**
 * Obergrenze je Bereich (SH-LEARN-02): der Faktenspeicher ist Projekt-Memory,
 * kein Archiv. Ist die Grenze erreicht, weichen zuerst die TERMINALEN Fakten
 * (SUPERSEDED/REJECTED) — sie sind entschieden und tragen kein Wissen mehr.
 * Stehen danach noch zu viele lebende Fakten, wird der neue Fakt NAMENTLICH
 * abgelehnt (`KAPAZITAET` mit Ist und Soll); geloescht wird nie still.
 */
export const MAX_FACTS_PER_SCOPE = 2000;

// Schritt n setzt user_version auf n. Ein neuer Schritt kommt ans Ende;
// bestehende Schritte werden nie veraendert.
export const MIGRATIONS = Object.freeze([
  Object.freeze({
    to: 1,
    sql: Object.freeze([
      `create table facts (
         id text primary key,
         scope text not null,
         subject text not null,
         predicate text not null,
         value text not null,
         kind text not null,
         status text not null,
         status_at text not null
       )`,
      `create table fact_sources (
         fact_id text not null,
         pointer text not null,
         rev text not null,
         primary key (fact_id, pointer, rev)
       )`,
      'create index facts_scope on facts (scope)',
    ]),
  }),
  Object.freeze({
    to: 2,
    sql: Object.freeze([
      `create table fact_deps (
         fact_id text not null,
         depends_on text not null,
         primary key (fact_id, depends_on)
       )`,
    ]),
  }),
  Object.freeze({
    to: 3,
    sql: Object.freeze([
      // Zug 2: der Fingerabdruck des Wissensinhalts entscheidet, ob eine
      // geänderte Revision noch dieselbe Aussage trägt (Revalidierung).
      'alter table facts add column extract_hash text',
      'create index facts_extract_hash on facts (extract_hash)',
    ]),
  }),
]);

export const FACTS_VERSION = MIGRATIONS.length;

function userVersion(db) {
  return Number(db.prepare('pragma user_version').get().user_version);
}

/**
 * Oeffnet die Datei und zieht sie auf FACTS_VERSION. Gibt den Handle zurueck.
 * Wirft bei einer neueren Fassung — die Datei gehoert dann einer anderen
 * Version des Codes, und ein stilles Weiterschreiben waere Verlust.
 */
export function openFacts(file) {
  const db = new DatabaseSync(file);
  try {
    const current = userVersion(db);
    if (current > FACTS_VERSION) {
      throw new Error(`FACTS_VERSION_NEU: Datei ist Fassung ${current}, Code kennt ${FACTS_VERSION}`);
    }
    for (const step of MIGRATIONS) {
      if (step.to <= current) continue;
      db.exec('begin');
      try {
        for (const statement of step.sql) db.exec(statement);
        db.exec(`pragma user_version = ${step.to}`);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function closeFacts(db) {
  db.close();
}

/** Wie viele Fakten ein Bereich traegt. */
function countScope(db, scope) {
  return Number(db.prepare('select count(*) as n from facts where scope = ?').get(scope).n);
}

/**
 * Entfernt hoechstens `room` entschiedene Fakten eines Bereichs: die aeltesten
 * zuerst. Quellen und die EIGENEN Abhaengigkeiten gehen mit (eine Waise waere
 * ein Fakt, den niemand mehr belegen kann); ein Fakt, auf den ein anderer
 * zeigt, bleibt stehen — sonst risse das Loeschen ein Loch in eine Kette, die
 * der Leser noch braucht, und die Kuerzung waere nicht mehr nachvollziehbar.
 */
function pruneTerminal(db, scope, room) {
  const rows = db
    .prepare(
      "select f.id from facts f where f.scope = ? and f.status in ('SUPERSEDED','REJECTED')" +
        ' and not exists (select 1 from fact_deps d where d.depends_on = f.id)' +
        ' order by f.status_at asc, f.id asc limit ?',
    )
    .all(scope, Number(room));
  const dropSources = db.prepare('delete from fact_sources where fact_id = ?');
  const dropDeps = db.prepare('delete from fact_deps where fact_id = ?');
  const dropFact = db.prepare('delete from facts where id = ?');
  for (const row of rows) {
    dropSources.run(row.id);
    dropDeps.run(row.id);
    dropFact.run(row.id);
  }
  return rows.length;
}

/**
 * Legt einen Fakt an. Gleiche Kennung ⇒ kein zweiter Eintrag (idempotent).
 * `at` ist der vom Aufrufer gelieferte Zeitpunkt; der Store liest keine Uhr.
 * `options.maxFacts` senkt die Grenze (Tests); der Vorgabewert steht oben.
 */
export function insertFact(db, fact, at, options = {}) {
  const issues = checkFact(fact);
  if (issues.length > 0) return { ok: false, issues };
  const id = factId(fact);
  const existing = db.prepare('select id from facts where id = ?').get(id);
  if (existing) return { ok: true, id, existed: true };
  const max = Number.isInteger(options.maxFacts) && options.maxFacts > 0 ? options.maxFacts : MAX_FACTS_PER_SCOPE;
  let pruned = 0;
  db.exec('begin');
  try {
    const count = countScope(db, fact.scope);
    if (count >= max) {
      pruned = pruneTerminal(db, fact.scope, count - max + 1);
      const after = countScope(db, fact.scope);
      if (after >= max) {
        db.exec('rollback');
        return { ok: false, reason: 'KAPAZITAET', scope: fact.scope, ist: after, soll: max };
      }
    }
    db.prepare(
      'insert into facts (id, scope, subject, predicate, value, kind, status, status_at, extract_hash) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      fact.scope,
      fact.subject,
      fact.predicate,
      fact.value,
      fact.kind,
      'DISCOVERED',
      String(at),
      typeof fact.extractHash === 'string' ? fact.extractHash : null,
    );
    const source = db.prepare('insert into fact_sources (fact_id, pointer, rev) values (?, ?, ?)');
    for (const entry of fact.sources) source.run(id, entry.pointer, entry.rev);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return { ok: true, id, existed: false, pruned };
}

export function getFact(db, id) {
  const row = db.prepare('select * from facts where id = ?').get(id);
  if (!row) return null;
  const sources = db
    .prepare('select pointer, rev from fact_sources where fact_id = ? order by pointer, rev')
    .all(id)
    .map((entry) => ({ pointer: entry.pointer, rev: entry.rev }));
  const dependsOn = db
    .prepare('select depends_on from fact_deps where fact_id = ? order by depends_on')
    .all(id)
    .map((entry) => entry.depends_on);
  return { ...row, sources, dependsOn };
}

/**
 * Setzt den Status, wenn der Kern den Uebergang erlaubt. Der Akteur muss aus
 * ACTORS stammen; ein Modell-Akteur wird im Kern abgelehnt, nicht hier.
 */
export function transitionFact(db, id, to, actor, at) {
  if (!ACTORS.includes(actor)) return { ok: false, reason: 'AKTEUR_VERBOTEN' };
  const row = db.prepare('select status from facts where id = ?').get(id);
  if (!row) return { ok: false, reason: 'FAKT_UNBEKANNT' };
  const verdict = canTransition(row.status, to, actor);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  db.exec('begin');
  try {
    db.prepare('update facts set status = ?, status_at = ? where id = ?').run(to, String(at), id);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return { ok: true, reason: '' };
}

/** Fuegt die Abhaengigkeit `id` ⟶ `dependsOn` ein, wenn beide existieren und kein Zyklus entsteht. */
export function addDependency(db, id, dependsOn) {
  const known = db.prepare('select id from facts where id in (?, ?)').all(id, dependsOn);
  const knownIds = new Set(known.map((row) => row.id));
  if (!knownIds.has(id) || !knownIds.has(dependsOn)) return { ok: false, reason: 'FAKT_UNBEKANNT' };
  const edges = new Map();
  for (const row of db.prepare('select fact_id, depends_on from fact_deps').all()) {
    if (!edges.has(row.fact_id)) edges.set(row.fact_id, []);
    edges.get(row.fact_id).push(row.depends_on);
  }
  if (wouldCreateCycle(edges, id, dependsOn)) return { ok: false, reason: 'ZYKLUS' };
  db.exec('begin');
  try {
    db.prepare('insert or ignore into fact_deps (fact_id, depends_on) values (?, ?)').run(id, dependsOn);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return { ok: true, reason: '' };
}

export function factsForPointer(db, pointer) {
  return db
    .prepare('select distinct fact_id from fact_sources where pointer = ? order by fact_id')
    .all(pointer)
    .map((row) => row.fact_id);
}

/** Der Abhängigkeitsgraph als Map id → [ids, von denen id abhängt]. */
export function edgesOf(db) {
  const edges = new Map();
  for (const row of db.prepare('select fact_id, depends_on from fact_deps order by fact_id, depends_on').all()) {
    if (!edges.has(row.fact_id)) edges.set(row.fact_id, []);
    edges.get(row.fact_id).push(row.depends_on);
  }
  return edges;
}

/**
 * Setzt die übergebenen Kennungen auf STALE, soweit der Lebenszyklus es erlaubt.
 *
 * Eine Kaskade kann hunderte Fakten treffen; je Zeile eine eigene Transaktion
 * kostet ein fsync pro Zeile (gemessen: 208 ms für 200 Fakten). Deshalb läuft
 * die ganze Kaskade in EINER Transaktion, mit denselben Prüfungen aus dem Kern.
 */
export function markStale(db, ids, actor, at) {
  if (!ACTORS.includes(actor)) return { changed: [], skipped: [...ids].sort().map((id) => ({ id, reason: 'AKTEUR_VERBOTEN' })) };
  const done = [];
  const skipped = [];
  const read = db.prepare('select status from facts where id = ?');
  const write = db.prepare('update facts set status = ?, status_at = ? where id = ?');
  db.exec('begin');
  try {
    for (const id of [...ids].sort()) {
      const row = read.get(id);
      if (!row) {
        skipped.push({ id, reason: 'FAKT_UNBEKANNT' });
        continue;
      }
      const verdict = canTransition(row.status, 'STALE', actor);
      if (!verdict.ok) {
        skipped.push({ id, reason: verdict.reason });
        continue;
      }
      write.run('STALE', String(at), id);
      done.push(id);
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return { changed: done, skipped };
}

/**
 * Eine Quelle hat eine neue Revision. Der Inhalt entscheidet:
 *  - gleicher Extraktions-Hash wie bisher ⇒ der Fakt gilt wieder (VALID),
 *  - anderer Hash ⇒ direkte Fakten werden STALE, und die Kaskade folgt den
 *    Umkehrkanten zu allen, die auf ihnen stehen.
 * Unbekannte Quellen sind ein Befund, kein stiller Erfolg.
 */
export function applySourceChange(db, { pointer, rev, hash, at }) {
  const direct = factsForPointer(db, pointer);
  if (direct.length === 0) return { ok: false, reason: 'QUELLE_UNBEKANNT', revalidated: [], stale: [] };
  const revalidated = [];
  const changed = [];
  db.exec('begin');
  try {
    db.prepare('update fact_sources set rev = ? where pointer = ?').run(String(rev), pointer);
    for (const id of direct) {
      const row = db.prepare('select status, extract_hash from facts where id = ?').get(id);
      const verdict = mayRevalidate(row.extract_hash, hash);
      if (verdict.ok) {
        db.prepare('update facts set extract_hash = ? where id = ?').run(hash, id);
        revalidated.push(id);
      } else {
        db.prepare('update facts set extract_hash = ? where id = ?').run(hash, id);
        changed.push(id);
      }
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  // Revalidierung braucht einen Akteur und den Weg durch VALIDATING.
  for (const id of revalidated) {
    const row = db.prepare('select status from facts where id = ?').get(id);
    if (row.status === 'STALE' || row.status === 'DISPUTED') transitionFact(db, id, 'VALIDATING', 'validator', at);
    transitionFact(db, id, 'VALID', 'validator', at);
  }
  const closure = changed.length === 0 ? { ok: true, stale: [] } : staleClosure(edgesOf(db), changed);
  if (!closure.ok) return { ok: false, reason: closure.reason, revalidated, stale: [] };
  const marked = markStale(db, closure.stale, 'invalidator', at);
  return { ok: true, reason: '', revalidated, stale: marked.changed, skipped: marked.skipped };
}

export function listFacts(db, scope) {
  return db
    .prepare('select id, status, kind from facts where scope = ? order by id')
    .all(scope)
    .map((row) => ({ id: row.id, status: row.status, kind: row.kind }));
}
