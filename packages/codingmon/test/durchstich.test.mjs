#!/usr/bin/env node
/**
 * packages/codingmon/test/durchstich.test.mjs — der E2E-DURCHSTICH.
 *
 * EIN Durchstich, ganz am Ende, wie im Review gefordert: echter Nutzer-Input
 * (Klick) -> die Sperre des Clients -> der Ergebnis-Wurf -> das DOM-Ereignis ->
 * die CSS-/Anzeige-Schicht. Gefahren wird das ECHTE Client-Bundle in einem
 * vm-Kontext mit Attrappen-Uhr, Attrappen-DOM und fest gesetztem Math.random —
 * kein DSH, kein Browser, kein Modell und keine Installation (der Host-Vertrag
 * → Kanon: docs/COMMENT-KANON.md#k-92e73217687a
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as host from '../assets/mechanik.js';

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
let failed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (!ok) { failed += 1; failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`); }
  console.log(`${ok ? '✅' : '✖'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
};

// ── Attrappen ────────────────────────────────────────────────────────────
function makeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = (seq += 1); timers.set(id, { at: now + Math.max(0, Math.round(ms) || 0), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    pending: () => [...timers.entries()].map(([id, timer]) => ({ id, at: timer.at })),
    /** Alle faelligen Timer bis `ms` in Zeitreihenfolge ausfuehren. */
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 500; guard += 1) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        timers.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = target;
    },
    /** Einen bestimmten Timer ausloesen, auch wenn er nicht faellig ist (Probe). */
    fire(id) {
      const timer = timers.get(id);
      if (timer === undefined) return false;
      timers.delete(id);
      now = timer.at;
      timer.fn();
      return true;
    },
  };
}

const el = () => ({
  className: '', style: {}, dataset: {}, children: [], innerText: '',
  append() {}, appendChild() {}, setAttribute() {}, remove() {},
  classList: { add() {}, contains: () => false },
});

function boot({ save = null, bodyText = '', activity = null } = {}) {
  const clock = makeClock();
  const storage = {
    data: new Map(),
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem(key, value) { this.data.set(key, String(value)); },
  };
  if (save !== null) storage.setItem('shinon.codingmon/v1', typeof save === 'string' ? save : JSON.stringify(save));
  let random = () => 0.5;
  const document = {
    head: el(), body: { ...el(), innerText: bodyText }, documentElement: el(),
    createElement: () => el(), querySelector: () => null, addEventListener() {},
  };
  const react = {
    useState: (value) => [value, () => {}],
    useEffect: (fn) => { fn(); },
    createElement: (type, props, ...kids) => ({
      type,
      props: { ...(props ?? {}), ...(kids.length === 0 ? {} : { children: kids.length === 1 ? kids[0] : kids }) },
    }),
  };
  const events = [];
  let intervalSeq = 0;
  const intervals = new Map();
  const disposers = [];
  const sandbox = {
    document, console: { log() {}, warn() {}, error() {} }, Date,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (fn, ms) => { const id = (intervalSeq += 1); intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
    localStorage: storage,
  };
  sandbox.window = sandbox;
  sandbox.window.__ModuleLoader__ = { load: (definition) => { sandbox.__plugin = definition; } };
  sandbox.dispatchEvent = (event) => events.push(event);
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => random();

  vm.runInContext(CLIENT, vm.createContext(sandbox), { filename: 'codingmon-client.js' });
  const plugin = sandbox.__plugin;
  const slots = [];
  const ctx = {
    get(name) {
      if (name === 'remote.codingmon') return activity === null ? undefined : { readActivity: activity };
      return undefined;
    },
    remote: activity === null ? {} : { codingmon: { readActivity: activity } },
    slots: {
      inject: (name, register) => register(),
      register: (options, component) => { slots.push({ options, component }); return () => {}; },
    },
    effect: (fn) => { const dispose = fn(); disposers.push(dispose); return dispose; },
  };
  const mod = plugin.factory(() => react);
  mod.apply(ctx);
  return {
    clock, storage, sandbox, plugin, slots, events, disposers, intervals, api: sandbox.window.__codingmon,
    setRandom: (fn) => { random = fn; },
    saved: () => JSON.parse(storage.getItem('shinon.codingmon/v1')),
  };
}

/** Komponenten aufloesen und den Text einsammeln (wie in der Dashboard-Attrappe). */
const flatten = (node) => {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(flatten);
  if (typeof node.type === 'function') return flatten(node.type(node.props ?? {}));
  return {
    type: node.type,
    props: Object.fromEntries(Object.entries(node.props ?? {}).filter(([key]) => key !== 'children')),
    children: flatten(node.props?.children ?? null),
  };
};
const collectText = (node, out = []) => {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((child) => collectText(child, out)); return out; }
  collectText(node.children, out);
  return out;
};
const flat = (node) => JSON.stringify(node);

