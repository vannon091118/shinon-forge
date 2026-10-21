/**
 * @shinon/codingmon — der KERN der Codemon-Engine: Leiter, Regelwerk, Pacing,
 * Loot. Reine Tabellen und reine Funktionen, KEIN Bare-Import.
 *
 * WARUM GETRENNT VON index.js (gemessen, nicht Geschmack): dieses Modul laedt
 * ohne jede Abhaengigkeit, also auch in einer Umgebung ohne node_modules. Die
 * Einzeltests der Mathematik importieren deshalb DIESE Datei, und die CI faehrt
 * sie ohne Installation. `index.js` gibt alles hiervon weiter (`export *`) und
 * haelt nur, was den Host als Plugin ausmacht (`Config`, `apply`, der Spiegel).
 * Dieselbe Aufteilung wie beim Project Index: der Kern kennt keine
 * Host-Abhaengigkeit.
 *

/**
 * @shinon/codingmon — die Codemon-Engine (Host-Hälfte).
 *
 * Der Host hält den VERTRAG, der Client hält den ZUSTAND. Diese Trennung ist
 * Absicht: die Leiter der Eskalation, das Regelwerk, die Loot-Gewichte und die
 * Rundendauer sind reine Tabellen und reine Funktionen ohne Zeit und ohne
 * Zufallsquelle. Damit ist „was kostet Level 12, was trifft es und was faellt
 * dabei\" eine nachrechenbare Aussage und keine Behauptung aus einer Animation
 * — und sie ist ohne Browser pruefbar.
 *
 * VIER MECHANIKEN, EINE QUELLE JE MECHANIK.
 *   1. ESKALATION: jede Stufe multipliziert, nichts addiert. `ESCALATION.factor`
 *      ist die eine Zahl, aus der XP-Schwelle, Gegner-Lohn, Werte und Schaden
 *      folgen (Math.pow). Fuer den LEBENSLAUF (Summe allen Schadens) fuehrt der
 *      Client ein BigInt — dort sind Millionen exakt und nicht gerundet.
 *      `formatNumber` setzt Tausenderpunkte, `describeValue` nennt die
 *      Stellenzahl, damit der Sprung von zwei- auf fuenfstellig inszenierbar
 *      ist, ohne dass die Anzeige luegt. Die Leiter ist bei LEVEL_CAP gedeckelt
 *      (siehe dort), weil `Math.pow` sonst Infinity liefert und die Anzeige in
 *      Exponentialschreibweise ausbricht.
 *   2. REGELWERK: `ELEMENTS`/`ELEMENT_CHART` (Elementarkreis),
 *      `CATEGORY` (Verteidigungsdurchgriff), `SYNERGY` (Element mal Art),
 *      `BUFFS` (Zustandslagen) und `LINEAGE` (Vererbungsbaum der zehn Linien).
 *      Der Schaden ist BaseDamage * Element * Synergie * Buff - DEF * Durchgriff,
 *      also fuenf Nachschlagevorgaenge in festen Tabellen und KEINE Fallunter-
 *      scheidung ueber Zahlen. Das System rechnet nicht klug, es schlaegt nach;
 *      die Analyse muss der Spieler machen.
 *   3. PACING: `PACING.delayMs` ist die kuenstliche Rundendauer. Der Host nennt
 *      nur die Zahl und die Absage (LOCKED_TEXT); die Sperre selbst haelt der
 *      Client, weil dort der Zustand liegt.
 *   4. LOOT: `LOOT_TABLE` in Basispunkten (8500/1400/100 = 85/14/1 Prozent).
 *      `rollLoot(uniform)` ist eine reine Funktion eines Wertes aus [0,1) —
 *      derselbe Wurf ergibt immer dieselbe Beute, damit die Tabelle pruefbar
 *      ist und erst der Client echtes Math.random() einsetzt.
 *
 * Der Host entscheidet nichts und handelt nicht: er validiert die Parameter,
 * stellt die Vertragsfunktionen bereit und protokolliert die Aktivierung.
 * Alles Sichtbare — Pet, Arena, EXP — lebt im Client.
 *
 * ZEHN SPEZIES, ZWEI FAEIGKEITEN JE SPEZIES. `family` waehlt die Pixelart-Form
 * im Client (drei handgezeichnete Familien) und ist zugleich das ELEMENT der
 * Linie; die Spezies unterscheidet sich in Werten, Faehigkeiten und Vererbung.
 * Zehn eigene 16x16-Matrizen waeren 21 weitere handgezeichnete Sprites — die
 * gibt es nicht, und sie werden hier nicht erfunden.
 */

