#!/usr/bin/env node
/**
 * packages/codingmon/test/durchstich-wege.test.mjs — der Durchstich auf seinen
 * ZWEITEN Wegen und an seinen Grenzen.
 *
 * Der erste Weg (Klick -> Sperre -> Wurf -> Ereignis -> Anzeige) steht in
 * `durchstich.test.mjs`. Hier stehen die Faelle, die dort nur als Rand vorkommen
 * und eigene Laeufe brauchen: der LOKALE Weg ohne Host (Arbeit -> Ball -> Wild ->
 * Kampf im Dock), die Decke der Leiter (1e300 XP), die Reparatur eines kaputten
 * Spielstands und der Abbau eines laufenden Zuges.
 *
 * Warum getrennt (2026-10-23): die eine Datei war 660 Zeilen lang — ueber der
 * Klassengrenze von 550 — und trug zwei Zusagen. Getrennt ist jede Datei EIN
 * Durchstich mit eigenem Aufbau; die Attrappe (`harness.mjs`) und die Auswertung
 * (`createCheck`) sind gemeinsam, damit nicht zwei Wahrheiten entstehen.
 *
 * WAS DIE ATTRAPPEN NICHT BEWEISEN (ehrlich): die Wartezeit laeuft in einer
 * Attrappen-Uhr, nicht in einem echten Browser; React, Layout und Compositor
 * sind Attrappen. Bewiesen ist der VERTRAG des Bundles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as host from '../assets/mechanik.js';
import { boot, createCheck, flatten, collectText } from './harness.mjs';

const { check, failures, failed: tally } = createCheck();
const flat = (node) => JSON.stringify(node);

// ── WEG b: BALL → WILD → KAMPF IM DOCK (lokaler Trigger, kein Host) ───────
{
  const dockOf = (sim) => sim.slots.find((slot) => slot.options.id === 'shinon-wild-dock').component;
  const tailOf = (sim) => sim.slots.find((slot) => slot.options.id === 'shinon-battle-result').component;
  const fireAll = (sim) => { for (const { fn } of sim.intervals.values()) fn(); };
  const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };
  const panelOf = (sim) => sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component;

  // Ohne Arbeit kein Spawn: der Hand-Trigger bei 0 Schritten bleibt zu.
  const idle = boot();
  check('ohne Arbeit kein Spawn (der Hand-Trigger bei 0 Schritten bleibt zu)',
    idle.api.trigger() === null && idle.api.state().wild === null
    && flat(flatten(dockOf(idle)({}))) === 'null');

  // Tokens ohne bestaetigte Completion geben keine XP und keinen Fortschritt.
  const tokensOnly = boot({ bodyText: 'Sitzung: 12.345 tok' });
  fireAll(tokensOnly);
  await flush();
  check('Tokenverbrauch allein gibt weder XP noch Completion-Fortschritt',
    tokensOnly.api.state().xp === 0 && tokensOnly.api.state().completions === 0
    && tokensOnly.api.state().localSteps === 0);

  // Neue erfolgreiche Host-Completions erzeugen genau entsprechende XP und Spawn-Fortschritt.
  let completionTotal = 0;
  const work = boot({ save: { completions: 2, localSteps: 2 }, activity: async () => ({ ok: true, value: { completions: completionTotal } }) });
  completionTotal = 3;
  fireAll(work);
  await flush();
  const wild = work.api.state().wild;
  const expected = host.spawnFor(3, work.api.state().level);
  check('eine neue erfolgreiche Completion vergibt genau ein XP und wird persistiert',
    work.api.state().xp === 1 && work.api.state().completions === 3 && work.api.state().localSteps === 3);
  check('jeder 3. lokale Schritt oeffnet den Ball (deterministisch wie der Host)',
    wild !== null && wild.speciesId === expected.speciesId && wild.level === expected.level
    && wild.hp === wild.maxHp && wild.hp > 0,
    wild === null ? 'kein Wild' : `${wild.speciesId} L${wild.level}`);
  const wildFlat = flat(flatten(dockOf(work)({})));
  const wildText = collectText(flatten(dockOf(work)({}))).join(' | ');
  check('das Dock zeigt Ball und Wild mit Kampfaufforderung',
    wildFlat.includes('__cm_ball') && wildFlat.includes('__cm_wild-sprite')
    && wildText.includes('erscheint!') && wildText.includes('Kämpfen'),
    wildText.slice(0, 80));

  // Ein Klick fordert heraus: erst die Sperre, dann der Kampf — im Dock.
  work.api.challenge();
  check('die Herausforderung ist ein Zug (Sperre steht, Kampf kommt verzoegert)',
    work.api.lock() !== null && work.api.state().battle === null);
  work.clock.advance(3000);
  const opened = work.api.state();
  check('nach der Wartezeit steht der Kampf aus dem Wild (Art und Stufe stimmen)',
    opened.battle !== null && opened.battle.speciesId === wild.speciesId
    && opened.battle.level === wild.level && opened.wild === null,
    opened.battle === null ? 'kein Kampf' : `${opened.battle.speciesId} L${opened.battle.level}`);
  const panelFlat = flat(flatten(panelOf(work)({})));
  check('der Kampf steht nicht mehr im Panel (main zeigt Stand, kein Kampf)',
    !panelFlat.includes('__cm_board') && !panelFlat.includes('__cm_fight')
    && !panelFlat.includes('__cm_arena'));

  // Durchkaempfen: das Ergebnis landet als Zeile im turnTail.
  let guard = 0;
  while (work.api.state().battle !== null && guard < 200) {
    guard += 1;
    const st = work.api.state();
    if (st.lock !== null || st.battle.turn !== 'challenger') { work.clock.advance(3000); continue; }
    work.api.use(work.api.abilities().slice(-1)[0].id);
    work.clock.advance(3000);
  }
  const res = work.api.state().lastResult;
  const tailText = collectText(flatten(tailOf(work)({}))).join(' | ');
  check('Sieg oder K.o. landen als Zeile im turnTail',
    res !== null && (tailText.includes('Sieg gegen') || tailText.includes('K.o. gegen')),
    tailText.slice(0, 80));
  check('nach dem Kampf kommt der Ball nicht sofort wieder (Verbrauchsmarke)',
    work.api.trigger() === null && work.api.state().wild === null);

  // Flucht und Rueckzug: abbrechbar, ohne Ergebnis-Schuld.
  const shy = boot({ save: { completions: 5, localSteps: 5 }, activity: async () => ({ ok: true, value: { completions: 6 } }) });
  fireAll(shy);
  await flush();
  check('Schritt 6 oeffnet den naechsten Ball (die Marke zaehlt weiter)',
    shy.api.state().wild !== null && shy.api.state().localSteps === 6);
  const frozen = shy.storage.getItem('shinon.codingmon/v1');
  const re = boot({ save: frozen });
  check('der Wilde ueberlebt den Neustart (Persistenz vor der Herausforderung)',
    JSON.stringify(re.api.state().wild) === JSON.stringify(shy.api.state().wild));
  shy.api.flee();
  check('Flucht leert das Wild, ohne Kampf und ohne Zaehler',
    shy.api.state().wild === null && shy.api.state().battle === null
    && shy.api.trigger() === null);

  // Zwei identische Laeufe liefern dasselbe Ergebnis — die Animation (reines
  // CSS) kann das Ergebnis nicht bewegen, weil sie den Zustand nie beruehrt.
  const run = () => {
    const sim = boot({ save: { completions: 2, localSteps: 2 }, activity: async () => ({ ok: true, value: { completions: 3 } }) });
    fireAll(sim);
    sim.api.challenge();
    sim.clock.advance(3000);
    sim.api.use(sim.api.abilities().slice(-1)[0].id);
    sim.clock.advance(3000);
    const st = sim.api.state();
    return { battle: st.battle, hp: st.hp, log0: st.log[0] };
  };
  check('zwei identische Laeufe liefern dasselbe Kampfergebnis (Animation ruettelt nichts)',
    JSON.stringify(run()) === JSON.stringify(run()));
}

// ── DECKEL, REPARATUR, ABBAU (die drei Review-Befunde) ───────────────────
{
  // A: die Leiter hat eine Decke — 1e300 XP enden nicht in NaN und nicht in
  //    Exponentialschreibweise.
  const sim = boot();
  sim.api.addXp(1e300);
  const capped = sim.api.state();
  const text = collectText(flatten(sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component({}))).join(' | ');
  const exactHp = host.statsAtExact('nullpointer', 5000).hp.toString();
  const grouped = exactHp.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  check('die Leiter ist gedeckelt: 1e300 XP enden auf Level 50, nicht in NaN oder Infinity',
    capped.level === host.LEVEL_CAP && Number.isFinite(capped.stats.hp) && Number.isFinite(capped.xp),
    `Level ${capped.level}, HP ${capped.stats.hp}, Decke ${host.LEVEL_CAP}`);
  check('die Decke gilt auch fuer Schwelle und Umkehrung (Level > Decke ist Level = Decke)',
    host.threshold(5000) === host.threshold(50) && host.levelFor(1e300) === 50
    && host.powerAt(10, 3000) === host.powerAt(10, 50),
    `threshold(5000) = threshold(50) = ${host.threshold(50)}`);
  check('die Anzeige bleibt Ziffern: kein „e+", kein Infinity, kein NaN im Panel',
    !/(e\+|Infinity|NaN)/.test(text),
    text.match(/[^|]*e\+[^|]*/)?.[0]?.slice(0, 80) ?? 'keine Exponentialschreibweise');
  check('die gedeckelte HP steht exakt (BigInt) und mit Tausenderpunkten im Panel',
    exactHp.length >= 3 && text.includes(grouped),
    `${exactHp.length} Stellen, Anfang: ${grouped.slice(0, 33)}…`);
  check('die Stellenzahl zaehlt Ziffern, nicht die Laenge von „4.7e+298"',
    !/Stellen: 2[01]\b/.test(text) && text.includes('Decke: Level 50'),
    text.match(/Stellen: [^|]*/)?.[0]?.slice(0, 40) ?? 'keine Stellenangabe');
  check('Tausenderpunkte und Stellenzahl sind der Beweis der Eskalation (2 -> 4 -> 5 Stellen)',
    host.formatNumber(213187) === '213.187' && host.formatNumber('1e+300') === '1e+300'
    && host.describeValue(10, 8).digits === 2 && host.describeValue(10, 20).digits === 2
    && host.describeValue(10, 30).digits === 2,
    `L8 = ${host.describeValue(10, 8).text} (2), L20 = ${host.describeValue(10, 20).text} (2), L30 = ${host.describeValue(10, 30).text} (2 Stellen)`);
  const milestoneText = collectText(flatten(sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component({}))).join(' | ');
  check('auch ein Meilensteinwert steht in Ziffern, nicht als „1e+300"',
    !/1e\+300/.test(milestoneText) && /MEILENSTEIN 1\.000\.000\+ · xp · Level 50/.test(milestoneText),
    milestoneText.match(/MEILENSTEIN [^|]*/)?.[0]?.slice(0, 120) ?? 'kein Meilenstein im Panel');

  // B: ein kaputter Beutezaehler wird JE WERT geprueft, nicht nur auf Existenz.
  const corrupt = boot({ save: { xp: 500, loot: { schrott: 'viele', brauchbar: null, shiny: 2.7, fremd: 99 } } });
  const corruptLoot = corrupt.api.state().loot;
  const corruptText = collectText(flatten(corrupt.slots.find((slot) => slot.options.key === 'shinon-codingmon').component({}))).join(' | ');
  check('ein kaputter Beutezaehler wird JE WERT repariert (kein „viele1" als Zaehler)',
    JSON.stringify(corruptLoot) === JSON.stringify({ schrott: 0, brauchbar: 0, shiny: 2 }),
    JSON.stringify(corruptLoot));
  check('... und die Anzeige nennt einen Zaehler, keine Zeichenkette',
    /Schrott: 85 % — 0 gefunden/.test(corruptText) && !corruptText.includes('viele'),
    corruptText.match(/Schrott: [^|]*/)?.[0] ?? 'keine Beute-Zeile');

  // C: der Abbau nimmt einen laufenden Zug mit.
  const torn = boot();
  torn.api.start();
  const pending = torn.clock.pending().length;
  const lockedBefore = torn.api.lock() !== null;
  torn.disposers.forEach((dispose) => dispose());
  const after = JSON.parse(torn.storage.getItem('shinon.codingmon/v1'));
  check('der Abbau nimmt den laufenden Zug mit: kein Timer und kein Takt ueberlebt',
    lockedBefore && pending === 1 && torn.clock.pending().length === 0 && torn.intervals.size === 0
    && torn.clock.fire(1) === false && torn.sandbox.window.__codingmon === undefined,
    `${pending} Timer vor dem Abbau, ${torn.clock.pending().length} danach, ${torn.intervals.size} Takte`);
  check('... und der Zustand behauptet danach keine Sperre mehr (auch nicht in der Ablage)',
    torn.api.lock() === null && after.lock === null,
    `Sperre im Speicher ${JSON.stringify(torn.api.lock())}, in der Ablage ${JSON.stringify(after.lock)}`);
}

console.log(`\n${tally() === 0 ? '✅' : '💥'} Durchstich (Wege und Grenzen): ${tally() === 0 ? 'alle Zusagen halten' : `${tally()} Abweichung(en)`}`);

test('E2E-Durchstich (Wege und Grenzen): lokaler Weg, Decke, Reparatur, Abbau — ohne Abweichung', () => {
  assert.equal(tally(), 0, failures.length
    ? `${tally()} Abweichung(en): ${failures.slice(0, 4).join(' | ')}`
    : 'keine Abweichung');
});