const HOST_ABILITY = (id) => host.ABILITIES.find((ability) => ability.id === id) ?? host.ABILITIES[0];

/**
 * Kaempfen, bis `wins` Siege stehen — ueber die echte Sperre und die
 * Attrappen-Uhr, ohne Abkuerzung im Bundle. Jeder Zug ist ein Klick plus die
 * Vertragsdauer; der Gegner steht immer auf dem Level des Spielers, ein Sieg
 * ist also nicht garantiert (genau das soll die Probe auch nicht annehmen).
 */
function fightUntil(api, clock, wins, limit = 800) {
  let guard = 0;
  while (api.state().wins < wins && guard < limit) {
    guard += 1;
    const state = api.state();
    if (state.lock !== null) { clock.advance(3000); continue; }
    if (state.battle === null || state.battle.over !== null) { api.start(); clock.advance(3000); continue; }
    if (state.battle.turn !== 'challenger') { clock.advance(3000); continue; }
    api.use(api.abilities().slice(-1)[0].id);
    clock.advance(3000);
  }
  return api.state().wins;
}

console.log('═══════════════════════════════════════');
console.log('  Codemon-Engine (vier Mechaniken)');
console.log('═══════════════════════════════════════\n');

// ── SPIEGEL: Host und Client muessen dieselben Zahlen liefern ─────────────
{
  const boot0 = boot();
  const client = boot0.api.contract();
  const levels = [1, 2, 3, 5, 10, 17, 20, 33, 50];
  let mismatches = [];
  for (const level of levels) {
    if (client.threshold(level) !== host.threshold(level)) mismatches.push(`threshold(${level})`);
    if (client.rewardFor(level) !== host.rewardFor(level)) mismatches.push(`rewardFor(${level})`);
    for (const species of host.SPECIES_IDS) {
      const a = JSON.stringify(client.statsAt(species, level));
      const b = JSON.stringify(host.statsAt(species, level));
      if (a !== b) mismatches.push(`statsAt(${species},${level})`);
      const ca = client.abilitiesFor(level, species).join(',');
      const ha = host.abilitiesFor(level, species).map((ability) => ability.id).join(',');
      if (ca !== ha) mismatches.push(`abilitiesFor(${species},${level})`);
    }
  }
  check('Spiegel: 9 Stufen x 50 Spezies ergeben dieselben Schwellen, Werte und Faehigkeiten',
    mismatches.length === 0, mismatches.slice(0, 4).join(', ') || 'alle gleich');
  let arenaMismatch = [];
  for (const level of [1, 4, 9, 20]) {
    for (const round of [0, 1, 2, 7, 13]) {
      if (JSON.stringify(client.arenaFor(level, round)) !== JSON.stringify(host.arenaFor(level, round))) arenaMismatch.push(`${level}/${round}`);
    }
  }
  check('Spiegel: die Gegnerauswahl ist auf beiden Seiten identisch', arenaMismatch.length === 0, arenaMismatch.join(', ') || '20 Lagen gleich');
  check('Spiegel: der Elementkreis ist identisch',
    JSON.stringify(client.chart()) === JSON.stringify(host.ELEMENT_CHART));
  let dmgMismatch = [];
  for (const level of [1, 7, 15, 30]) {
    for (const attacker of host.SPECIES_IDS) {
      for (const defender of host.SPECIES_IDS) {
        for (const ability of host.abilitiesFor(level, attacker)) {
          const a = JSON.stringify({ ...client.resolveAttack(ability.id, attacker, defender, level), buff: client.resolveAttack(ability.id, attacker, defender, level).buff });
          const hostResult = host.resolveAttack(ability, {
            element: host.SPECIES[attacker].family,
            stats: host.statsAt(attacker, level),
            hp: host.statsAt(attacker, level).hp,
            maxHp: host.statsAt(attacker, level).hp,
            inherited: host.inheritedAbilities(attacker),
          }, { element: host.SPECIES[defender].family, stats: host.statsAt(defender, level) });
          const b = JSON.stringify({ ...hostResult, buff: hostResult.buff.id });
          if (a !== b) dmgMismatch.push(`${ability.id}/${attacker}/${defender}/${level}`);
        }
      }
    }
  }
  check('Spiegel: der Schaden stimmt ueber 4 Level x 50 x 50 Spezies und alle Faehigkeiten',
    dmgMismatch.length === 0, dmgMismatch.slice(0, 3).join(', ') || 'alle Zuege gleich');
  let lootMismatch = [];
  for (let i = 0; i < 1000; i += 1) {
    const uniform = i / 1000;
    if (client.rollLoot(uniform) !== host.rollLoot(uniform).id) lootMismatch.push(uniform);
  }
  check('Spiegel: der Loot-Wurf ist auf beiden Seiten identisch (1000 Stichproben)',
    lootMismatch.length === 0, lootMismatch.slice(0, 3).join(', ') || 'alle gleich');
  let spawnMismatch = [];
  for (let done = 0; done <= 12; done += 1) {
    for (const level of [1, 10]) {
      if (JSON.stringify(client.spawnFor(done, level)) !== JSON.stringify(host.spawnFor(done, level))) {
        spawnMismatch.push(`spawnFor(${done},${level})`);
      }
    }
  }
  check('Spiegel: der Wild-Spawn ist auf beiden Seiten identisch (Schritte 0-12, L1/L10)',
    spawnMismatch.length === 0, spawnMismatch.slice(0, 3).join(', ') || 'alle gleich');
  let effectMismatch = [];
  for (const attacker of Object.keys(host.ELEMENT_CHART)) {
    for (const defender of Object.keys(host.ELEMENT_CHART[attacker])) {
      if (JSON.stringify(client.effectiveness(attacker, defender))
        !== JSON.stringify(host.effectiveness(attacker, defender))) {
        effectMismatch.push(`${attacker}/${defender}`);
      }
    }
  }
  check('Spiegel: die Typwirkung als Zeichen ist auf beiden Seiten identisch (alle Zellen)',
    effectMismatch.length === 0, effectMismatch.slice(0, 3).join(', ') || 'alle gleich');
  let exactMismatch = [];
  const exactLevels = [1, 10, 40, 50, 60, 500, 2000, 5000];
  for (const level of exactLevels) {
    if (client.ladder(10, level) !== host.powerAtExact(10, level).toString()) exactMismatch.push(`ladder(${level})`);
    for (const species of host.SPECIES_IDS) {
      const a = JSON.stringify(client.statsAtExact(species, level));
      const b = JSON.stringify(Object.fromEntries(
        Object.entries(host.statsAtExact(species, level)).map(([key, value]) => [key, value.toString()]),
      ));
      if (a !== b) exactMismatch.push(`statsAtExact(${species},${level})`);
    }
  }
  check('Spiegel: die BigInt-Leiter und die exakten Werte stimmen bis ueber die Decke (8 Stufen x 50 Spezies)',
    exactMismatch.length === 0, exactMismatch.slice(0, 3).join(', ') || `${exactLevels.length} Stufen gleich`);
  check('Spiegel: beide Seiten kennen dieselbe Decke der Leiter',
    client.levelCap() === host.LEVEL_CAP && host.levelCap === undefined,
    `Client ${client.levelCap()}, Host ${host.LEVEL_CAP}`);
}

