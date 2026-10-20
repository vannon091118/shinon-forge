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

export const FACTS_FILE_NAME = 'facts.sqlite';

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

/**
 * Legt einen Fakt an. Gleiche Kennung ⇒ kein zweiter Eintrag (idempotent).
 * `at` ist der vom Aufrufer gelieferte Zeitpunkt; der Store liest keine Uhr.
 */
export function insertFact(db, fact, at) {
  const issues = checkFact(fact);
  if (issues.length > 0) return { ok: false, issues };
  const id = factId(fact);
  const existing = db.prepare('select id from facts where id = ?').get(id);
  if (existing) return { ok: true, id, existed: true };
  db.exec('begin');
  try {
    db.prepare(
      'insert into facts (id, scope, subject, predicate, value, kind, status, status_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, fact.scope, fact.subject, fact.predicate, fact.value, fact.kind, 'DISCOVERED', String(at));
    const source = db.prepare('insert into fact_sources (fact_id, pointer, rev) values (?, ?, ?)');
    for (const entry of fact.sources) source.run(id, entry.pointer, entry.rev);
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return { ok: true, id, existed: false };
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

export function listFacts(db, scope) {
  return db
    .prepare('select id, status, kind from facts where scope = ? order by id')
    .all(scope)
    .map((row) => ({ id: row.id, status: row.status, kind: row.kind }));
}
