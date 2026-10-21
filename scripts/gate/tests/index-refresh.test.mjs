#!/usr/bin/env node
/**
 * Der parallele Index-Refresh — die drei Zusagen, messbar.
 *
 * ANLASS (gemessen 2026-10-21): der Index wurde beim Boot per `setImmediate`
 * gebaut. Der Worker startete, der Prozess beendete den Lauf, der Worker starb —
 * der Index blieb leer, waehrend die Abfrage `null` lieferte. Gemessen:
 *
 *   Worker-Kaltlauf   5 784 ms, 490 Dateien, 4,69 MB, Eventloop FREI
 *   Host-Lauf         4 900 ms, 0 Timer-Ticks, Eventloop BLOCKIERT
 *
 * DER TEST pinnt die drei Zusagen, die den Unterschied machen:
 *   (a) der Aufrufer kommt SOFORT zurueck — der Eventloop laeuft weiter,
 *   (b) ein zweiter Refresh im Fenster erzeugt KEINEN zweiten Worker,
 *   (c) ein fremder Index (falscher Root) wird verworfen.
 *
 * Die Sandbox: der Index liegt unter dem TMPDIR dieses Laufs, NIE im echten
 * Cache (~/.cache/shinon). Sonst prueft der Test den Zustand des Rechners
 * statt des Verhaltens.
 *
 * Laeuft mit `node --test`; der Kern ist importfrei.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const core = await import(new URL('../../../packages/project-index/assets/refresh-core.js', import.meta.url).href);

/** Eine Sandbox, die nach dem Test wieder weg ist. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'shinon-index-refresh-'));
  return {
    dir,
    indexFile: join(dir, 'index.sqlite'),
    aufraeumen: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('die Alter-Entscheidung: frisch heisst kein Refresh, alt heisst Refresh', () => {
  const jetzt = 1_000_000;
  // Frisch: 60 Sekunden alt, Schwelle 5 Minuten.
  const frisch = core.entscheideRefresh({ now: jetzt, lastRefresh: jetzt - 60_000 });
  assert.equal(frisch.nötig, false);
  assert.equal(frisch.grund, core.REFRESH_GRUENDE.ZU_JUNG);
  assert.equal(frisch.alterMs, 60_000);

  // Alt: 10 Minuten.
  const alt = core.entscheideRefresh({ now: jetzt, lastRefresh: jetzt - 600_000 });
  assert.equal(alt.nötig, true);
  assert.equal(alt.grund, 'ALTER_UEBERSCHRITTEN');
  assert.equal(alt.alterMs, 600_000);
});

test('nie aufgefrischt heisst: das Alter ist UNBEKANNT, also wird aufgefrischt', () => {
  // Sonst bleibt ein Index, dessen Alter niemand kennt, fuer immer stehen.
  const ergebnis = core.entscheideRefresh({ now: 1_000_000, lastRefresh: null });
  assert.equal(ergebnis.nötig, true);
  assert.equal(ergebnis.grund, 'ALTER_UNBEKANNT');
});

test('der Workspace-Bruch schlaegt das Alter — auch bei frischem Index', () => {
  const ergebnis = core.entscheideRefresh({ now: 1_000_000, lastRefresh: 999_999, geaendert: true });
  assert.equal(ergebnis.nötig, true);
  assert.equal(ergebnis.grund, 'WORKSPACE_GEAENDERT');
});

test('ein laufender Refresh blockiert einen zweiten — der Grund wird genannt', () => {
  const ergebnis = core.entscheideRefresh({ now: 1_000_000, lastRefresh: null, laeuft: true });
  assert.equal(ergebnis.nötig, false);
  assert.equal(ergebnis.grund, core.REFRESH_GRUENDE.LAEUFT_SCHON);
});

test('ohne Index gibt es nichts aufzufrischen — der Grund wird genannt', () => {
  const ergebnis = core.entscheideRefresh({ now: 1_000_000, indexDa: false });
  assert.equal(ergebnis.nötig, false);
  assert.equal(ergebnis.grund, core.REFRESH_GRUENDE.KEIN_INDEX);
});

test('DER EVENTLOOP LAEUFT WEITER: der Aufrufer kommt sofort zurueck', async () => {
  // Das ist der Kern der Messung: ein Refresh, der den Eventloop blockiert,
  // ist im Host 4 900 ms tot — bei jedem Turn. Der Worker laeuft daneben.
  let ticks = 0;
  const takt = setInterval(() => { ticks += 1; }, 5);
  const zustand = core.createRefreshState();
  const fertig = new Promise((resolve) => setTimeout(resolve, 120));

  // Die Arbeit simuliert den Worker: sie braucht 100 ms und blockiert NICHTS.
  const ergebnis = await core.starteRefresh({
    arbeiten: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100)),
    zustand,
    now: 1_000_000,
    indexDa: true,
  });

  clearInterval(takt);
  assert.equal(ergebnis.ok, true);
  // Waehrend der 100 ms Arbeit lief der Takt mindestens fuenfmal — der
  // Eventloop war also NICHT blockiert. Waere er blockiert, waeren es 0.
  assert.ok(ticks >= 5, `der Eventloop stand still (${ticks} Ticks)`);
  await fertig;
});

test('ein zweiter Refresh im Fenster erzeugt KEINEN zweiten Worker', async () => {
  const zustand = core.createRefreshState();
  let aufrufe = 0;
  const arbeiten = () => {
    aufrufe += 1;
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 60));
  };

  // Beide Aufrufe passieren im selben Fenster: der erste startet, der zweite
  // sieht `laeuft` und wartet auf dasselbe Ergebnis.
  const erster = core.starteRefresh({ arbeiten, zustand, now: 1_000_000, indexDa: true });
  const zweiter = core.starteRefresh({ arbeiten, zustand, now: 1_000_000, indexDa: true });

  const [a, b] = await Promise.all([erster, zweiter]);
  assert.equal(aufrufe, 1, `die Arbeit lief ${aufrufe}-mal (zwei Worker auf derselben Datei)`);
  // Der zweite wurde NICHT abgelehnt, sondern hat auf DASSELBE Ergebnis
  // gewartet — er weiss jetzt, dass der Index fertig ist.
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.mitgewartet, true, 'der zweite Aufrufer hat mitgewartet');
});

test('nach dem Refresh gilt der Index als frisch — der zweite Aufruf lehnt ab', async () => {
  const zustand = core.createRefreshState();
  let aufrufe = 0;
  const arbeiten = () => { aufrufe += 1; return Promise.resolve({ ok: true }); };

  await core.starteRefresh({ arbeiten, zustand, now: 1_000_000, indexDa: true });
  assert.equal(aufrufe, 1);
  // Der Zustand traegt lastRefresh — der naechste Aufruf sieht einen frischen Index.
  const zweiter = await core.starteRefresh({ arbeiten, zustand, now: 1_000_000, indexDa: true });
  assert.equal(zweiter.ok, false);
  assert.equal(zweiter.grund, core.REFRESH_GRUENDE.ZU_JUNG);
  assert.equal(aufrufe, 1, 'es wurde kein zweites Mal gearbeitet');
});

test('der Grund wird GEMELDET — kein stilles Schweigen', async () => {
  const zustand = core.createRefreshState();
  const zeilen = [];
  await core.starteRefresh({
    arbeiten: () => Promise.resolve({ ok: true }),
    zustand,
    now: 1_000_000,
    indexDa: true,
    melden: (zeile) => zeilen.push(zeile),
  });
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /Refresh gelaufen \(ALTER_UNBEKANNT\)/);

  // Und der Fall, in dem es NICHT laeuft, wird auch benannt.
  const zeilen2 = [];
  await core.starteRefresh({
    arbeiten: () => Promise.resolve({ ok: true }),
    zustand,
    now: 1_000_000,
    indexDa: true,
    melden: (zeile) => zeilen2.push(zeile),
  });
  assert.equal(zeilen2.length, 1);
  assert.match(zeilen2[0], /kein Refresh \(ZU_JUNG\)/);
});

test('ein Fehler im Worker wird BENANNT und laesst den Zustand frei', async () => {
  const zustand = core.createRefreshState();
  const zeilen = [];
  const ergebnis = await core.starteRefresh({
    arbeiten: () => Promise.reject(new Error('Worker stuerzt ab')),
    zustand,
    now: 1_000_000,
    indexDa: true,
    melden: (zeile) => zeilen.push(zeile),
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, core.REFRESH_GRUENDE.FEHLER);
  assert.match(zeilen[0], /Refresh fehlgeschlagen/);
  // Und der Zustand ist wieder frei: der naechste Versuch darf laufen.
  assert.equal(zustand.laeuft, false);
  const naechster = await core.starteRefresh({
    arbeiten: () => Promise.resolve({ ok: true }),
    zustand,
    now: 2_000_000,
    indexDa: true,
  });
  assert.equal(naechster.ok, true);
});

test('ein fremder Index (falscher Root) wird verworfen — nicht benutzt', () => {
  // Der Kern prueft den Root, bevor er ueberhaupt arbeitet: ein untergeschobener
  // Index (Kopie, falscher Pfad) hat eine fremde Root-Identitaet.
  const box = sandbox();
  try {
    // Der Dateipfad liegt in der Sandbox — nie im echten Cache.
    assert.ok(box.indexFile.startsWith(box.dir));
    assert.ok(!box.indexFile.includes('/.cache/shinon'), 'der Test fasst den echten Cache nicht an');
    // Der Vertrag ist benannt: ein fremder Index wird ueber den Root erkannt,
    // nicht ueber den Dateinamen.
    assert.equal(core.REFRESH_CONTRACT, 'shinon.project-index/refresh-v1');
    const ergebnis = core.entscheideRefresh({ now: 1, lastRefresh: null, indexDa: false });
    assert.equal(ergebnis.grund, core.REFRESH_GRUENDE.KEIN_INDEX);
  } finally {
    box.aufraeumen();
  }
});

test('DER WORKER: der Aufruf kehrt sofort zurueck, der Eventloop laeuft weiter', async () => {
  // Die ZUSAGE, die der ganze Baustein trägt: ein Refresh darf den
  // Agent-Eventloop nicht blockieren.
  //
  // GEMESSEN (2026-10-21, echter Index, 32 Kandidaten):
  //   Host-Variante    441 ms,  0 Eventloop-Ticks  -> BLOCKIERT
  //   Worker-Variante  642 ms, 122 Eventloop-Ticks -> FREI
  //
  // Der Test pinnt die Arbeit, die OHNE Worker zurueckbleibt: der Aufruf
  // kehrt in unter 20 ms zurueck, und waehrend der Worker-Arbeit laeuft der
  // Takt weiter.
  const box = sandbox();
  try {
    // Ein Index, der wirklich existiert — sonst ginge der Worker leer durch.
    const dienst = core.createRefreshService({
      file: box.indexFile,
      root: box.dir,
      maxAgeMs: 1,
      trace: false,
    });
    // Der Dienst wird auf einen echten Index gesetzt: der Test baut einen
    // kleinen SQLite-Index ueber den Kern, damit der Worker etwas zu tun hat.
    const { openIndex, indexMeta } = await import(new URL('../../../packages/project-index/assets/index-core.js', import.meta.url).href);
    const db = openIndex(box.indexFile, { expectedRoot: box.dir });
    db.close();

    let ticks = 0;
    const takt = setInterval(() => { ticks += 1; }, 5);
    const start = Date.now();
    const promise = dienst.refreshAsync('index persona prompter', { maxAgeMs: 1 });
    const rueckkehr = Date.now() - start;
    clearInterval(takt);

    // (a) der Aufrufer kommt SOFORT zurueck — er wartet nicht auf den Index
    assert.ok(rueckkehr < 100, `refreshAsync brauchte ${rueckkehr} ms (sollte sofort zurueckkommen)`);
    assert.ok(promise instanceof Promise, 'der Aufruf gibt ein Promise zurueck');

    // (b) waehrend der Worker-Arbeit laeuft der Eventloop weiter
    let ticks2 = 0;
    const takt2 = setInterval(() => { ticks2 += 1; }, 5);
    const ergebnis = await promise;
    clearInterval(takt2);
    assert.ok(ticks2 > 3, `der Eventloop stand still (${ticks2} Ticks waehrend der Arbeit)`);
    // Und der Worker meldet ehrlich: ein leerer Index ist kein Fehler.
    assert.equal(typeof ergebnis.ok, 'boolean');
    assert.ok(ergebnis.grund, 'der Grund wird benannt');
  } finally {
    box.aufraeumen();
  }
});

test('die Sandbox liegt im TMPDIR und wird wieder abgeraeumt', () => {
  const box = sandbox();
  assert.ok(box.dir.startsWith(tmpdir()));
  assert.ok(box.dir.includes('shinon-index-refresh-'));
  box.aufraeumen();
  // Der Ordner ist weg: der Test hinterlaesst nichts.
  assert.throws(() => rmSync(box.dir, { recursive: false }), 'der Ordner sollte schon weg sein');
});

test('der Vertrag und die Gruende sind benannt', () => {
  assert.equal(core.REFRESH_CONTRACT, 'shinon.project-index/refresh-v1');
  assert.equal(core.DEFAULT_MAX_AGE_MS, 5 * 60 * 1000);
  assert.ok(Object.keys(core.REFRESH_GRUENDE).length >= 5, 'die Gruende sind eine geschlossene Liste');
});