import {
  ABILITIES, BUFFS, ELEMENTS, ELEMENT_CHART, LINEAGE, LOOT_TABLE, LOOT_TOTAL,
  SPECIES, SPECIES_IDS,
} from './katalog.js';
import {
  GROWTH_BPS, LEVEL_CAP, XP_BASE, levelFor as levelFromXp,
  statAt, statsAt as scaleStats, threshold as xpThreshold,
} from './leiter.js';

export {
  ABILITIES, BUFFS, ELEMENTS, ELEMENT_CHART, LINEAGE, LOOT_TABLE, LOOT_TOTAL,
  SPECIES, SPECIES_IDS, LEVEL_CAP, XP_BASE,
};

// ── 1. PROGRESSION: Stufe 50, quadratische XP, lineare Grundwerte ──────────
export const ESCALATION = {
  growthBps: GROWTH_BPS,
  perLevel: '+12 % der Basiswerte',
  label: 'linear je Stufe',
};

export const POWER_UNIT = 10;

function cappedLevel(level) {
  if (!Number.isFinite(level)) throw new TypeError('Stufe muss endlich sein');
  return Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)));
}

/** Kompatibilitätsname: Werte wachsen linear um 12 % der Basiswerte je Stufe. */
export function powerAt(base, level) {
  return statAt(base, level);
}

export function powerAtExact(base, level) {
  return BigInt(powerAt(base, level));
}

export function formatNumber(value) {
  if (typeof value === 'bigint') return group(value.toString());
  if (typeof value === 'string') return /^-?\d+$/.test(value) ? group(value) : value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (!Number.isSafeInteger(Math.round(value))) return group(BigInt(Math.round(value)).toString());
  return group(String(Math.round(value)));
}

