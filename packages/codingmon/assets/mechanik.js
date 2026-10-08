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

/** Basis-Werte je Spezies. `family` = Pixelart-Form UND Element, `hue` = Farbe. */
export const SPECIES = {
  nullpointer: { label: 'NullPointer', family: 'spark', hue: 268, hp: 44, atk: 10, def: 6, agi: 9, int: 8 },
  stackoverflow: { label: 'StackOverflow', family: 'byte', hue: 10, hp: 40, atk: 8, def: 7, agi: 7, int: 12 },
  memoryleak: { label: 'MemoryLeak', family: 'feral', hue: 96, hp: 58, atk: 9, def: 5, agi: 5, int: 9 },
  racecondition: { label: 'RaceCondition', family: 'spark', hue: 190, hp: 36, atk: 8, def: 6, agi: 14, int: 7 },
  deadlock: { label: 'Deadlock', family: 'byte', hue: 264, hp: 62, atk: 8, def: 12, agi: 3, int: 6 },
  segfault: { label: 'SegFault', family: 'feral', hue: 0, hp: 46, atk: 13, def: 6, agi: 8, int: 4 },
  offbyone: { label: 'OffByOne', family: 'spark', hue: 40, hp: 38, atk: 9, def: 7, agi: 11, int: 8 },
  bufferoverflow: { label: 'BufferOverflow', family: 'feral', hue: 320, hp: 54, atk: 12, def: 8, agi: 5, int: 5 },
  heisenbug: { label: 'Heisenbug', family: 'byte', hue: 285, hp: 42, atk: 7, def: 6, agi: 10, int: 13 },
  recursion: { label: 'Recursion', family: 'spark', hue: 150, hp: 50, atk: 10, def: 9, agi: 6, int: 9 },
};

/** Die zehn Spezies-Schluessel in Vertragsreihenfolge. */
export const SPECIES_IDS = Object.keys(SPECIES);

// ── 1. ESKALATION ─────────────────────────────────────────────────────────
/**
 * Die eine Zahl, aus der alles waechst: jede Stufe multipliziert mit 1,35.
 * Nichts wird addiert — deshalb ist der Abstand zwischen Level 3 und Level 20
 * kein Gefuehl, sondern 1,35 hoch 17.
 */
export const ESCALATION = { factor: 1.35, perLevel: 'x1,35', label: 'multiplikativ je Stufe' };
/** XP-Basis der ersten Stufe (kumulativ, exponentiell). */
export const XP_BASE = 250;
/** Schadens-Einheit: Kraft x Faehigkeitsstaerke / 10. */
export const POWER_UNIT = 10;

/**
 * DIE DECKE DER LEITER: Stufe 2000. Sie ist kein Spielgefuehl, sondern die
 * Grenze, ab der die ANZEIGE kaputtgeht. 1,35 hoch 1999 ist rund 1e260 — noch
 * eine endliche Number (Number.MAX_VALUE liegt bei 1,8e308), aber ab Stufe
 * ~2363 liefert `Math.pow` Infinity und jeder Wert wird NaN. Ohne Decke stand
 * im Panel „HP 4.721837931227852e+298" und „Stellen: 1": eine Anzeige, die
 * luegt und niemandem etwas beweist. Mit Decke bleibt die Number-Leiter endlich
 * (`statsAt`), und die exakte BigInt-Leiter (`statsAtExact`) druckt Ziffern.
 * Die Decke ist Teil des Vertrags: `contract.escalation.levelCap`.
 */
export const LEVEL_CAP = 2000;

/** Die Stufe, wie die Leiter sie zaehlt: ganzzahlig, mindestens 1, hoechstens LEVEL_CAP. */
function cappedLevel(level) {
  return Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)));
}

/** Die Leiter als Zahl: `base * factor^(level-1)`, bei LEVEL_CAP gedeckelt. */
export function powerAt(base, level) {
  return Math.round(base * Math.pow(ESCALATION.factor, cappedLevel(level) - 1));
}

/**
 * Dieselbe Leiter EXAKT in BigInt (Basis 135/100, ganzzahlig geteilt). Fuer
 * den Lebenslauf: dort steht der Schaden in Millionen und soll trotzdem eine
 * Zahl bleiben, die man nachrechnen kann. Die Rundungsstelle ist dieselbe wie
 * bei `powerAt`, weil BigInt ganzzahlig abschneidet.
 */