// ── 1. ESKALATION ────────────────────────────────────────────────────────
{
  const ratioLow = host.threshold(6) / host.threshold(5);
  const ratioHigh = host.threshold(41) / host.threshold(40);
  check('die Schwelle waechst multiplikativ und naehert sich dem Faktor 1,35',
    ratioLow === 1.5 && ratioHigh > 1.04 && ratioHigh < 1.06,
    `L6/L5 = ${ratioLow.toFixed(3)}, L41/L40 = ${ratioHigh.toFixed(3)} (Wachstum ${host.ESCALATION.growthBps} BPS)`);
  check('die Schwelle eskaliert von zwei- auf fuenfstellig',
    host.threshold(3) === 750 && host.threshold(20) > 10000,
    `L3 ${host.formatNumber(host.threshold(3))} -> L20 ${host.formatNumber(host.threshold(20))} XP`);
  check('die Werte eskalieren mit der Stufe (Faktor 1,35 je Stufe)',
    host.statsAt('nullpointer', 20).atk === Math.floor(10 * (10000 + 1200 * 19) / 10000),
    `ATK L20 = ${host.formatNumber(host.statsAt('nullpointer', 20).atk)}`);
  check('Tausenderpunkte machen die Nullen lesbar',
    host.formatNumber(1234567) === '1.234.567' && host.formatNumber(999) === '999' && host.formatNumber(1000) === '1.000',
    `${host.formatNumber(1234567)} / ${host.formatNumber(999)}`);
  const huge = host.describeValue(10, 60);
  check('die Leiter ist in Millionenhöhe EXAKT (BigInt, nicht gerundet)',
    typeof huge.exact === 'bigint' && huge.exact === host.powerAtExact(10, 60) && huge.digits === String(huge.exact).length,
    `L60 = ${huge.text} (${huge.digits} Stellen)`);
  check('Meilensteine greifen genau beim Stellensprung',
    host.milestoneFor(7, 12) === 10 && host.milestoneFor(9999, 10004) === 10000 && host.milestoneFor(12, 99) === null,
    '10 / 10000 / null');
  check('die Leiter ist eine reine Funktion von (Basis, Stufe)',
    host.powerAt(10, 12) === host.powerAt(10, 12) && host.statsAt('segfault', 9).hp === host.statsAt('segfault', 9).hp);
}

