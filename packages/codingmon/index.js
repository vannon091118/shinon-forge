import z from '@deepseek-ai/schemastery';

/**
 * @shinon/codingmon — das Pet.
 *
 * Der Host hält den VERTRAG, der Client hält den ZUSTAND. Diese Trennung ist
 * Absicht: die Level-Kurve, die Werteverteilung und die Attackentabelle sind
 * reine Funktionen ohne Zeit, Zufall oder Modell. Damit ist "wie stark ist ein
 * Pet auf Level 7" eine nachrechenbare Aussage und keine Behauptung aus einer
 * Animation.
 *
 * Der Host entscheidet nichts und handelt nicht: er validiert die Parameter,
 * stellt die Vertragsfunktionen bereit und protokolliert die Aktivierung.
 * Alles Sichtbare — Pet, Kaempfe, XP — lebt im Client.
 *
 * XP-Quelle (Client): 1 XP pro Token. Der Client liest den Token-Zaehler, den
 * die DSH-Oberflaeche ohnehin anzeigt. Das ist eine Bruecke, keine saubere
 * Naht — siehe den Hinweis in client.js.
 */

/** Basis-Werte je Spezies. Bestimmen Startwerte und Wachstumsprofil. */
export const SPECIES = {
  spark: { label: 'Spark', hue: 268, hp: 42, atk: 9, def: 7, agi: 8, int: 6 },
  byte: { label: 'Byte', hue: 212, hp: 38, atk: 7, def: 9, agi: 6, int: 10 },
  feral: { label: 'Feral', hue: 340, hp: 48, atk: 11, def: 6, agi: 9, int: 4 },
};

/** Wachstum je Levelstufe. Deterministisch, additiv, keine Zufallsanteile. */
export const GROWTH = { hp: 8, atk: 2, def: 2, agi: 1, int: 1 };

/**
 * Attackentabelle. `power` skaliert mit dem genannten Wert, `kind` sagt, ob
 * die Attacke physisch (ATK) oder speziell (INT) rechnet. `minLevel` ist die
 * Stufe, ab der die Attacke gelernt wird.
 */
export const ATTACKS = [
  { id: 'tackle', label: 'Tackle', stat: 'atk', power: 12, minLevel: 1, kind: 'physisch', species: null },
  { id: 'spark-jolt', label: 'Funkenschlag', stat: 'int', power: 14, minLevel: 2, kind: 'speziell', species: 'spark' },
  { id: 'data-frag', label: 'Datenfrag', stat: 'int', power: 14, minLevel: 2, kind: 'speziell', species: 'byte' },
  { id: 'claw-rush', label: 'Krallenlauf', stat: 'atk', power: 14, minLevel: 2, kind: 'physisch', species: 'feral' },
  { id: 'glitch-bite', label: 'Glitch Bite', stat: 'atk', power: 18, minLevel: 3, kind: 'physisch', species: null },
  { id: 'compile-beam', label: 'Compile Beam', stat: 'int', power: 20, minLevel: 5, kind: 'speziell', species: null },
  { id: 'thunder-chain', label: 'Donnerkette', stat: 'agi', power: 24, minLevel: 6, kind: 'physisch', species: 'spark' },
  { id: 'quarantine', label: 'Quarantaene', stat: 'int', power: 24, minLevel: 6, kind: 'speziell', species: 'byte' },
  { id: 'blood-rush', label: 'Blutrausch', stat: 'atk', power: 26, minLevel: 6, kind: 'physisch', species: 'feral' },
  { id: 'race-condition', label: 'Race Condition', stat: 'agi', power: 22, minLevel: 7, kind: 'physisch', species: null },
  { id: 'stack-overflow', label: 'Stack Overflow', stat: 'int', power: 28, minLevel: 10, kind: 'speziell', species: null },
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

/** Werte eines Pets auf einer Stufe. Reine Funktion. */
export function statsAt(speciesId, level) {
  const base = SPECIES[speciesId] ?? SPECIES.spark;
  const steps = Math.max(0, Math.floor(level) - 1);
  return {
    hp: base.hp + GROWTH.hp * steps,
    atk: base.atk + GROWTH.atk * steps,
    def: base.def + GROWTH.def * steps,
    agi: base.agi + GROWTH.agi * steps,
    int: base.int + GROWTH.int * steps,
  };
}

/** Attacken, die eine Stufe kennt. */
export function attacksFor(level) {
  return ATTACKS.filter((attack) => attack.minLevel <= level);
}

/** Schaden einer Attacke gegen eine Verteidigung. Mindestens 1, nie negativ. */
export function damage(attack, attackerStats, defenderDef) {
  const raw = (attack.power * (attackerStats[attack.stat] ?? 0)) / 10;
  return Math.max(1, Math.round(raw - defenderDef * 0.8));
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
  /** Start-Spezies (Schluessel aus SPECIES). */
  species: z.union([z.const('spark'), z.const('byte'), z.const('feral')]).default('spark'),
  /** Name des Pets; leer = der Client waehlt einen. */
  petName: z.string().default(''),
  /** Gleichzeitig aktive wilde Pets auf dem Fenster. */
  wildLimit: z.number().min(0).max(9).default(3),
  /** Ab wann ein Pet als idle gilt (ms ohne Turn). */
  idleAfterMs: z.number().min(250).default(4000),
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
    wildLimit: config.wildLimit,
    idleAfterMs: config.idleAfterMs,
    attacks: ATTACKS.map((attack) => ({ ...attack })),
    growth: { ...GROWTH },
  };

  console.log(
    `[shinon-codingmon] Aktiviert — ${ATTACKS.length} Attacken, ${Object.keys(SPECIES).length} Spezies, `
    + `${config.xpPerToken} XP/Token, Level-Kurve x${config.xpPerLevel} (${contract.version}, authority NONE)`,
  );

  // Kein Service am Kontext: `ctx.set` verlangt ein vorheriges `provide`, und
  // ein eigener Service waere hier unnoetig. Wer die Kurve braucht, importiert
  // die Named Exports dieses Moduls — dieselbe Quelle, kein Nachbau.
  return () => {
    console.log('[shinon-codingmon] Deaktiviert');
  };
}
