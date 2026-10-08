import z from '@deepseek-ai/schemastery';

/**
 * @shinon/codingmon — die Codemon-Engine (Host-Hälfte).
 *
 * Der Host hält den VERTRAG, der Client hält den ZUSTAND. Diese Trennung ist
 * Absicht: Level-Kurve, Werteverteilung, Faehigkeiten und die Auswahl des
 * Gegners sind reine Funktionen ohne Zeit, Zufall oder Modell. Damit ist
 * „wie stark ist Level 7 gegen Runde 4" eine nachrechenbare Aussage und keine
 * Behauptung aus einer Animation — und sie ist ohne Browser pruefbar.
 *
 * Der Host entscheidet nichts und handelt nicht: er validiert die Parameter,
 * stellt die Vertragsfunktionen bereit und protokolliert die Aktivierung.
 * Alles Sichtbare — Pet, Arena, XP — lebt im Client.
 *
 * ZEHN SPEZIES, ZWEI FAEHIGKEITEN JE SPEZIES. `family` waehlt die Pixelart-Form
 * im Client (drei handgezeichnete Familien), `hue` die Farbe; die Spezies
 * unterscheidet sich in Werten und Faehigkeiten. Zehn eigene 16x16-Matrizen
 * waeren 21 weitere handgezeichnete Sprites — die gibt es nicht, und sie werden
 * hier nicht erfunden: die Form kommt aus der Familie, die Identitaet aus den
 * Zahlen.
 *
 * XP-Quelle (Client): 1 XP pro Token. Der Client liest den Token-Zaehler, den
 * die DSH-Oberflaeche ohnehin anzeigt. Das ist eine Bruecke, keine saubere
 * Naht — siehe den Hinweis in client.js.
 */

/** Basis-Werte je Spezies. `family` = Pixelart-Form, `hue` = Farbe. */
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

/** Wachstum je Levelstufe. Deterministisch, additiv, keine Zufallsanteile. */
export const GROWTH = { hp: 8, atk: 2, def: 2, agi: 1, int: 1 };

/**
 * Faehigkeiten: eine neutrale Grundfaehigkeit fuer alle, plus genau ZWEI
 * Spezies-Faehigkeiten je Linie (Stufe 1 und Stufe 4 — der Aufstieg ist die
 * zweite Faehigkeit, nicht eine neue Spezies).
 *
 * `stat` traegt den Schaden, `kind` benennt die Art, `power` skaliert mit dem
 * Wert. Keine Zufallszahl, kein Krit, keine Ausnahme: derselbe Klick auf
 * dieselbe Lage ergibt immer denselben Schaden.
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

/**
 * Kumulative XP-Schwelle: XP, die man fuer `level` insgesamt braucht.
 * Level 1 = 0, Level 2 = base, Level 3 = base*3, Level 4 = base*6 …
 * Quadratisch, damit spaete Level wirklich Arbeit kosten.
 */
export function threshold(level, xpPerLevel) {
  const l = Math.max(1, Math.floor(level));
  return (xpPerLevel * (l - 1) * l) / 2;
}

/** Level zu einer XP-Summe. Umkehrung von threshold. */
export function levelFor(xp, xpPerLevel) {
  let level = 1;
  while (threshold(level + 1, xpPerLevel) <= xp) level += 1;
  return level;
}

/** Werte eines Codemons auf einer Stufe. Reine Funktion. */
export function statsAt(speciesId, level) {
  const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
  const steps = Math.max(0, Math.floor(level) - 1);
  return {
    hp: base.hp + GROWTH.hp * steps,
    atk: base.atk + GROWTH.atk * steps,
    def: base.def + GROWTH.def * steps,
    agi: base.agi + GROWTH.agi * steps,
    int: base.int + GROWTH.int * steps,
  };
}

/** Faehigkeiten, die eine Spezies auf einer Stufe kennt (Grundfaehigkeit inklusive). */
export function abilitiesFor(level, speciesId) {
  return ABILITIES.filter((ability) => ability.minLevel <= level
    && (ability.species === null || ability.species === speciesId));
}

/** Schaden einer Faehigkeit gegen eine Verteidigung. Mindestens 1, nie negativ. */
export function damage(ability, attackerStats, defenderDef) {
  const raw = (ability.power * (attackerStats[ability.stat] ?? 0)) / 10;
  return Math.max(1, Math.round(raw - defenderDef * 0.8));
}

/** Wer zuerst schlaegt: hoehere AGI, Gleichstand geht an den Herausforderer. */
export function firstStrike(challengerStats, enemyStats) {
  return challengerStats.agi >= enemyStats.agi ? 'challenger' : 'enemy';
}

/** XP fuer einen Sieg. Waechst mit dem Level des Gegners, nicht mit seiner Art. */
export function rewardFor(level) {
  return 20 + 8 * Math.max(1, Math.floor(level));
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
  return { speciesId, level: enemyLevel, stats: statsAt(speciesId, enemyLevel), reward: rewardFor(enemyLevel) };
}

/**
 * Codingmon-Konfiguration (Schemastery).
 * `xpPerToken` ist der Vertrag aus dem Auftrag: jeder Token ist genau 1 XP.
 */
export const Config = z.object({
  /** XP pro Token. Der Auftrag sagt 1. */
  xpPerToken: z.number().min(0).default(1),
  /** XP-Basis je Levelstufe (kumulativ quadratisch). */
  xpPerLevel: z.number().min(1).default(250),
  /** Start-Spezies (Schluessel aus SPECIES). Schemastery 3.18.4 kennt kein z.enum. */
  species: z.union(SPECIES_IDS.map((id) => z.const(id))).default(SPECIES_IDS[0]),
  /** Name des Pets; leer = der Client waehlt einen. */
  petName: z.string().default(''),
  /** Kanaele, auf denen der Spine Ereignisse liefert (nur Beobachtung). */
  eventsChannel: z.string().default('shinon/event'),
});

export function apply(ctx, config) {
  // Der Vertrag ist reine Datenweitergabe: keine Zeit, kein Zufall, kein Modell.
  const contract = {
    version: 'shinon.codingmon/v1',
    xpPerToken: config.xpPerToken,
    xpPerLevel: config.xpPerLevel,
    species: config.species,
    speciesCount: SPECIES_IDS.length,
    abilities: ABILITIES.map((ability) => ({ ...ability })),
    growth: { ...GROWTH },
  };

  console.log(
    `[shinon-codingmon] Aktiviert — ${ABILITIES.length} Faehigkeiten, ${SPECIES_IDS.length} Spezies `
    + `(${contract.version}, authority NONE)`,
  );

  // Kein Service am Kontext: `ctx.set` verlangt ein vorheriges `provide`, und
  // ein eigener Service waere hier unnoetig. Wer die Kurve braucht, importiert
  // die Named Exports dieses Moduls — dieselbe Quelle, kein Nachbau.
  return () => {
    console.log('[shinon-codingmon] Deaktiviert');
  };
}