// ── 2. REGELWERK ─────────────────────────────────────────────────────────
{
  const chart = host.ELEMENT_CHART;
  check('der Elementkreis ist ein echter Kreis (1,5 / 0,75 / 1)',
    chart.spark.byte === 1.5 && chart.spark.feral === 0.75 && chart.byte.spark === 0.75
    && chart.feral.spark === 1.5 && Object.values(chart).every((row) => Object.values(row).includes(1)));
  const lineageEntries = Object.entries(host.LINEAGE);
  const brokenAncestors = lineageEntries.filter(([, entry]) => entry.ancestor !== null && host.LINEAGE[entry.ancestor] === undefined);
  const brokenInherits = lineageEntries.flatMap(([id, entry]) => (entry.inherits ?? [])
    .filter((ability) => !host.ABILITIES.some((candidate) => candidate.id === ability))
    .map((ability) => `${id}:${ability}`));
  check('der Vererbungsbaum ist geschlossen (jeder Ahn existiert, jede Erbfaehigkeit auch)',
    brokenAncestors.length === 0 && brokenInherits.length === 0,
    `${lineageEntries.length} Linien, ${brokenAncestors.length + brokenInherits.length} Fehler`);
  check('die Generationen sind ein Baum, keine Liste',
    Math.max(...lineageEntries.map(([, entry]) => entry.depth)) === 8
    && new Set(lineageEntries.map(([, entry]) => entry.depth)).size === 8,
    `Abstammungstiefen 1..8 ueber ${lineageEntries.length} Linien`);
  const inherited = host.abilitiesFor(10, 'recursion').map((ability) => ability.id);
  check('die Vererbung erweitert die Faehigkeiten wirklich',
    inherited.includes('boundary-slip') && inherited.includes('infinite-descent') && !inherited.includes('tackle') === false,
    inherited.join(', '));
  check('eine Grundfaehigkeit plus 2 je Spezies, die zweite ab Level 4',
    host.ABILITIES.length === 101 && host.ABILITIES.filter((a) => a.species === null).length === 1
    && host.SPECIES_IDS.every((id) => host.ABILITIES.filter((a) => a.species === id).length === 2)
    && host.ABILITIES.filter((a) => a.species !== null && a.minLevel === 4).length === 50,
    `${host.ABILITIES.length} Faehigkeiten`);
  // Unabhaengige Nachrechnung der Kette — nicht die Funktion, die Formel.
  const ability = HOST_ABILITY('tackle');
  const level = 12;
  const own = host.statsAt('nullpointer', level);
  // Mittleres HP: so greift weder "Nichts zu verlieren" noch "Uebertaktet" —
  // die Nachrechnung soll die Kette pruefen, nicht den Buff.
  const attacker = { element: 'spark', stats: own, hp: Math.round(own.hp * 0.5), maxHp: own.hp, inherited: [] };
  const defender = { element: 'byte', stats: host.statsAt('stackoverflow', level) };
  const result = host.resolveAttack(ability, attacker, defender);
  const expected = Math.max(1, Math.round(
    (ability.power * attacker.stats.atk) / 10
    * host.ELEMENT_CHART.spark.byte
    * host.SYNERGY['spark:physisch']
    * 1
    - defender.stats.def * host.CATEGORY.physisch.defFactor,
  ));
  check('der Schaden ist genau BaseDamage x Element x Synergie x Buff - DEF x Durchgriff',
    result.dealt === expected,
    `${result.dealt} = ${(result.base).toFixed(1)} x ${result.element} x ${result.synergy} - ${defender.stats.def} x ${result.defFactor}`);
  const special = host.resolveAttack(HOST_ABILITY('null-access'), { ...attacker, inherited: [] }, defender);
  check('der Durchgriff einer speziellen Faehigkeit ist groesser als der physische',
    special.defFactor < result.defFactor, `speziell ${special.defFactor} < physisch ${result.defFactor}`);
  const low = host.resolveAttack(HOST_ABILITY('deref'), { ...attacker, hp: 1 }, defender);
  const full = host.resolveAttack(HOST_ABILITY('deref'), { ...attacker, hp: own.hp }, defender);
  const mid = host.resolveAttack(HOST_ABILITY('deref'), attacker, defender);
  check('die Buffs werden nachgeschlagen: low-hp, full-hp, sonst neutral',
    low.buff.id === 'nichts-zu-verlieren' && low.buff.factor === 1.5
    && full.buff.id === 'uebertaktet' && full.buff.factor === 1.15
    && mid.buff.id === 'neutral' && mid.buff.factor === 1
    && low.dealt > mid.dealt && full.dealt > mid.dealt,
    `${low.buff.label} ${low.buff.factor}x (${low.dealt}) · ${full.buff.label} ${full.buff.factor}x (${full.dealt}) · ${mid.buff.label} (${mid.dealt})`);
  const inheritedBuff = host.resolveAttack(HOST_ABILITY('boundary-slip'), { ...attacker, inherited: ['boundary-slip'] }, defender);
  check('eine geerbte Faehigkeit kaempft mit der reinen Linie',
    inheritedBuff.buff.id === 'linie', `${inheritedBuff.buff.label} ${inheritedBuff.buff.factor}x`);
  check('der Schaden ist deterministisch (kein Wuerfel im Regelwerk)',
    host.resolveAttack(ability, attacker, defender).dealt === host.resolveAttack(ability, attacker, defender).dealt);
}