export function powerAtExact(base, level) {
  const steps = BigInt(cappedLevel(level) - 1);
  const scaled = BigInt(Math.round(base)) * (135n ** steps);
  return scaled / (100n ** steps);
}

/**
 * Tausenderpunkte. Nimmt Number und BigInt — und bricht NICHT in
 * Exponentialschreibweise aus: eine Zahl ab 2^53 wird ueber ihren exakten
 * Ganzzahlwert (BigInt) gedruckt, sonst stuende dort '4.7e+298'. Das ist der
 * Unterschied zwischen „die Nullen zaehlen" und „die Nullen erraten".
 */
export function formatNumber(value) {
  if (typeof value === 'bigint') return group(value.toString());
  // Der reine Dezimaltext eines BigInt (so liegt er in JSON): „1e+300" ist
  // KEIN Zifferntext und wird unveraendert durchgereicht, 301 Ziffern werden
  // gruppiert.
  if (typeof value === 'string') return /^-?\d+$/.test(value) ? group(value) : value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (!Number.isSafeInteger(Math.round(value))) return group(BigInt(Math.round(value)).toString());
  return group(String(Math.round(value)));
}

function group(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Ein Wert samt Inszenierung: exakter Betrag, Anzeigetext mit Trennzeichen,
 * Stellenzahl und ob er noch verlustfrei in eine Number passt. Die Stellenzahl
 * ist der Anker fuer die Meilensteine (zweistellig -> fuenfstellig).
 */
export function describeValue(base, level) {
  const exact = powerAtExact(base, level);
  const digits = String(exact).length;
  return { exact, text: formatNumber(exact), digits, safe: exact <= BigInt(Number.MAX_SAFE_INTEGER) };
}

/** Kumulative XP-Schwelle: XP, die man fuer `level` insgesamt braucht. */
export function threshold(level, xpPerLevel = XP_BASE) {
  const steps = cappedLevel(level) - 1;
  return Math.round((xpPerLevel * (Math.pow(ESCALATION.factor, steps) - 1)) / (ESCALATION.factor - 1));
}

/** Level zu einer XP-Summe. Umkehrung von threshold. */
export function levelFor(xp, xpPerLevel = XP_BASE) {
  let level = 1;
  while (level < LEVEL_CAP && threshold(level + 1, xpPerLevel) <= xp) level += 1;
  return level;
}

/** Werte eines Codemons auf einer Stufe. Reine Funktion, multiplikativ. */
export function statsAt(speciesId, level) {
  const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
  const scale = Math.pow(ESCALATION.factor, cappedLevel(level) - 1);
  return {
    hp: Math.round(base.hp * scale),
    atk: Math.round(base.atk * scale),
    def: Math.round(base.def * scale),
    agi: Math.round(base.agi * scale),
    int: Math.round(base.int * scale),
  };
}

/**
 * Dieselben Werte EXAKT (BigInt, dieselbe 135/100-Leiter). Fuer die Anzeige:
 * eine Zahl mit 299 Stellen ist in Number nicht darstellbar, und `Math.pow`
 * liefert dort '4.7e+298' statt Ziffern. Rechnen darf weiter die schnelle
 * Number-Fassung; ANZEIGEN muss die exakte Fassung.
 */
export function statsAtExact(speciesId, level) {
  const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
  return {
    hp: powerAtExact(base.hp, level),
    atk: powerAtExact(base.atk, level),
    def: powerAtExact(base.def, level),
    agi: powerAtExact(base.agi, level),
    int: powerAtExact(base.int, level),
  };
}

/**
 * Meilensteine: zweistellig, dreistellig, vierstellig, fuenfstellig, dann die
 * Millionen. `milestoneFor(before, after)` nennt den hoechsten Sprung, damit
 * die Anzeige genau einmal feiert und nicht bei jedem Treffer.
 */
export const MILESTONES = [10, 100, 1000, 10000, 1000000];

export function milestoneFor(before, after) {
  let hit = null;
  for (const mark of MILESTONES) if (Number(before) < mark && Number(after) >= mark) hit = mark;
  return hit;
}

// ── 2. REGELWERK (feste Tabellen, ein Nachschlagen je Faktor) ─────────────
/**
 * Elementarkreis der drei Familien: Spark schlaegt Byte, Byte schlaegt Feral,
 * Feral schlaegt Spark. `beats`/`losesTo` sind die Quelle, `ELEMENT_CHART` ist
 * daraus GEBAUT — eine Quelle, kein zweites Zahlengedaechtnis.
 */
export const ELEMENTS = {
  spark: { label: 'Spark', beats: 'byte', losesTo: 'feral' },
  byte: { label: 'Byte', beats: 'feral', losesTo: 'spark' },
  feral: { label: 'Feral', beats: 'spark', losesTo: 'byte' },
};

/** Multiplikatoren: 1,5 gegen das geschlagene, 0,75 gegen das siegende Element. */
export const ELEMENT_WIN = 1.5;
export const ELEMENT_LOSS = 0.75;

export const ELEMENT_CHART = Object.fromEntries(Object.entries(ELEMENTS).map(([attacker, entry]) => [
  attacker,
  Object.fromEntries(Object.keys(ELEMENTS).map((defender) => [
    defender,
    defender === entry.beats ? ELEMENT_WIN : defender === entry.losesTo ? ELEMENT_LOSS : 1,
  ])),
]));

/** Faehigkeitsarten: wie stark die Verteidigung des Ziels durchschlagen wird. */
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

/**
 * Vererbungsbaum der zehn Linien: je Spezies der Ahn, die Generation und die
 * Faehigkeit, die sie von ihrer Linie erbt. Die Generation ist ein Nachschlagen
 * (`LINEAGE[id].generation`), und wer eine geerbte Faehigkeit benutzt, kaempft
 * mit der reinen Linie (Buff `linie`).
 */
export const LINEAGE = {
  nullpointer: { ancestor: null, generation: 1, inherits: [] },
  stackoverflow: { ancestor: null, generation: 1, inherits: [] },
  memoryleak: { ancestor: null, generation: 1, inherits: [] },
  racecondition: { ancestor: 'nullpointer', generation: 2, inherits: ['null-access'] },
  deadlock: { ancestor: 'stackoverflow', generation: 2, inherits: ['trace-back'] },
  segfault: { ancestor: 'memoryleak', generation: 2, inherits: ['heap-flood'] },
  offbyone: { ancestor: 'racecondition', generation: 3, inherits: ['torn-read'] },
  heisenbug: { ancestor: 'deadlock', generation: 3, inherits: ['starve'] },
  bufferoverflow: { ancestor: 'segfault', generation: 3, inherits: ['core-dump'] },
  recursion: { ancestor: 'offbyone', generation: 4, inherits: ['boundary-slip'] },
};

/** Der Buff, wenn nichts zutrifft. */
export const NEUTRAL_BUFF = { id: 'neutral', label: 'kein Buff', factor: 1 };

/**
 * Buffs als Tabelle: Name, Faktor und die Lage, in der sie gilt. `test` ist ein
 * Schluessel in BUFF_TESTS — die Lage wird nicht im Schadenspfad ausgewertet,
 * sondern nachgeschlagen.
 */
export const BUFFS = [
  { id: 'linie', label: 'Reine Linie', factor: 1.1, test: 'inherited' },
  { id: 'nichts-zu-verlieren', label: 'Nichts zu verlieren', factor: 1.5, test: 'low-hp' },
  { id: 'uebertaktet', label: 'Uebertaktet', factor: 1.15, test: 'full-hp' },
];

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

/**
 * Faehigkeiten: eine neutrale Grundfaehigkeit fuer alle, plus genau ZWEI
 * Spezies-Faehigkeiten je Linie (Stufe 1 und Stufe 4 — der Aufstieg ist die
 * zweite Faehigkeit, nicht eine neue Spezies).
 */
export const ABILITIES = [
  { id: 'tackle', label: 'Tackle', stat: 'atk', power: 12, minLevel: 1, kind: 'physisch', species: null },

  { id: 'deref', label: 'Deref', stat: 'atk', power: 15, minLevel: 1, kind: 'physisch', species: 'nullpointer' },
  { id: 'null-access', label: 'Nullzugriff', stat: 'int', power: 18, minLevel: 4, kind: 'speziell', species: 'nullpointer' },

  { id: 'recursion-dive', label: 'Recursion Dive', stat: 'int', power: 16, minLevel: 1, kind: 'speziell', species: 'stackoverflow' },
  { id: 'trace-back', label: 'Trace Back', stat: 'int', power: 20, minLevel: 4, kind: 'speziell', species: 'stackoverflow' },

  { id: 'page-fault', label: 'Page Fault', stat: 'atk', power: 14, minLevel: 1, kind: 'physisch', species: 'memoryleak' },
  { id: 'heap-flood', label: 'Heap Flood', stat: 'int', power: 20, minLevel: 4, kind: 'speziell', species: 'memoryleak' },

  { id: 'interleave', label: 'Interleave', stat: 'agi', power: 16, minLevel: 1, kind: 'physisch', species: 'racecondition' },
  { id: 'torn-read', label: 'Torn Read', stat: 'agi', power: 20, minLevel: 4, kind: 'physisch', species: 'racecondition' },

  { id: 'barrier', label: 'Barriere', stat: 'def', power: 18, minLevel: 1, kind: 'physisch', species: 'deadlock' },
  { id: 'starve', label: 'Starve', stat: 'int', power: 16, minLevel: 4, kind: 'speziell', species: 'deadlock' },

  { id: 'dangling-pointer', label: 'Dangling Pointer', stat: 'atk', power: 17, minLevel: 1, kind: 'physisch', species: 'segfault' },
  { id: 'core-dump', label: 'Core Dump', stat: 'atk', power: 22, minLevel: 4, kind: 'physisch', species: 'segfault' },

  { id: 'nudge', label: 'Nudge', stat: 'agi', power: 14, minLevel: 1, kind: 'physisch', species: 'offbyone' },
  { id: 'boundary-slip', label: 'Boundary Slip', stat: 'agi', power: 18, minLevel: 4, kind: 'physisch', species: 'offbyone' },

  { id: 'smash', label: 'Smash', stat: 'atk', power: 18, minLevel: 1, kind: 'physisch', species: 'bufferoverflow' },
  { id: 'stack-smash', label: 'Stack Smash', stat: 'atk', power: 23, minLevel: 4, kind: 'physisch', species: 'bufferoverflow' },

  { id: 'obfuscate', label: 'Obfuscate', stat: 'int', power: 15, minLevel: 1, kind: 'speziell', species: 'heisenbug' },
  { id: 'observation-collapse', label: 'Observation Collapse', stat: 'int', power: 21, minLevel: 4, kind: 'speziell', species: 'heisenbug' },

  { id: 'base-case', label: 'Base Case', stat: 'def', power: 16, minLevel: 1, kind: 'physisch', species: 'recursion' },
  { id: 'infinite-descent', label: 'Infinite Descent', stat: 'atk', power: 21, minLevel: 4, kind: 'physisch', species: 'recursion' },
];

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
export function rewardFor(level) {
  return powerAt(20, Math.max(1, Math.floor(level)) + 1);
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
  const enemyLevel = Math.max(1, lvl + ((rnd % 3) - 1));
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

// ── 4. LOOT (gewichteter Wurf in Basispunkten) ────────────────────────────
/**
 * Die Skinner-Box: 85 Prozent Schrott, 14 Prozent Brauchbares, 1 Prozent
 * Shiny. Gewichte in Basispunkten, Summe 10000 — die Quote ist damit exakt
 * ablesbar und nicht gerundet.
 */
export const LOOT_TABLE = [
  { id: 'schrott', label: 'Schrott', weight: 8500, xp: 0 },
  { id: 'brauchbar', label: 'Brauchbares Teil', weight: 1400, xp: 25 },
  { id: 'shiny', label: 'Shiny God-Tier', weight: 100, xp: 2500 },
];

/** Gesamtgewicht: der Nenner der Quote. */
export const LOOT_TOTAL = LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

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

/**
 * Codingmon-Konfiguration (Schemastery).
 * `xpPerToken` ist der Vertrag aus dem Auftrag: jeder Token ist genau 1 XP.
 */