function group(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function describeValue(base, level) {
  const exact = powerAtExact(base, level);
  return { exact, text: formatNumber(exact), digits: String(exact).length, safe: exact <= BigInt(Number.MAX_SAFE_INTEGER) };
}

export function threshold(level, xpPerLevel = XP_BASE) {
  return xpThreshold(level, xpPerLevel);
}

export function levelFor(xp, xpPerLevel = XP_BASE) {
  return levelFromXp(xp, xpPerLevel);
}

export function statsAt(speciesId, level) {
  const species = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
  return scaleStats(species, cappedLevel(level));
}

export function statsAtExact(speciesId, level) {
  return Object.fromEntries(Object.entries(statsAt(speciesId, level))
    .map(([key, value]) => [key, BigInt(value)]));
}

export const MILESTONES = [10, 100, 1000, 10000, 1000000];

export function milestoneFor(before, after) {
  let hit = null;
  for (const mark of MILESTONES) if (Number(before) < mark && Number(after) >= mark) hit = mark;
  return hit;
}

// ── 2. REGELWERK (feste Tabellen, ein Nachschlagen je Faktor) ─────────────
/** Faehigkeitsarten: wie stark die Verteidigung des Ziels durchschlagen wird. */
export const ELEMENT_WIN = 1.5;
export const ELEMENT_LOSS = 0.75;

export const CATEGORY = {
  physisch: { label: 'physisch', defFactor: 0.8 },
  speziell: { label: 'speziell', defFactor: 0.35 },
};

/** Synergie: Element mal Art der Faehigkeit. Ein Nachschlagen, kein Zweig. */
export const SYNERGY = {
  'spark:physisch': 1,
  'spark:speziell': 1.25,
  'byte:physisch': 1,
  'byte:speziell': 1.25,
  'feral:physisch': 1,
  'feral:speziell': 1.25,
};

/** Der Buff, wenn nichts zutrifft. */
export const NEUTRAL_BUFF = { id: 'neutral', label: 'kein Buff', factor: 1 };

/** Die Bedingungen. Reine Praedikate ueber (Faehigkeit, Angreifer). */
export const BUFF_TESTS = {
  inherited: (ability, attacker) => attacker.inherited.includes(ability.id),
  'low-hp': (ability, attacker) => attacker.hp / Math.max(1, attacker.maxHp) < 0.25,
  'full-hp': (ability, attacker) => attacker.hp / Math.max(1, attacker.maxHp) >= 0.9,
};

/** Den ersten zutreffenden Buff nachschlagen. */
export function buffFor(ability, attacker) {
  for (const buff of BUFFS) {
    const test = BUFF_TESTS[buff.test];
    if (typeof test === 'function' && test(ability, attacker)) return buff;
  }
  return NEUTRAL_BUFF;
}

/** Faehigkeiten, die eine Spezies auf einer Stufe kennt (Grund- und Erbfaehigkeiten). */
export function abilitiesFor(level, speciesId) {
  const lineage = LINEAGE[speciesId] ?? LINEAGE[SPECIES_IDS[0]];
  const inherited = lineage.inherits ?? [];
  return ABILITIES.filter((ability) => ability.minLevel <= level
    && (ability.species === null || ability.species === speciesId || inherited.includes(ability.id)));
}

/** Die Erbfaehigkeiten einer Spezies (fuer den Buff und die Anzeige). */
export function inheritedAbilities(speciesId) {
  return (LINEAGE[speciesId] ?? LINEAGE[SPECIES_IDS[0]]).inherits ?? [];
}

/**
 * Der Schaden: BaseDamage * Element * Synergie * Buff - DEF * Durchgriff.
 * Fuenf Nachschlagevorgaenge in festen Tabellen, ein Minimum von 1. Keine
 * Zufallszahl, kein Krit, keine Ausnahme — derselbe Zug auf dieselbe Lage
 * ergibt immer denselben Schaden.
 */
export function resolveAttack(ability, attacker, defender) {
  const category = CATEGORY[ability.kind] ?? CATEGORY.physisch;
  const element = (ELEMENT_CHART[attacker.element] ?? ELEMENT_CHART.spark)[defender.element] ?? 1;
  const synergy = SYNERGY[`${attacker.element}:${ability.kind}`] ?? 1;
  const buff = buffFor(ability, attacker);
  const base = (ability.power * (attacker.stats[ability.stat] ?? 0)) / POWER_UNIT;
  const dealt = Math.max(1, Math.round(base * element * synergy * buff.factor - defender.stats.def * category.defFactor));
  return { base, element, synergy, category: ability.kind, defFactor: category.defFactor, buff, dealt };
}

/** Kurzform des Schadens (Zahl) fuer Stellen, die nur den Betrag brauchen. */
export function damage(ability, attacker, defender) {
  return resolveAttack(ability, attacker, defender).dealt;
}

/** Wer zuerst schlaegt: hoehere AGI, Gleichstand geht an den Herausforderer. */
export function firstStrike(challengerStats, enemyStats) {
  return challengerStats.agi >= enemyStats.agi ? 'challenger' : 'enemy';
}

/** XP fuer einen Sieg. Waechst mit dem Level des Gegners — multiplikativ. */
/**
 * D49: a battle reward is the next level's stat value at base 20, capped at L50.
 * This intentionally replaces the former XP_BASE * level multiplier; see the
 * explicit before/after table in the CodingMon 50 implementation contract.
 */
export function rewardFor(level) {
  return powerAt(20, Math.min(LEVEL_CAP, Math.max(1, Math.floor(level) + 1)));
}

/**
 * Der Gegner einer Runde — DETERMINISTISCH aus (Level, Runde). Kein Zufall:
 * ein Kampf, den man nicht nachrechnen kann, ist kein Vertrag. Die Runde kommt
 * vom Client und zaehlt hoch, damit dieselbe Lage nicht zweimal denselben
 * Gegner stellt; das Level darf um eine Stufe schwanken, tiefer als 1 nie.
 */
export function arenaFor(level, round) {
  const lvl = Math.max(1, Math.floor(level));
  const rnd = Math.max(0, Math.floor(round));
  const speciesId = SPECIES_IDS[(lvl * 3 + rnd * 7) % SPECIES_IDS.length];
  const enemyLevel = Math.min(LEVEL_CAP, Math.max(1, lvl + ((rnd % 3) - 1)));
  return {
    speciesId,
    element: SPECIES[speciesId].family,
    level: enemyLevel,
    stats: statsAt(speciesId, enemyLevel),
    reward: rewardFor(enemyLevel),
  };
}

// ── 3. PACING (kuenstliche Rundendauer) ───────────────────────────────────
/**
 * Kein Echtzeitdruck: ein Zug sperrt den Zustand, das Ergebnis kommt verzoegert.
 * Die Absage an jeden weiteren Input steht hier, damit Host und Client
 * denselben Satz benutzen und eine Probe ihn pruefen kann.
 */
export const PACING = {
  delayMs: 3000,
  lockedText: 'Codermon ist im Kampf, warte auf das Ergebnis',
};

// ── 4. LOOT (weighted table comes from the canonical catalogue) ─────────
// LOOT_TABLE and LOOT_TOTAL are imported from ./katalog.js above.

/**
 * Der Wurf: `uniform` aus [0,1) wird auf die kumulierten Gewichte abgebildet.
 * Reine Funktion — der Client reicht Math.random() hinein, eine Probe eine
 * feste Folge. Der hoehere Treffer gewinnt den Gleichstand nicht: die Grenzen
 * sind halboffen, deshalb ist jede Quote exakt ihr Gewicht.
 *
 * FAIL-CLOSED: ein nicht endlicher Wert (NaN, Infinity, Text, undefined) wird
 * als 0 gelesen. Sonst liefe er durch jeden Vergleich und die Funktion gaebe
 * die SELTENSTE Stufe aus — ein kaputter Eingabewert duerfte nicht der Jackpot
 * sein. Der Client spiegelt diese Zeile (client.js, `rollLoot`).
 */
export function rollLoot(uniform) {
  const clamped = Number.isFinite(uniform) ? Math.min(1, Math.max(0, uniform)) : 0;
  const point = Math.min(LOOT_TOTAL - 1, Math.floor(clamped * LOOT_TOTAL));
  let acc = 0;
  for (const entry of LOOT_TABLE) {
    acc += entry.weight;
    if (point < acc) return entry;
  }
  return LOOT_TABLE[LOOT_TABLE.length - 1];
}

/** Die Quote eines Loots in Prozent, wie die Anzeige sie nennt. */
export function lootOdds(entry) {
  return Number(((entry.weight / LOOT_TOTAL) * 100).toFixed(2));
}

// ── 5. SPAWN (Wild-Spawn aus erfolgreicher Agent-Arbeit) ───────────────────
/**
 * Die Spawn-Rate haengt an ABGESCHLOSSENEN Schritten, nicht an Tokens (J3):
 * Der Host zaehlt `running` -> `idle`-Wechsel von `agent/status` (Quelle ist
 * DSHs Agent-Loop, kein Shinon-Paket), der Client fragt den Zaehler ueber den
 * Remote-Endpunkt und rechnet HIER, ob etwas erscheint. Reine Funktion aus
 * (Zaehler, Stufe): derselbe Zaehler ergibt immer dasselbe Wild — kein Zufall,
 * kein Timer, keine zweite Wahrheit neben `arenaFor`.
 */
/** Jeder wievielte abgeschlossene Schritt ein Wild-Spawn ausloest. */
export const SPAWN_EVERY = 3;

/**
 * Das Wild-Spawn zu einem Zaehlerstand — oder `null`, wenn keines ansteht.
 * Die Art streut deterministisch ueber den Zaehler, die Stufe schwankt wie in
 * `arenaFor` um hoechstens eine Stufe (nie unter 1).
 * @param {number} completions - abgeschlossene Agent-Schritte (>= 0).
 * @param {number} level - Stufe des eigenen Codemons.
 * @returns {object|null} `{ speciesId, element, level }` oder `null`.
 */
export function spawnFor(completions, level) {
  const done = Math.max(0, Math.floor(completions ?? 0));
  if (done <= 0 || done % SPAWN_EVERY !== 0) return null;
  const lvl = Math.max(1, Math.floor(level ?? 1));
  const speciesId = SPECIES_IDS[(done * 7 + 3) % SPECIES_IDS.length];
  return {
    speciesId,
    element: SPECIES[speciesId].family,
    level: Math.min(LEVEL_CAP, Math.max(1, lvl + ((done % 3) - 1))),
  };
}

/**
 * Die Typwirkung als Zeichen statt Tabelle: Faktor plus Symbol fuer die
 * Kampfansicht (`×1,5` mit Pfeil, kein Matrix-`<table>`). Die Zahl ist
 * dieselbe wie in `resolveAttack` — ein Nachschlagen, kein Zweig.
 * @param {string} attackerElement - Element des Angreifers.
 * @param {string} defenderElement - Element des Ziels.
 * @returns {{factor: number, symbol: string}} `▲` wirksam, `●` neutral, `▼` schwach.
 */
export function effectiveness(attackerElement, defenderElement) {
  const factor = (ELEMENT_CHART[attackerElement] ?? ELEMENT_CHART.spark)[defenderElement] ?? 1;
  return { factor, symbol: factor > 1 ? '▲' : factor < 1 ? '▼' : '●' };
}

/**
 * Konfigurationsschema fuer die Host-Haelfte: XP werden aus erfolgreichen
 * Agent-Completions abgeleitet, nicht aus einer Tokenrate.
 */