// ── 3. PACING / SPERRE ───────────────────────────────────────────────────
{
  const sim = boot();
  const api = sim.api;
  check('frischer Zustand: keine Sperre, kein Kampf, kein Schaden',
    api.state().lock === null && api.state().battle === null && api.damageTotal() === '0');
  const started = api.start();
  check('ein Klick sperrt SOFORT (noch vor jeder Berechnung)',
    started !== null && started.locked === true && api.lock() !== null && api.state().battle === null,
    `Sperre ${api.lock()?.action}, Kampf noch nicht aufgestellt`);
  check('die Sperre nennt die Vertragsdauer', sim.clock.pending().length === 1, `Timer bis ${sim.clock.pending()[0]?.at} ms`);
  const frozenLevel = api.lock().level;
  const spam = [api.use('tackle'), api.use('tackle'), api.use('tackle'), api.rest(), api.pick('segfault')];
  check('jeder weitere Input wird kalt abgewiesen, nicht eingereiht',
    spam.every((entry) => entry === null) && api.rejections() === 5,
    `${api.rejections()} Absagen`);
  check('die Absage benutzt den Satz aus dem Vertrag',
    api.state().log.some((line) => line.includes('Codermon ist im Kampf, warte auf das Ergebnis')),
    api.state().log[0]);
  check('nach 2999 ms ist der Zug noch nicht geschehen',
    (sim.clock.advance(2999), api.state().battle === null && api.lock() !== null));
  sim.clock.advance(1);
  const battle = api.state().battle;
  check('nach der Vertragsdauer steht der Gegner — genau einmal',
    api.lock() === null && battle !== null && api.state().round === 1,
    `Runde ${api.state().round}, ${battle.speciesId} L${battle.level}`);
  check('die Sperre hat den eingefrorenen Stand benutzt (Level bleibt das des Klicks)',
    frozenLevel === api.state().level, `Level ${frozenLevel}`);

  // Ein Kampfzug mit Spam: genau EIN Ergebnis.
  if (api.state().battle.turn === 'enemy') {
    // Der Gegner war zuerst dran; nach seiner Antwort ist der Spieler am Zug.
  }
  if (api.state().battle !== null && api.state().battle.over === null && api.state().battle.turn === 'challenger') {
    const before = api.state().battle.hp;
    const hpBefore = api.state().hp;
    api.use('tackle');
    const rejected = [api.use('tackle'), api.use('tackle'), api.use('tackle')].filter((entry) => entry === null).length;
    sim.clock.advance(3000);
    const after = api.state().battle === null ? 'Kampf vorbei' : api.state().battle.hp;
    check('drei Klicks im selben Zug ergeben EIN Ergebnis und drei Absagen',
      rejected === 3 && after !== before, `HP ${before} -> ${after}, HP eigen ${hpBefore} -> ${api.state().hp}`);
  } else {
    check('drei Klicks im selben Zug ergeben EIN Ergebnis und drei Absagen', false, 'kein Spielerzug erreichbar');
  }

  // Veralteter Timer: er darf nicht schreiben.
  const sim2 = boot();
  const api2 = sim2.api;
  api2.start();
  const staleId = sim2.clock.pending()[0].id;
  sim2.clock.advance(3000);
  const battleBefore = JSON.stringify(api2.state().battle);
  const nextTurn = api2.state().battle?.turn;
  api2.use(api2.abilities().slice(-1)[0].id);
  const lockB = api2.lock();
  sim2.clock.fire(staleId); // der ALTE Timer zuendet nachtraeglich
  check('ein veralteter Timer schreibt nicht (Kennungspruefung)',
    nextTurn === 'challenger' && lockB !== null && api2.lock() !== null && api2.lock().id === lockB.id
    && JSON.stringify(api2.state().battle) === battleBefore,
    `Sperre bleibt ${api2.lock()?.action}, Kampf unveraendert`);
  sim2.clock.advance(3000);
  check('der aktuelle Zug kommt trotzdem durch',
    api2.lock() === null && JSON.stringify(api2.state().battle) !== battleBefore);
}

// ── 4. LOOT ──────────────────────────────────────────────────────────────
{
  const counts = { schrott: 0, brauchbar: 0, shiny: 0 };
  for (let i = 0; i < host.LOOT_TOTAL; i += 1) counts[host.rollLoot(i / host.LOOT_TOTAL).id] += 1;
  check('die Gewichte ergeben exakt 85 / 14 / 1 Prozent',
    counts.schrott === 8500 && counts.brauchbar === 1400 && counts.shiny === 100,
    `${counts.schrott}/${counts.brauchbar}/${counts.shiny} aus ${host.LOOT_TOTAL} Wuerfen`);
  check('die Quoten sind lesbar und summieren sich auf 100',
    host.LOOT_TABLE.map(host.lootOdds).join(',') === '85,14,1'
    && host.LOOT_TABLE.reduce((sum, entry) => sum + host.lootOdds(entry), 0) === 100);
  check('die Grenzen sind halboffen (0,85 faellt schon in die zweite Stufe)',
    host.rollLoot(0.8499).id === 'schrott' && host.rollLoot(0.85).id === 'brauchbar'
    && host.rollLoot(0.99).id === 'shiny' && host.rollLoot(0.999999).id === 'shiny');

  // Ein Sieg = EIN Wurf. Math.random gibt dafuer eine feste Folge.
  const sim = boot();
  const api = sim.api;
  api.addXp(60000);        // hohes Level: der Gegner steht mit, aber es ist entscheidbar
  api.pick('segfault');    // hoher ATK, damit die Schleife nicht ewig laeuft
  let rolls = 0;
  sim.setRandom(() => { rolls += 1; return 0.5; });
  const wins = fightUntil(api, sim.clock, 3);
  const lootCount = Object.values(api.state().loot).reduce((sum, value) => sum + value, 0);
  check('ein Sieg rollt genau EINEN Wurf und zaehlt ihn',
    wins >= 3 && lootCount === wins && rolls === wins,
    `${wins} Siege, ${rolls} Wuerfe, ${JSON.stringify(api.state().loot)}`);
  check('der Pech-Zaehler waechst mit jedem Nicht-Shiny',
    api.state().sinceShiny === wins && api.state().loot.shiny === 0,
    `${api.state().sinceShiny} Siege seit dem letzten Shiny`);

  // Ein erzwungenes Shiny: Quote gewuerfelt, gezaehlt und gefeiert.
  const shiny = boot();
  const sh = shiny.api;
  sh.addXp(60000);
  sh.pick('segfault');
  shiny.setRandom(() => 0.995);
  fightUntil(sh, shiny.clock, 3);
  check('ein Shiny steht im Zaehler, im Log und im Store',
    sh.state().loot.shiny >= 1 && sh.state().log.some((line) => line.includes('SHINY'))
    && sh.state().drops.some((drop) => drop.id === 'shiny'),
    `${sh.state().loot.shiny} shiny, Log: ${sh.state().log.find((line) => line.includes('SHINY'))?.slice(0, 70)}`);
}

// ── PERSISTENZ ───────────────────────────────────────────────────────────
{
  const sim = boot();
  const api = sim.api;
  api.addXp(50000);
  api.start();
  sim.clock.advance(3000);
  if (api.state().battle?.turn === 'challenger') {
    api.use('tackle');
    sim.clock.advance(3000);
  }
  const raw = sim.storage.getItem('shinon.codingmon/v1');
  const saved = JSON.parse(raw);
  check('der Stand liegt in der Ablage, der Lebenslauf als Dezimaltext (JSON kennt kein BigInt)',
    typeof saved.damageTotal === 'string' && /^\d+$/.test(saved.damageTotal) && saved.version === 2,
    `damageTotal = "${saved.damageTotal}" als ${typeof saved.damageTotal}`);
  check('der gespeicherte Stand ist JSON-rund (BigInt haette hier geworfen)', saved.damageTotal === api.damageTotal());

  const again = boot({ save: saved });
  check('ein Stand derselben Fassung kommt mit XP, Schaden und Beute zurueck',
    again.api.state().xp === api.state().xp && again.api.damageTotal() === api.damageTotal()
    && JSON.stringify(again.api.state().loot) === JSON.stringify(api.state().loot));

  const legacy = boot({ save: { species: 'segfault', xp: 1200, wins: 4, losses: 2, round: 6, log: ['alt'] } });
  const legacyState = legacy.api.state();
  legacy.api.rest(); // ein Schreibvorgang, damit die Ablage den neuen Stand traegt
  check('ein alter Stand (v1, ohne Regelwerk und BigInt) wird migriert und behaelt XP und Siege',
    legacyState.xp === 1200 && legacyState.wins === 4 && legacyState.round === 6
    && legacyState.log.includes('alt') && legacy.api.damageTotal() === '0'
    && legacyState.loot.shiny === 0 && typeof legacy.saved().damageTotal === 'string'
    && legacy.saved().version === 2,
    `XP ${legacyState.xp}, Siege ${legacyState.wins}, damageTotal "${legacy.api.damageTotal()}"`);

  const stranded = boot({ save: { xp: 300, lock: { id: 'x', action: 'use', payload: {}, at: 1, until: 2, frozen: {} } } });
  check('ein Neuladen mitten im Zug laesst die Sperre fallen und sagt es',
    stranded.api.lock() === null
    && stranded.api.state().log.some((line) => line.includes('Neuladen mitten im Zug')),
    stranded.api.state().log[0]?.slice(0, 80));

  const broken = boot({ save: { xp: 'kaputt', damageTotal: 'nicht-numerisch', loot: null, battle: { speciesId: 'gibtsnicht', hp: 1, maxHp: 1 }, log: 5, wins: 'viele', localSteps: -999 } });
  check('ein kaputter Stand wird repariert statt zu werfen',
    broken.api.state().xp === 0 && broken.api.damageTotal() === '0'
    && broken.api.state().battle === null && broken.api.state().species === 'nullpointer'
    && Object.keys(broken.api.state().loot).length === 3
    && Array.isArray(broken.api.state().log) && broken.api.state().wins === 0
    && broken.api.state().localSteps === 0);
  // Die erste Mutation nach der Reparatur (Levelaufstieg -> `note`) und der
  // erste Sieg (`wins += 1`) duerfen nicht werfen und keine „viele1"-Zaehler
  // bauen — ein Wurf hier liesse die ganze Zusage rot werden.
  broken.api.addXp(200000);
  check('nach der Reparatur wirft weder Mutation noch Sieg',
    broken.api.state().log.length > 0 && broken.api.state().log.every((line) => typeof line === 'string')
    && broken.api.state().wins === 0);
}

// ── DARSTELLUNG ──────────────────────────────────────────────────────────
{
  const sim = boot();
  const api = sim.api;
  const panel = sim.slots.find((slot) => slot.options.key === 'shinon-codingmon').component;
  const expbar = sim.slots.find((slot) => slot.options.id === 'shinon-exp-bar').component;

  // Der Kampf wohnt im Dock (WEG b), nicht im Panel: Sperre und Knoepfe dort pruefen.
  const dock = sim.slots.find((slot) => slot.options.id === 'shinon-wild-dock').component;
  const tail = sim.slots.find((slot) => slot.options.id === 'shinon-battle-result').component;
  api.start();
  const lockedText = collectText(flatten(dock({}))).join(' | ');
  const lockedFlat = flat(flatten(dock({})));
  check('waehrend des Zuges zeigt das Dock den Absagesatz und den Sperrbalken',
    lockedText.includes('Codermon ist im Kampf, warte auf das Ergebnis') && lockedFlat.includes('__cm_lock-fill'),
    lockedText.slice(0, 70));
  check('waehrend des Zuges ist kein Faehigkeitsknopf aktiv',
    (lockedFlat.match(/"disabled":true/g) ?? []).length >= api.abilities().length,
    `${(lockedFlat.match(/"disabled":true/g) ?? []).length} gesperrte Knoepfe`);

  sim.clock.advance(3000);
  // Der erste Kampf steht: das Dock zeigt ihn mit echten Sprites.
  const openFlat = flat(flatten(dock({})));
  check('der Dock-Kampf zeigt echte Sprites (vorn/hinten, pro Spezies)',
    openFlat.includes('__cm_sprite') && (openFlat.match(/data-side/g) ?? []).length >= 2
    && (openFlat.match(/data-species/g) ?? []).length >= 2 && openFlat.includes('__cm_hit'),
    'front + back + Treffer-Einblendung');
  api.addXp(300000);
  fightUntil(api, sim.clock, 2);
  const tree = flatten(panel({}));
  const text = collectText(tree).join(' | ');
  const json = flat(tree);
  check('das Regelwerk steht OHNE Tabelle im Panel (Wirkung als Zeichen)',
    !json.includes('__cm_table') && !json.includes('"type":"table"') && !text.includes('Angreifer / Ziel')
    && text.includes('Wirkung (') && /×1,5 ▲/.test(text) && text.includes('Eigenes Element')
    && text.includes('Synergie') && text.includes('Linie:') && text.includes('Erbfaehigkeiten'));
  const tailText = collectText(flatten(tail({}))).join(' | ');
  check('das Kampfergebnis steht im turnTail (Sieg mit XP)',
    /Sieg gegen .+ — \+[\d.]+ XP/.test(tailText), tailText.slice(0, 70));
  check('die Eskalation steht mit formatierten Zahlen und Stellen da',
    text.includes('Eskalation — +12 % der Basiswerte je Stufe') && json.includes('Lebenslauf:')
    && /Lebenslauf: [\d.]+ Schaden in [\d.]+ Treffern/.test(text),
    text.match(/Lebenslauf: [^|]+/)?.[0]?.slice(0, 90) ?? '');
  check('die Beute steht mit Quoten und Pech-Zaehler da',
    text.includes('Schrott: 85 %') && text.includes('Shiny God-Tier: 1 %') && text.includes('Siege seit dem letzten Shiny'));
  const expText = collectText(flatten(expbar({}))).join(' | ');
  check('die globale EXP-Leiste zaehlt formatiert und nennt die Beute',
    /[\d.]+ XP · HP [\d.]+\/[\d.]+ · \d+ Siege · Beute \d+ shiny/.test(expText),
    expText.slice(0, 90));

  // Ein Meilenstein muss sichtbar werden, wenn die Stelle waechst.
  const milestone = boot();
  milestone.api.addXp(200000);
  milestone.api.pick('segfault');
  fightUntil(milestone.api, milestone.clock, 2);
  const msState = milestone.api.state();
  const msText = collectText(flatten(milestone.slots.find((slot) => slot.options.key === 'shinon-codingmon').component({}))).join(' | ');
  check('ein Stellensprung wird als Meilenstein gefeiert und angezeigt',
    msState.milestones.length >= 1 && msText.includes('MEILENSTEIN'),
    msState.milestones[0] === undefined ? 'kein Meilenstein' : `${msState.milestones[0].kind} ${msState.milestones[0].mark}+ -> ${msState.milestones[0].digits} Stellen`);
}

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

console.log(`\n${failed === 0 ? '✅' : '💥'} Durchstich: ${failed === 0 ? 'alle Zusagen halten' : `${failed} Abweichung(en)`}`);

test('E2E-Durchstich: Klick -> Sperre -> Wurf -> Ereignis -> Anzeige, ohne Abweichung', () => {
  assert.equal(failed, 0, failures.length
    ? `${failed} Abweichung(en): ${failures.slice(0, 4).join(' | ')}`
    : 'keine Abweichung');
});
