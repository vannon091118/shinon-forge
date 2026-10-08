/**
 * @shinon/codingmon — Client-Hälfte (Codemons + Arena).
 *
 * Codemon ersetzt das Helmchen in `sidebar.brand.mark` und
 * `conversation.hero.brand.mark`. Der Austausch laeuft ueber eine
 * Fenster-Konvention, nicht ueber einen Import: dieser Client legt
 * `window.__codingmon` mit `PetMark` an, und @shinon/core rendert die Marke
 * nur dann selbst, wenn dort nichts liegt. Dasselbe Muster benutzt
 * @shinon/markers bereits mit `window.__mk` — Pakete bleiben so referenzfrei.
 *
 * ZEHN CODEMONS: Werte, Faehigkeiten und Gegnerauswahl stehen in `SPECIES`,
 * `ABILITIES` und `arenaFor()` — gespiegelt aus der Host-Hälfte in index.js.
 * Der Client haelt keinen eigenen Vertrag: dieselbe Formel, dieselbe Tabelle,
 * dieselbe Reihenfolge. Was hier zusaetzlich lebt, ist ZUSTAND (XP, HP, Runde)
 * und Darstellung.
 *
 * KAMPF: rundenbasiert, ausgeloest durch Klick. Der Challenger waehlt eine
 * Faehigkeit, der Gegner antwortet sofort mit seiner eigenen — kein Timer,
 * kein Autoplay, keine Hintergrundschleife. Wer zuerst schlaegt, entscheidet
 * die AGI (Gleichstand an den Herausforderer). Jede Zahl im Log kommt aus
 * einer reinen Funktion (damage), nicht aus einer Animation.
 *
 * XP: 1 XP pro Token aus dem Zaehler der Oberflaeche — und XP fuer jeden Sieg.
 * Der Token-Zaehler ist bewusst eine BRUECKE und keine saubere Naht: stabil
 * genug fuer ein Pet, aber die erste Stelle, die man ersetzt, sobald der
 * Client eine Store- oder Service-Naht fuer Usage hat. `xpFromTokens()` ist
 * deshalb die einzige Stelle, die die Quelle kennt.
 */
window.__ModuleLoader__.load({
  id: '@shinon/codingmon',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/codingmon';
    const PANEL_ID = 'shinon-codingmon';
    /** Speicher-Schluessel. Bleibt derselbe, damit alte Staende nicht verloren gehen. */
    const STORAGE_KEY = 'shinon.codingmon/v1';
    /** Stand der Ablage. v2 = Eskalation, Regelwerk, Loot, Sperre. */
    const STORE_VERSION = 2;
    /** XP-Basis der ersten Stufe (kumulativ, exponentiell). */
    const XP_BASE = 250;

    // ── Vertrag (Spiegel der Host-Hälfte in index.js) ───────────────────────
    // Bewusst dupliziert: Client- und Host-Bundle teilen keinen Code, und ein
    // Import quer ueber Pakete ist in diesem Repo nicht erlaubt.
    const SPECIES = {
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
    const SPECIES_IDS = Object.keys(SPECIES);


    /**
     * Faehigkeiten. `species === null` = von jedem Codemon nutzbar; sonst eine
     * der ZWEI Spezies-Faehigkeiten (Stufe 1 und Stufe 4). `stat` bestimmt, ob
     * die Faehigkeit ueber Kraft (ATK), Tempo (AGI), Verstand (INT) oder
     * Verteidigung (DEF) rechnet — dadurch spielen sich die zehn Linien
     * wirklich unterschiedlich und nicht nur in der Farbe.
     */
    const ABILITIES = [
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
     * Entwicklungsstufen. Jede Familie hat genau drei Formen; die Stufe haengt
     * am Level, nicht am Zufall. Reihenfolge = Index in SPRITES.
     */
    const STAGES = [
      { at: 1, label: 'Basis', from: 1 },
      { at: 5, label: 'Entwickelt', from: 5 },
      { at: 10, label: 'Final', from: 10 },
    ];
    const stageIndex = (level) => {
      let index = 0;
      for (let i = 0; i < STAGES.length; i += 1) if (level >= STAGES[i].from) index = i;
      return index;
    };

    /**
     * Pixelart, 16x16, ein Zeichen je Pixel. Keine fremden Assets: die
     * Sprites sind hier als Daten authored, damit das Bundle vierteilig
     * bleibt, der Diff lesbar ist und keine Lizenzfrage entsteht.
     *
     * Die zehn Spezies teilen sich DREI Familien — die Form kommt aus der
     * Familie, die Identitaet aus Werten, Faehigkeiten und Farbton. Zehn eigene
     * Matrizen waeren 21 weitere handgezeichnete Sprites; sie werden nicht
     * erfunden, sondern benannt.
     *
     *   .  transparent        o  Outline
     *   a  hell               b  Koerper      c  Schatten
     *   w  Augenweiss         e  Pupille      y  Akzent (Blitz/Horn/Flamme)
     */
    const SPRITES = {
      spark: [
        [
          '................', '.......oo.......', '......oyyo......', '.......oo.......',
          '....ooooooo.....', '...oaaaaaaao....', '...oabbbbbao....', '...oaweeweao....',
          '...oaebbeaao....', '...oabbbbbao....', '....oabbbao.....', '....oabbbao.....',
          '.....ooboo......', '......o.o.......', '................', '................',
        ],
        [
          '................', '....o......o....', '...oyo....oyo...', '....oo....oo....',
          '...oooooooooo...', '..oaaaaaaaaaao..', '..oabbbbbbbbao..', '..oaweebbeewao..',
          '..oaebbbbbbeao..', '..oabbbbbbbbao..', '...oabbbbbbao...', '...oabbbbbbao...',
          '....oobbbboo....', '...oo..oo..oo...', '..oyy......yyo..', '................',
        ],
        [
          '......oyyo......', '.....oyxxyo.....', '....o.o..o.o....', '...ooyo..oyoo...',
          '..oooooooooooo..', '.oaaaaaaaaaaaaao', '.oabbbbbbbbbbbao', '.oaweebbbbeewao.',
          '.oaebbbbbbbbeao.', '.oabbbbbbbbbbbao', '..oabbbbbbbbao..', '..oabbbbbbbbao..',
          '...oobbbbbboo...', '..oo.oooooo.oo..', '.oyyo..oo..oyyo.', 'oyyo........oyyo',
        ],
      ],
      byte: [
        [
          '................', '................', '.....oooooo.....', '....obbbbbbo....',
          '....obbbaabo....', '....obweewbo....', '....obbeebbo....', '.....obbbbo.....',
          '.....ocbbco.....', '....oaabbaao....', '...oabbbbbbao...', '...oabbbbbbao...',
          '....oo....oo....', '...oyy....yyo...', '................', '................',
        ],
        [
          '......oooo......', '.....obbbbo.....', '.....obbbbo.....', '....obbbbbbo....',
          '....obweewebo...', '....obbeebbo....', '.....obbbbo.....', '...ooocbbcooo...',
          '..oaabbbbbbaao..', '..oabbbbbbbbao..', '..oabbbbbbbbao..', '..oabcbbbbcbao..',
          '...ooobbbbooo...', '....oo....oo....', '...oyyo..oyyo...', '................',
        ],
        [
          '...o...oo...o...', '..oyo.obbo.oyo..', '...o..obbo..o...', '..oooooooooooo..',
          '.oobbbbbbbbbboo.', '.obbbbbbbbbbbbo.', '.obwbbbbbbbbwbo.', '.obewbbbbbbwebo.',
          '.obbbbbbbbbbbbo.', '.obbbbcbbbcbbbo.', '.oabbbbbbbbbbao.', '.oabbbbbbbbbbao.',
          '..ooobbbbbbooo..', '...oo.oooo.oo...', '..oyyo....oyyo..', '.oyyo......oyyo.',
        ],
      ],
      feral: [
        [
          '................', '................', '...o........o...', '..oyo......oyo..',
          '..oo.oooooo.oo..', '...oobbbbbboo...', '...obwaaawbo....', '...obeeeeeebo...',
          '...obbbbbbbbo...', '....oobbbbboo...', '....oobbbboo....', '.....oo..oo.....',
          '....oyo..oyo....', '................', '................', '................',
        ],
        [
          '..o..........o..', '.oyo........oyo.', '.oo..oooooo..oo.', '..o.obbbbbbo.o..',
          '..oobbbbbbbboo..', '..obbbbbbbbbbo..', '..obwaabbaawbo..', '..obeebbbbeebo..',
          '..obbbbbbbbbbo..', '...obbbbbbbbo...', '...oabcbbcbao...', '....oo...oo.....',
          '...oyo...oyo....', '..oyyo...oyyo...', '................', '................',
        ],
        [
          '.o............o.', 'oyo..........oyo', 'oo...oooooo...oo', '.o.oobbbbbboo.o.', '..oobbbbbbbboo..',
          '.oobbbbbbbbbboo.', '.obbbbbbbbbbbbo.', '.obwaabbbbaawbo.', '.obeebbbbbbeebo.',
          '.obbbbbbbbbbbbo.', '.oabbbcbbbcbbao.', '.oabbbbbbbbbbao.', '..ooobbbbbbooo..',
          '...oo.oooo.oo...', '..oyyo....oyyo..', '.oyyo......oyyo.',
        ],
      ],
    };

    /** Palette je Farbton — dieselben Rollen fuer alle Sprites. */
    const paletteFor = (hue) => ({
      o: '#0B0F14',
      a: `hsl(${hue} 90% 76%)`,
      b: `hsl(${hue} 80% 58%)`,
      c: `hsl(${hue} 70% 40%)`,
      w: '#E0E7FF',
      e: '#0B0F14',
      y: `hsl(${(hue + 45) % 360} 95% 68%)`,
    });

    // Selbstpruefung der Matrizen: ein verrutschtes Zeichen wuerde sonst als
    // stiller Grafikfehler durchgehen. Meldet sich nur, wenn wirklich etwas fehlt.
    for (const [family, stages] of Object.entries(SPRITES)) {
      stages.forEach((rows, stage) => {
        const bad = rows.length !== 16 || rows.some((row) => row.length !== 16);
        if (bad) console.warn(`[shinon-codingmon] Sprite ${family}#${stage} ist nicht 16x16 (${rows.length} Zeilen)`);
      });
    }

    const spriteCache = new Map();
    /**
     * Matrix -> SVG. `shape-rendering: crispEdges` plus 1x1-Rects im 16er-
     * viewBox: die Pixel bleiben beim Skalieren scharf, es wird kein Bild
     * interpoliert. Ergebnis wird je Familie/Stufe/Groesse zwischengespeichert.
     */
    function spriteSvg(family, stage, size) {
      const key = `${family}:${stage}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const rows = (SPRITES[family] ?? SPRITES.spark)[stage] ?? SPRITES.spark[0];
      const colors = paletteFor((SPECIES[speciesOfFamily(family)] ?? SPECIES[SPECIES_IDS[0]]).hue);
      let pixels = '';
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y];
        for (let x = 0; x < row.length; x += 1) {
          const ch = row[x];
          if (ch === '.') continue;
          pixels += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch] ?? colors.b}" />`;
        }
      }
      const svg = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" `
        + `shape-rendering="crispEdges" class="__cm_pet" data-stage="${STAGES[stage].label}">${pixels}</svg>`;
      spriteCache.set(key, svg);
      return svg;
    }

    // ── 1. ESKALATION (Spiegel des Host-Vertrags) ─────────────────
    // Bewusst dupliziert: Client- und Host-Bundle teilen keinen Code, und ein
    // Import quer ueber Pakete ist in diesem Repo nicht erlaubt. Die Probe
    // /tmp/codemon-sim.mjs vergleicht beide Seiten Zahl fuer Zahl, damit die
    // Dopplung nicht auseinanderlaeuft.
    const ESCALATION = { factor: 1.35, perLevel: 'x1,35', label: 'multiplikativ je Stufe' };
    const POWER_UNIT = 10;
    /**
     * Die Decke der Leiter, Spiegel des Host-Vertrags (index.js, LEVEL_CAP).
     * Ohne sie laeuft `Math.pow` ab Stufe ~2363 in Infinity und die Anzeige in
     * Exponentialschreibweise — „HP 4.72e+298" ist keine Aussage. 1,35^1999 ist
     * rund 1e260 und damit noch eine endliche Number.
     */
    const LEVEL_CAP = 2000;
    /** Die Stufe, wie die Leiter sie zaehlt: ganzzahlig, mindestens 1, hoechstens LEVEL_CAP. */
    const cappedLevel = (level) => Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)));

    /** Die Leiter als Zahl: `base * factor^(level-1)`, gedeckelt. */
    const powerAt = (base, level) => Math.round(base * Math.pow(ESCALATION.factor, cappedLevel(level) - 1));

    /** Dieselbe Leiter EXAKT in BigInt (Basis 135/100). Fuer den Lebenslauf. */
    const powerAtExact = (base, level) => {
      const steps = BigInt(cappedLevel(level) - 1);
      return BigInt(Math.round(base)) * (135n ** steps) / (100n ** steps);
    };

    const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    /**
     * Tausenderpunkte — und KEIN Ausbruch in Exponentialschreibweise: was ueber
     * 2^53 liegt, wird ueber seinen Ganzzahlwert (BigInt) gedruckt. Der Wert
     * einer Number oberhalb von 2^53 ist der Wert DIESER Number; die Ziffern
     * werden also nicht erfunden, sie sind nur nicht mehr die ganze Wahrheit —
     * die steht in der exakten BigInt-Leiter.
     */
    const formatNumber = (value) => {
      if (typeof value === 'bigint') return group(value.toString());
      // Ein reiner Dezimaltext (so liegt der Lebenslauf in JSON) wird gruppiert,
      // alles andere unveraendert durchgereicht — „1e+300" sind keine Ziffern.
      if (typeof value === 'string') return /^-?\d+$/.test(value) ? group(value) : value;
      if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
      if (!Number.isSafeInteger(Math.round(value))) return group(BigInt(Math.round(value)).toString());
      return group(String(Math.round(value)));
    };

    /**
     * Ein Wert als reiner Ganzzahltext fuer Protokoll und Ablage. `String(1e300)`
     * ergibt „1e+300" — im Meilenstein-Log stand damit „Level 2000 -> 1e+300",
     * eine Zahl, die niemand zaehlen kann. Hier steht sie in Ziffern.
     */
    const exactText = (value) => {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
      return BigInt(Math.round(value)).toString();
    };

    /**
     * Die Stellenzahl — und zwar die des GANZZAHLWERTS, nicht die Laenge von
     * „4.721837931227852e+298" (die waere 21 und damit Unsinn).
     */
    const digitsOf = (value) => {
      if (typeof value === 'bigint') return String(value < 0n ? -value : value).length;
      if (!Number.isFinite(value)) return String(value).length;
      const whole = BigInt(Math.round(value));
      return String(whole < 0n ? -whole : whole).length;
    };

    /** Ein Wert samt Inszenierung: exakter Betrag, Text, Stellenzahl. */
    const describeValue = (base, level) => {
      const exact = powerAtExact(base, level);
      return { exact, text: formatNumber(exact), digits: digitsOf(exact), safe: exact <= BigInt(Number.MAX_SAFE_INTEGER) };
    };

    /** Kumulative XP-Schwelle (multiplikativ, nicht quadratisch). */
    const threshold = (level) => {
      const steps = cappedLevel(level) - 1;
      return Math.round((XP_BASE * (Math.pow(ESCALATION.factor, steps) - 1)) / (ESCALATION.factor - 1));
    };
    const levelFor = (xp) => {
      let level = 1;
      while (level < LEVEL_CAP && threshold(level + 1) <= xp) level += 1;
      return level;
    };
    const statsAt = (speciesId, level) => {
      const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      const scale = Math.pow(ESCALATION.factor, cappedLevel(level) - 1);
      return {
        hp: Math.round(base.hp * scale),
        atk: Math.round(base.atk * scale),
        def: Math.round(base.def * scale),
        agi: Math.round(base.agi * scale),
        int: Math.round(base.int * scale),
      };
    };
    /**
     * Dieselben Werte EXAKT (BigInt, dieselbe 135/100-Leiter). Gerechnet wird
     * mit der schnellen Number-Fassung, ANGEZEIGT mit dieser: eine Zahl mit 260
     * Stellen ist in Number nicht darstellbar, und `Math.pow` liefert dort
     * „4.7e+298" statt Ziffern.
     */
    const statsAtExact = (speciesId, level) => {
      const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      return {
        hp: powerAtExact(base.hp, level),
        atk: powerAtExact(base.atk, level),
        def: powerAtExact(base.def, level),
        agi: powerAtExact(base.agi, level),
        int: powerAtExact(base.int, level),
      };
    };

    /** Meilensteine der Inszenierung: zweistellig bis Millionen. */
    const MILESTONES = [10, 100, 1000, 10000, 1000000];
    const milestoneFor = (before, after) => {
      let hit = null;
      for (const mark of MILESTONES) if (Number(before) < mark && Number(after) >= mark) hit = mark;
      return hit;
    };

    // ── 2. REGELWERK (feste Tabellen, je Faktor ein Nachschlagen) ─────────
    const ELEMENTS = {
      spark: { label: 'Spark', beats: 'byte', losesTo: 'feral' },
      byte: { label: 'Byte', beats: 'feral', losesTo: 'spark' },
      feral: { label: 'Feral', beats: 'spark', losesTo: 'byte' },
    };
    const ELEMENT_WIN = 1.5;
    const ELEMENT_LOSS = 0.75;
    const ELEMENT_CHART = Object.fromEntries(Object.entries(ELEMENTS).map(([attacker, entry]) => [
      attacker,
      Object.fromEntries(Object.keys(ELEMENTS).map((defender) => [
        defender,
        defender === entry.beats ? ELEMENT_WIN : defender === entry.losesTo ? ELEMENT_LOSS : 1,
      ])),
    ]));
    const CATEGORY = {
      physisch: { label: 'physisch', defFactor: 0.8 },
      speziell: { label: 'speziell', defFactor: 0.35 },
    };
    const SYNERGY = {
      'spark:physisch': 1,
      'spark:speziell': 1.25,
      'byte:physisch': 1,
      'byte:speziell': 1.25,
      'feral:physisch': 1,
      'feral:speziell': 1.25,
    };
    /** Vererbungsbaum: Ahn, Generation und die geerbte Faehigkeit je Linie. */
    const LINEAGE = {
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
    const NEUTRAL_BUFF = { id: 'neutral', label: 'kein Buff', factor: 1 };
    const BUFFS = [
      { id: 'linie', label: 'Reine Linie', factor: 1.1, test: 'inherited' },
      { id: 'nichts-zu-verlieren', label: 'Nichts zu verlieren', factor: 1.5, test: 'low-hp' },
      { id: 'uebertaktet', label: 'Uebertaktet', factor: 1.15, test: 'full-hp' },
    ];
    const BUFF_TESTS = {
      inherited: (ability, attacker) => attacker.inherited.includes(ability.id),
      'low-hp': (ability, attacker) => attacker.hp / Math.max(1, attacker.maxHp) < 0.25,
      'full-hp': (ability, attacker) => attacker.hp / Math.max(1, attacker.maxHp) >= 0.9,
    };
    const buffFor = (ability, attacker) => {
      for (const buff of BUFFS) {
        const test = BUFF_TESTS[buff.test];
        if (typeof test === 'function' && test(ability, attacker)) return buff;
      }
      return NEUTRAL_BUFF;
    };
    const inheritedAbilities = (speciesId) => (LINEAGE[speciesId] ?? LINEAGE[SPECIES_IDS[0]]).inherits ?? [];

    // ── Reine Funktionen (Spiegel des Host-Vertrags) ─────────────────────────
    const speciesOfFamily = (family) => SPECIES_IDS.find((id) => SPECIES[id].family === family) ?? SPECIES_IDS[0];
    const abilitiesFor = (level, speciesId) => {
      const inherited = inheritedAbilities(speciesId);
      return ABILITIES.filter((ability) => ability.minLevel <= level
        && (ability.species === null || ability.species === speciesId || inherited.includes(ability.id)));
    };
    const formOf = (level) => STAGES[stageIndex(level)];

    /**
     * Der Schaden: BaseDamage * Element * Synergie * Buff - DEF * Durchgriff.
     * Fuenf Nachschlagevorgaenge, ein Minimum von 1, keine Zufallszahl.
     */
    const resolveAttack = (ability, attacker, defender) => {
      const category = CATEGORY[ability.kind] ?? CATEGORY.physisch;
      const element = (ELEMENT_CHART[attacker.element] ?? ELEMENT_CHART.spark)[defender.element] ?? 1;
      const synergy = SYNERGY[`${attacker.element}:${ability.kind}`] ?? 1;
      const buff = buffFor(ability, attacker);
      const base = (ability.power * (attacker.stats[ability.stat] ?? 0)) / POWER_UNIT;
      const dealt = Math.max(1, Math.round(base * element * synergy * buff.factor - defender.stats.def * category.defFactor));
      return { base, element, synergy, category: ability.kind, defFactor: category.defFactor, buff, dealt };
    };
    /** Kurzform: nur der Betrag. */
    const damageOf = (ability, attacker, defender) => resolveAttack(ability, attacker, defender).dealt;
    /** XP fuer einen Sieg. Waechst mit dem Level des Gegners — multiplikativ. */
    const rewardFor = (level) => powerAt(20, Math.max(1, Math.floor(level)) + 1);
    const firstStrike = (challengerStats, enemyStats) => (challengerStats.agi >= enemyStats.agi ? 'challenger' : 'enemy');
    const arenaFor = (level, round) => {
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
    };
    /** Die staerkste Faehigkeit eines Gegners. Determinismus statt Wuerfel. */
    const bestMove = (level, speciesId) =>
      abilitiesFor(level, speciesId).slice().sort((a, b) => b.power - a.power)[0] ?? ABILITIES[0];

    // ── 3. PACING (kuenstliche Rundendauer) ─────────────────────────────────
    const PACING = { delayMs: 3000, lockedText: 'Codermon ist im Kampf, warte auf das Ergebnis' };
    /**
     * Die Dauer, mit der dieser Client rechnet. Sie ist ein SPIEGEL des
     * Vertragswerts: der Host liest die effektive Zahl aus der Profil-Ebene,
     * und die kann der Browser nicht lesen. Eine Abweichung waere still —
     * deshalb steht der Spiegel hier sichtbar an genau einer Stelle.
     */
    const roundDelayMs = PACING.delayMs;

    // ── 4. LOOT (gewichteter Wurf in Basispunkten) ──────────────────────────
    const LOOT_TABLE = [
      { id: 'schrott', label: 'Schrott', weight: 8500, xp: 0 },
      { id: 'brauchbar', label: 'Brauchbares Teil', weight: 1400, xp: 25 },
      { id: 'shiny', label: 'Shiny God-Tier', weight: 100, xp: 2500 },
    ];
    const LOOT_TOTAL = LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
    /**
     * Der Wurf: `uniform` aus [0,1) gegen die kumulierten Gewichte. Rein.
     * Dieselbe Sperrklinke wie in index.js: ein nicht endlicher Wert wird als 0
     * gelesen, damit ein kaputter Eingabewert nicht die seltenste Stufe gewinnt.
     */
    const rollLoot = (uniform) => {
      const clamped = Number.isFinite(uniform) ? Math.min(1, Math.max(0, uniform)) : 0;
      const point = Math.min(LOOT_TOTAL - 1, Math.floor(clamped * LOOT_TOTAL));
      let acc = 0;
      for (const entry of LOOT_TABLE) {
        acc += entry.weight;
        if (point < acc) return entry;
      }
      return LOOT_TABLE[LOOT_TABLE.length - 1];
    };
    const lootOdds = (entry) => Number(((entry.weight / LOOT_TOTAL) * 100).toFixed(2));

    // ── Store ───────────────────────────────────────────────────────────────
    const listeners = new Set();
    /**
     * Jede Aenderung erreicht zwei Empfaenger: die Abonnenten in diesem Bundle
     * (Panel, Marke, EXP-Leiste) und — als DOM-Ereignis — fremde Panels, die
     * den Zustand nur kennen, nicht besitzen (@shinon/dashboard). Die XP-Leiste
     * dort muss nicht pollen, um aktuell zu sein.
     */
    const emit = () => {
      for (const fn of listeners) { try { fn(); } catch { /* ein Abnehmer darf den Rest nicht kippen */ } }
      window.dispatchEvent(new CustomEvent('shinon:exp', { detail: { xp: store.xp, level: level() } }));
    };
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
    const useStore = () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => subscribe(() => bump((n) => n + 1)), []);
      return store;
    };

    const freshState = (speciesId = SPECIES_IDS[0]) => ({
      version: STORE_VERSION,
      name: 'Codingmon',
      species: speciesId,
      xp: 0,
      peakTokens: 0,
      hp: statsAt(speciesId, 1).hp,
      wins: 0,
      losses: 0,
      round: 0,
      battle: null,
      log: [],
      /**
       * Der Lebenslauf. `damageTotal` ist die Summe allen Schadens und wird als
       * BigInt gefuehrt: bei Level 50 stehen hier Betraege in Millionenhöhe, und
       * eine Zahl, die man nachrechnen will, darf nicht ab 2^53 runden. JSON
       * kennt kein BigInt — persist() schreibt den Dezimaltext, revive() liest
       * ihn zurueck.
       */
      damageTotal: 0n,
      hits: 0,
      peakHit: 0,
      digits: 1,
      milestones: [],
      /** Beutezaehler und die letzten Funde. Reine Zahlen, keine Deutung. */
      loot: { schrott: 0, brauchbar: 0, shiny: 0 },
      drops: [],
      sinceShiny: 0,
      /** Die Sperre. Nicht null = ein Zug laeuft und nimmt keinen Input an. */
      lock: null,
      rejections: 0,
    });

    /**
     * Einen gelesenen Stand BRAUCHBAR machen: ein Pet aus einer aelteren Fassung
     * (die drei Spezies spark/byte/feral, kein Regelwerk, kein BigInt) darf den
     * Client nicht mit `undefined`-Werten in die Arena schicken. Unbekannte
     * Spezies fallen auf die erste zurueck, ein Kampf mit unbekanntem Gegner
     * wird verworfen — XP, Siege, Beute und Log bleiben.
     */
    function revive(raw) {
      const state = { ...freshState(), ...(raw ?? {}) };
      if (!SPECIES[state.species]) state.species = SPECIES_IDS[0];
      if (!Number.isFinite(state.xp) || state.xp < 0) state.xp = 0;
      if (!Number.isFinite(state.round) || state.round < 0) state.round = 0;
      try {
        state.damageTotal = BigInt(raw?.damageTotal ?? 0);
      } catch {
        state.damageTotal = 0n;
      }
      if (state.damageTotal < 0n) state.damageTotal = 0n;
      for (const key of ['hits', 'peakHit', 'digits', 'sinceShiny', 'rejections']) {
        if (!Number.isFinite(state[key]) || state[key] < 0) state[key] = 0;
      }
      if (state.digits < 1) state.digits = 1;
      // Die Beute wird WERT FUER WERT geprueft, nicht nur auf Existenz: ein
      // Stand mit `{schrott:'viele'}` ergab sonst den Zaehler „viele1" und die
      // Panel-Zeile „Schrott: 85 % — viele1 gefunden". Nur die Schluessel des
      // Vertrags zaehlen, alles andere faellt auf 0 zurueck.
      const rawLoot = (state.loot !== null && typeof state.loot === 'object') ? state.loot : {};
      state.loot = Object.fromEntries(Object.entries(freshState().loot).map(([id, fallback]) => {
        const value = rawLoot[id];
        return [id, Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback];
      }));
      state.milestones = Array.isArray(state.milestones) ? state.milestones : [];
      state.drops = Array.isArray(state.drops) ? state.drops : [];
      const battle = state.battle;
      const usable = battle !== null && typeof battle === 'object' && SPECIES[battle.speciesId]
        && Number.isFinite(battle.hp) && Number.isFinite(battle.maxHp);
      state.battle = usable ? battle : null;
      // Eine Sperre haengt an einem Timer, und der ueberlebt das Neuladen nicht.
      // Ein Stand mit gesetzter Sperre waere eine Wartezeit ohne Uhr: der Spieler
      // wartete fuer immer. Also faellt der Zug, und das Log sagt es.
      if (state.lock !== null && state.lock !== undefined) {
        const pending = state.lock.action;
        state.lock = null;
        state.log = [`${new Date().toLocaleTimeString('de-DE')}  Neuladen mitten im Zug (${pending}) — der Zug ist verfallen`, ...(state.log ?? [])].slice(0, 40);
      }
      if (!Number.isFinite(state.hp) || state.hp <= 0) state.hp = statsAt(state.species, levelFor(state.xp)).hp;
      return state;
    }

    /** Der Stand, wie er auf die Platte geht: BigInt als Dezimaltext. */
    const portable = () => ({ ...store, damageTotal: store.damageTotal.toString() });

    let store = freshState();
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) store = revive(JSON.parse(raw));
    } catch { /* kein Storage: das Pet lebt dann nur in dieser Sitzung */ }

    const persist = () => {
      try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(portable())); } catch { /* siehe oben */ }
    };

    /**
     * ── Uebergabe (Client -> Host) ─────────────────────────────────────────
     * Der Stand liegt in `localStorage` und haengt damit am BROWSER-Profil: ist
     * das weg, ist der Grind weg. Der Host haelt daneben einen dauerhaften
     * Spiegel (`assets/pet-store.js`), und diese Funktion ist der ABSENDER —
     * sie schickt den Stand ueber den Typert-RPC von DSH an den Host, sofern
     * das Client-Bundle den Beitrag dieses Pakets gemountet hat.
     *
     * Die Namen stehen hier als LITERAL und nicht als Import: dieses Bundle ist
     * selbststaendig (es zieht React ueber `require`, nicht ueber `import`) und
     * kann keine Datei aus `assets/` laden. Quelle ist `assets/uebergabe.js`;
     * `test/uebergabe.test.mjs` vergleicht beide Seiten Zeichen fuer Zeichen,
     * damit die Dopplung nicht STILL driftet.
     *
     * WAS DIESE FUNKTION NICHT TUT: sie wirft nie, sie wartet nie, und sie
     * aendert nie den Spielstand. Ohne gemounteten Beitrag ist der Host schlicht
     * nicht da — dann bleibt alles wie vorher (der Browser haelt den Stand
     * allein), und der Zustand merkt sich die Absage, statt sie zu verschweigen.
     */
    const HOST_NAMESPACE = 'codingmon';
    const HOST_METHOD = 'writeSnapshot';
    let clientCtx = null;
    let hostMirror = { sent: 0, lastAt: null, lastLevel: null, error: null, reason: 'kein Kanal' };

    /** Den Namensraum des Beitrags finden — als Cordis-Dienst `remote.<namespace>`. */
    function hostNamespace() {
      const remote = clientCtx?.remote;
      if (remote === null || remote === undefined) return null;
      const viaCtx = typeof clientCtx.get === 'function' ? clientCtx.get(`remote.${HOST_NAMESPACE}`) : undefined;
      return viaCtx ?? remote[HOST_NAMESPACE] ?? null;
    }

    function toHost() {
      try {
        const namespace = hostNamespace();
        const send = namespace?.[HOST_METHOD];
        if (typeof send !== 'function') {
          hostMirror = { ...hostMirror, reason: 'kein Kanal' };
          return false;
        }
        const snapshot = {
          schemaVersion: STORE_VERSION,
          species: store.species,
          xp: Math.floor(store.xp),
          wins: store.wins,
          losses: store.losses,
          round: store.round,
          damageTotal: store.damageTotal.toString(),
          hits: store.hits,
          loot: { ...store.loot },
          savedAt: new Date().toISOString(),
        };
        // Die Methode liefert ein RemoteResult: { ok: true, value } oder
        // { ok: false, error }. Der Fehlerzweig ist ein ERGEBNIS, kein Wurf —
        // ein abwesender oder ablehnender Host darf das Spiel nicht anhalten.
        Promise.resolve(send(snapshot)).then(
          (result) => {
            if (result?.ok === true) {
              hostMirror = {
                sent: hostMirror.sent + 1,
                lastAt: result.value?.storedAt ?? null,
                lastLevel: result.value?.level ?? null,
                error: null,
                reason: 'gespiegelt',
              };
            } else {
              hostMirror = { ...hostMirror, error: result?.error?.message ?? 'abgelehnt', reason: 'abgelehnt' };
            }
          },
          (error) => { hostMirror = { ...hostMirror, error: error?.message ?? String(error), reason: 'kein Kanal' }; },
        );
        return true;
      } catch (error) {
        hostMirror = { ...hostMirror, error: error?.message ?? String(error), reason: 'kein Kanal' };
        return false;
      }
    }
    const note = (text) => {
      store.log = [`${new Date().toLocaleTimeString('de-DE')}  ${text}`, ...store.log].slice(0, 40);
    };

    const level = () => levelFor(store.xp);
    const stats = () => statsAt(store.species, level());
    const maxHp = () => stats().hp;

    // ── XP-Bruecke: 1 XP pro Token ──────────────────────────────────────────
    /**
     * Liest den Sitzungs-Token-Zaehler aus der Oberflaeche. Genommen wird der
     * groesste je gesehene Wert (der Zaehler waechst monoton), damit ein
     * Neu-Rendern nicht doppelt zaehlt.
     */
    function readTokenTotal() {
      const text = document.body?.innerText ?? '';
      let total = 0;
      const pattern = /([0-9][0-9.,]*)\s*([KkMm])?\s*tok\b/g;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const raw = Number(match[1].replace(/[.,]/g, ''));
        if (!Number.isFinite(raw)) continue;
        const scale = match[2] ? (match[2].toLowerCase() === 'k' ? 1000 : 1_000_000) : 1;
        total = Math.max(total, raw * scale);
      }
      return Math.round(total);
    }

    function xpFromTokens() {
      const total = readTokenTotal();
      if (total <= store.peakTokens) return 0;
      const gained = (total - store.peakTokens) * 1; // 1 XP pro Token
      store.peakTokens = total;
      return gained;
    }

    /**
     * Einen Meilenstein feiern — aber nur, wenn wirklich eine Stelle dazukommt.
     * `kind` trennt, WELCHER Wert gewachsen ist (Lebenslauf, Einzeltreffer, XP,
     * Beute), damit die Anzeige nicht alles in einen Topf wirft.
     */
    function celebrate(kind, before, after, label) {
      const mark = milestoneFor(before, after);
      if (mark === null) return null;
      const digits = digitsOf(after);
      store.milestones = [{ at: Date.now(), kind, mark, value: exactText(after), digits, label }, ...store.milestones].slice(0, 20);
      note(`MEILENSTEIN ${formatNumber(mark)}+ (${kind}) — ${label}: ${formatNumber(after)} (${digits} Stellen)`);
      return mark;
    }

    function award(xp, reason) {
      const before = level();
      const xpBefore = store.xp;
      store.xp += Math.max(0, Math.round(xp));
      store.digits = Math.max(store.digits, digitsOf(store.xp));
      const after = level();
      if (after > before) {
        const learned = abilitiesFor(after, store.species)
          .filter((ability) => ability.minLevel > before);
        store.hp = statsAt(store.species, after).hp;
        note(`LEVEL ${after} — ${formOf(after).label}!${learned.length ? ` Gelernt: ${learned.map((a) => a.label).join(', ')}` : ''}`);
      } else if (reason) {
        note(reason);
      }
      celebrate('xp', xpBefore, store.xp, `Level ${after}`);
      persist();
      emit();
    }

    function tickTokens() {
      const gained = xpFromTokens();
      if (gained > 0) award(gained, null);
    }

    // ── 3. PACING: der Zug sperrt den Zustand ───────────────────────────────
    /** Rundendauer aus dem Vertrag; eine kaputte Zahl wird zu 0, nicht zu NaN. */
    const roundDelay = () => Math.max(0, Number(roundDelayMs) || 0);
    /** Timer je Zug. Ausserhalb des Zustands, weil ein Handle nicht auf die Platte gehoert. */
    const timers = new Map();

    /**
     * Ein Input WAEHREND der Sperre wird kalt abgewiesen, nicht eingereiht und
     * nicht verrechnet. Das ist die eine Stelle, die die Luecke schliesst: wer
     * zehnmal klickt, bekommt neun Absagen und genau ein Ergebnis.
     */
    function guard(action) {
      if (store.lock === null) return true;
      store.rejections += 1;
      note(`${PACING.lockedText} (abgewiesen: ${action})`);
      persist();
      emit();
      return false;
    }

    /**
     * Einen Zug beginnen: SYNCHRON, in derselben Millisekunde wie der Klick,
     * wird der Schnappschuss eingefroren, den das Ergebnis benutzen darf — und
     * erst danach wird gewartet. Diese Reihenfolge ist der ganze Punkt: waere
     * die Sperre erst nach dem `await` gesetzt, koennte ein zweiter Klick im
     * selben Tick ein zweites Ergebnis buchen (Race Condition). Der eingefrorene
     * Stand ist die EINZIGE Quelle des Ergebnisses; was der Nutzer waehrend der
     * Wartezeit sieht, ist die Wartezeit selbst.
     */
    function beginTurn(action, payload) {
      if (!guard(action)) return null;
      const now = Date.now();
      const lock = {
        id: `${now}-${store.round}-${store.hits}-${action}`,
        action,
        payload,
        at: now,
        until: now + roundDelay(),
        frozen: {
          level: level(),
          species: store.species,
          hp: store.hp,
          stats: stats(),
          inherited: inheritedAbilities(store.species),
          battle: store.battle === null ? null : { ...store.battle, stats: { ...store.battle.stats } },
        },
      };
      store.lock = lock;
      persist();
      emit();
      timers.set(lock.id, window.setTimeout(() => settle(lock.id), roundDelay()));
      return lock;
    }

    /**
     * Das Ergebnis ausspielen. Der Timer prueft ZUERST seine Kennung: ein Zug,
     * der schon ersetzt wurde, darf nicht mehr schreiben (sonst wuerde ein
     * spaeter Zuendender den aktuellen Kampf ueberschreiben). Alles Folgende
     * laeuft in einem Block — waehrend der Sperre konnte nichts anderes den
     * Zustand bewegen.
     */
    function settle(lockId) {
      const timer = timers.get(lockId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(lockId);
      }
      const lock = store.lock;
      if (lock === null || lock.id !== lockId) return null;
      const { frozen, action, payload } = lock;
      store.lock = null;
      const result = action === 'start' ? openBattle(frozen, payload) : action === 'use' ? strike(frozen, payload) : null;
      persist();
      // Jeder BEENDETE Zug geht an den Host — nicht jeder Klick: die Sperre hat
      // den Zug schon auf einen Ausgang festgelegt, und ein Zwischenstand waere
      // ein Stand, den der Client selbst nie hatte.
      toHost();
      emit();
      return result;
    }

    /** Der Zug, wie ihn der Client nach aussen meldet (fuer Proben und Anzeige). */
    const lockStatus = () => (store.lock === null ? null : { ...store.lock.frozen, id: store.lock.id, action: store.lock.action, until: store.lock.until });

    // ── 1./2. Arena: ein Klick = ein Zug, Ergebnis verzoegert ───────────────
    /**
     * Den Treffer buchen: der Lebenslauf waechst als BigInt, Einzeltreffer und
     * Stellenzahl werden nachgezogen, und ein Stellensprung wird gefeiert.
     * Alle Ausgaben sind formatiert — der Sprung von zwei- auf fuenfstellig ist
     * die Aussage, nicht die Animation.
     */
    function bookHit(dealt, label) {
      const before = store.damageTotal;
      const peakBefore = store.peakHit;
      store.damageTotal += BigInt(Math.max(0, Math.round(dealt)));
      store.hits += 1;
      if (dealt > store.peakHit) store.peakHit = dealt;
      store.digits = Math.max(store.digits, digitsOf(store.damageTotal));
      celebrate('lebenslauf', before, store.damageTotal, label);
      celebrate('treffer', peakBefore, store.peakHit, label);
    }

    /** Einen Gegner stellen — als Zug, nicht sofort. */
    function startBattle() {
      if (store.battle !== null) return store.battle;
      const arena = arenaFor(level(), store.round);
      const lock = beginTurn('start', { arena });
      if (lock === null) return null;
      store.round += 1;
      persist();
      return { locked: true, until: lock.until, arena };
    }

    /** Den eingefrorenen Gegner aufstellen; schlaegt er zuerst, tut er es sofort. */
    function openBattle(frozen, payload) {
      const arena = payload.arena;
      store.battle = {
        speciesId: arena.speciesId,
        element: arena.element,
        level: arena.level,
        hp: arena.stats.hp,
        maxHp: arena.stats.hp,
        stats: arena.stats,
        reward: arena.reward,
        turn: firstStrike(frozen.stats, arena.stats),
        over: null,
      };
      note(`Runde ${store.round}: ${SPECIES[arena.speciesId].label} L${arena.level} erscheint (${formatNumber(arena.reward)} XP)`);
      if (store.battle.turn === 'enemy') enemyAnswer();
      return { locked: false, battle: { ...store.battle } };
    }

    /**
     * Die gewaehlte Faehigkeit aus dem EINGEFRORENEN Stand ausfuehren. Der
     * Gegner antwortet im selben Block: ein Klick ergibt genau eine Runde, nie
     * zwei halbe.
     */
    function strike(frozen, payload) {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return null;
      const known = abilitiesFor(frozen.level, frozen.species);
      const move = known.find((ability) => ability.id === payload.abilityId) ?? known[0];
      const attacker = {
        element: SPECIES[frozen.species].family,
        stats: frozen.stats,
        hp: frozen.hp,
        maxHp: frozen.stats.hp,
        inherited: frozen.inherited,
      };
      const result = resolveAttack(move, attacker, battle);
      battle.hp = Math.max(0, battle.hp - result.dealt);
      bookHit(result.dealt, `${move.label} gegen ${SPECIES[battle.speciesId].label}`);
      note(`${move.label} —${formatNumber(result.dealt)} (Element ${result.element}x${result.category === 'speziell' ? `, Durchgriff ${result.defFactor}` : ''}`
        + `${result.buff.id === 'neutral' ? '' : `, ${result.buff.label} ${result.buff.factor}x`}) — Gegner ${formatNumber(battle.hp)}/${formatNumber(battle.maxHp)} HP`);
      let outcome = null;
      if (battle.hp <= 0) outcome = finish('win', battle);
      else {
        battle.turn = 'enemy';
        outcome = enemyAnswer();
      }
      return { move: move.id, dealt: result.dealt, factors: result, battle: { ...battle }, outcome };
    }

    /** Der Gegner schlaegt zurueck — dieselbe reine Kette, sein Stand. */
    function enemyAnswer() {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return null;
      const move = bestMove(battle.level, battle.speciesId);
      const attacker = {
        element: battle.element ?? SPECIES[battle.speciesId].family,
        stats: battle.stats,
        hp: battle.hp,
        maxHp: battle.maxHp,
        inherited: [],
      };
      const result = resolveAttack(move, attacker, { element: SPECIES[store.species].family, stats: stats() });
      store.hp = Math.max(0, store.hp - result.dealt);
      note(`${SPECIES[battle.speciesId].label} nutzt ${move.label} —${formatNumber(result.dealt)} (Element ${result.element}x) — eigenes HP ${formatNumber(store.hp)}/${formatNumber(maxHp())}`);
      if (store.hp <= 0) return finish('loss', battle);
      battle.turn = 'challenger';
      return null;
    }

    /**
     * Eine Faehigkeit waehlen: sie wird nicht gerechnet, sie wird als Zug
     * begonnen. Die Sperre wird ZUERST geprueft — auch ein Klick auf einen
     * ausgegrauten Knopf ist ein Klick und bekommt die Absage, nicht ein
     * stilles Nichts.
     */
    function useAbility(abilityId) {
      if (!guard('use')) return null;
      const battle = store.battle;
      if (battle === null || battle.over !== null || battle.turn !== 'challenger') return null;
      const lock = beginTurn('use', { abilityId });
      return lock === null ? null : { locked: true, until: lock.until, abilityId };
    }

    /**
     * Kampfende. Der Sieg zahlt XP (die einzige XP-Quelle neben den Token) UND
     * rollt die Beute: ein Wurf, ein Ergebnis. Der Zaehler `sinceShiny` macht
     * die Quote sichtbar, ohne sie zu verbessern — es gibt keine Gnade, nur
     * eine Zahl, die zeigt, wie lange man schon leer ausgeht.
     */
    function finish(outcome, battle) {
      battle.over = outcome;
      if (outcome === 'win') {
        store.wins += 1;
        const reward = battle.reward;
        const shinyBefore = store.loot.shiny;
        store.battle = null;
        const drop = rollLoot(Math.random());
        store.loot[drop.id] += 1;
        store.sinceShiny = drop.id === 'shiny' ? 0 : store.sinceShiny + 1;
        store.drops = [{ at: Date.now(), id: drop.id, label: drop.label, level: battle.level }, ...store.drops].slice(0, 20);
        note(`Sieg gegen ${SPECIES[battle.speciesId].label} L${battle.level} — +${formatNumber(reward)} XP · Beute: ${drop.label} (${lootOdds(drop)} %)`
          + `${drop.id === 'shiny' ? ' — SHINY!' : ` · ${store.sinceShiny} Siege seit dem letzten Shiny`}`);
        if (drop.id === 'shiny') celebrate('beute', shinyBefore, store.loot.shiny, drop.label);
        award(reward + drop.xp, null);
      } else {
        store.losses += 1;
        store.battle = null;
        store.hp = maxHp();
        note(`K.o. gegen ${SPECIES[battle.speciesId].label} L${battle.level} — das Codemon rappelt sich wieder auf`);
      }
      return outcome;
    }

    /** Rast: HP auffuellen. Kein Sieg, kein XP — und waehrend eines Zuges nichts. */
    function rest() {
      if (!guard('rest')) return null;
      if (store.battle !== null) return null;
      store.hp = maxHp();
      note('Rast — HP aufgefrischt');
      persist();
      emit();
      return { hp: store.hp };
    }

    /** Spezies wechseln. Der Fortschritt (XP, Siege, Beute) bleibt, der Kampf endet. */
    function pickSpecies(speciesId) {
      if (!SPECIES[speciesId]) return null;
      if (!guard('pick')) return null;
      store.species = speciesId;
      store.battle = null;
      store.hp = statsAt(speciesId, level()).hp;
      note(`Gewechselt zu ${SPECIES[speciesId].label} (Generation ${(LINEAGE[speciesId] ?? {}).generation ?? 1})`);
      persist();
      emit();
      return { species: speciesId };
    }

    /** Die Figur eines Codemons: Familie aus der Spezies, Farbe aus dem Farbton. */
    function speciesGlyph(speciesId, lvl, size) {
      const species = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      const key = `${species.family}:${stageIndex(lvl)}:${size}:${species.hue}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const svg = spriteSvg(species.family, stageIndex(lvl), size)
        .replace('<svg ', `<svg data-species="${speciesId}" `);
      // Der Farbton ist Teil der Spezies: die Familie liefert die Form, die
      // Spezies die Farbe. Damit teilen sich nicht alle zehn ein Aussehen.
      const tinted = svg.replace(/hsl\((\d+)/g, `hsl(${species.hue}`);
      spriteCache.set(key, tinted);
      return tinted;
    }

    // ── Das Pet als Marke ───────────────────────────────────────────────────
    function PetMark({ size = 24 }) {
      const s = useStore();
      const lvl = levelFor(s.xp);
      return h('span', {
        className: '__cm_mark',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${formOf(lvl).label}`,
        dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, size) },
      });
    }

    function CodingmonIcon() {
      const s = useStore();
      return h('span', {
        className: '__cm_mark',
        dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, levelFor(s.xp), 18) },
      });
    }

    /** Ein Balken. `tone` faerbt ihn (xp | hp | enemy). */
    function Bar({ value, max, tone }) {
      const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
      return h('div', { className: '__cm_bar', 'data-tone': tone ?? 'xp' },
        h('div', { className: '__cm_bar-fill', style: { width: `${pct}%` } }));
    }

    // ── GLOBALE EXP-LEISTE ──────────────────────────────────────────────────
    /**
     * Die EXP-Leiste steht im Composer-Dock und damit in JEDER Sitzung, nicht
     * nur im Panel: Level, Fortschritt zum naechsten Level, HP. Sie liest
     * denselben Store wie das Panel — eine Quelle, zwei Ansichten.
     */
    function ExpBar() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const pct = Math.max(0, Math.min(100, Math.round(((s.xp - prev) / Math.max(1, next - prev)) * 100)));
      return h('div', {
        className: '__cm_expbar',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${s.wins} Siege`,
        'data-plugin': PLUGIN,
      },
        h('span', { className: '__cm_expbar-pet', dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 18) } }),
        h('span', { className: '__cm_expbar-lvl' }, `LV ${lvl}`),
        h('span', { className: '__cm_expbar-track' },
          h('span', { className: '__cm_expbar-fill', style: { width: `${pct}%` } })),
        h('span', { className: '__cm_expbar-meta' },
          // Hoechst-HP aus der exakten Leiter: sonst stuende hier ab Stufe ~120
          // die Exponentialschreibweise einer Zahl, die es so nicht gibt.
          `${formatNumber(s.xp)} XP · HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(statsAtExact(s.species, lvl).hp)} · ${s.wins} Siege · Beute ${s.loot.shiny} shiny`),
      );
    }

    // ── Panel-Bausteine (Kopf / Werte / Arena / Liste / Bilanz) ─────────────
    /** Kopf: Figur, Spezies-Wahl (alle ZEHN erreichbar), Level und Fortschritt. */
    function PetHead({ s, lvl, onPick }) {
      const cur = statsAtExact(s.species, lvl);
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const lineage = LINEAGE[s.species] ?? {};
      return h('header', { className: '__cm_panel-head' },
        h('span', { className: '__cm_panel-stage' },
          h('span', { dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 72) } }),
          h('span', { className: '__cm_sub' }, formOf(lvl).label)),
        h('div', { className: '__cm_panel-id' },
          h('h2', null, `${s.name} — ${SPECIES[s.species].label}`),
          h('p', { className: '__cm_sub' },
            `Level ${lvl} · ${s.wins} Siege / ${s.losses} K.o. · Runde ${s.round} · ${ELEMENTS[SPECIES[s.species].family].label} · Generation ${lineage.generation ?? 1}`),
          h('p', { className: '__cm_xp' },
            `${formatNumber(s.xp)} XP (${digitsOf(s.xp)} Stellen) · ${formatNumber(Math.max(0, next - s.xp))} XP bis Level ${lvl + 1}`),
          h(Bar, { value: s.xp - prev, max: Math.max(1, next - prev), tone: 'xp' }),
          h('label', { className: '__cm_pick' },
            h('span', null, 'Codemon'),
            h('select', {
              value: s.species,
              onChange: (event) => onPick(event.target.value),
            }, SPECIES_IDS.map((id) => h('option', { key: id, value: id }, SPECIES[id].label)))),
          // Ist-HP steht im Zustand (Number), Soll-HP in der exakten Leiter.
          // Oberhalb von 2^53 koennen sich die letzten Stellen unterscheiden —
          // die Leiter ist die Wahrheit, der Zustand ist der Spielstand.
          h('p', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(cur.hp)}`),
        ),
      );
    }

    /**
     * Werte in einer Zeile — dieselben fuenf Zahlen wie im Vertrag, aber aus
     * der EXAKTEN Leiter (BigInt) und durch `formatNumber`: in Millionenhöhe mit
     * Trennzeichen, in Billionenhöhe immer noch als Ziffern und nicht als
     * „4.7e+298". Der Spieler soll die Nullen zaehlen koennen, nicht raten.
     */
    function StatsGrid({ stats }) {
      return h('div', { className: '__cm_stats' },
        [['HP', stats.hp], ['ATK', stats.atk], ['DEF', stats.def], ['AGI', stats.agi], ['INT', stats.int]]
          .map(([label, value]) => h('div', { className: '__cm_stat', key: label },
            h('span', { className: '__cm_stat-k' }, label),
            h('span', { className: '__cm_stat-v' }, formatNumber(value)))));
    }

    /** Eine Seite der Arena: Figur, Name, Level, HP-Balken, Werte. */
    function ArenaSide({ side, speciesId, level: lvl, hp, maxHp: top, stats: values }) {
      return h('div', { className: `__cm_side __cm_side--${side}` },
        h('span', { dangerouslySetInnerHTML: { __html: speciesGlyph(speciesId, lvl, 56) } }),
        h('div', { className: '__cm_side-id' },
          h('strong', null, SPECIES[speciesId].label),
          h('span', { className: '__cm_sub' }, `L${lvl}`),
          h(Bar, { value: hp, max: top, tone: side === 'enemy' ? 'enemy' : 'hp' }),
          h('span', { className: '__cm_sub' },
            `HP ${formatNumber(Math.max(0, hp))}/${formatNumber(top)} · ATK ${formatNumber(values.atk)} · DEF ${formatNumber(values.def)}`)),
      );
    }

    /**
     * Die Arena: Gegner, eigenes Codemon und die Knoepfe der Faehigkeiten.
     * Ein Klick ist eine Runde. Ist der Gegner am Zug, sind die Knoepfe
     * gesperrt — die Anzeige sagt, warum.
     */
    function Arena({ s, lvl, myStats, abilities, onUse, onStart, onRest }) {
      const battle = s.battle;
      const locked = s.lock !== null;
      const myTurn = battle !== null && battle.over === null && battle.turn === 'challenger';
      return h('section', { className: '__cm_arena' },
        h('h3', null, 'Arena'),
        // Die Sperre ist sichtbar: ein Balken, der genau die Vertragsdauer
        // laeuft, der Absagesatz aus dem Vertrag und der Zaehler der kalten
        // Abweisungen. Kein Klick wird eingereiht.
        locked ? h('div', { className: '__cm_lock' },
          h('span', { className: '__cm_lock-text' }, PACING.lockedText),
          h('span', { className: '__cm_lock-track' },
            h('span', { className: '__cm_lock-fill', style: { animationDuration: `${roundDelayMs}ms` } })),
          h('span', { className: '__cm_sub' },
            `Zug ${s.lock.action} — ${s.rejections} abgewiesene Eingabe${s.rejections === 1 ? '' : 'n'}`)) : null,
        battle === null
          ? h('p', { className: '__cm_sub' }, 'Kein Gegner. Ein Klick stellt einen — die Runde waechst mit jedem Kampf.')
          : h('div', { className: '__cm_board' },
            h(ArenaSide, {
              side: 'enemy',
              speciesId: battle.speciesId,
              level: battle.level,
              hp: battle.hp,
              maxHp: battle.maxHp,
              stats: battle.stats,
            }),
            h('span', { className: '__cm_vs' }, 'VS'),
            h(ArenaSide, {
              side: 'own',
              speciesId: s.species,
              level: lvl,
              hp: s.hp,
              maxHp: myStats.hp,
              stats: myStats,
            })),
        h('div', { className: '__cm_actions' },
          abilities.map((ability) => h('button', {
            key: ability.id,
            type: 'button',
            className: '__cm_move',
            disabled: locked || (battle !== null && !myTurn),
            title: battle === null
              ? 'Erst einen Gegner stellen'
              : `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}${inheritedAbilities(s.species).includes(ability.id) ? ' · geerbt (Reine Linie)' : ''}`,
            onClick: () => onUse(ability.id),
          },
            h('span', { className: '__cm_move-name' }, ability.label),
            h('span', { className: '__cm_move-meta' },
              `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}${inheritedAbilities(s.species).includes(ability.id) ? ' · Erbe' : ''}`))),
        ),
        h('div', { className: '__cm_actions' },
          h('button', {
            type: 'button',
            className: '__cm_btn',
            disabled: locked || battle !== null,
            onClick: onStart,
          }, battle === null ? 'Naechster Gegner' : `Gegner: ${SPECIES[battle.speciesId].label} L${battle.level}`),
          h('button', {
            type: 'button',
            className: '__cm_btn',
            disabled: locked || battle !== null,
            onClick: onRest,
          }, 'Rast (+HP)'),
          h('span', { className: '__cm_sub' }, locked
            ? 'gesperrt — das Ergebnis kommt verzoegert'
            : battle === null
              ? `${formatNumber(Math.max(0, s.hp))}/${formatNumber(myStats.hp)} HP`
              : (battle.turn === 'challenger' ? 'Du bist am Zug' : 'Gegner ist am Zug'))),
      );
    }

    /**
     * ESKALATION: was eine Stufe ausmacht. Die Zahlen stehen formatiert da,
     * weil die Aussage die Zahl ist: Schwelle, Werte und Lohn wachsen
     * multiplikativ (x1,35 je Stufe), und der Lebenslauf steht daneben als
     * BigInt — in Millionenhöhe exakt und nicht gerundet. Der Stellensprung
     * (zwei- auf fuenfstellig) ist damit der Beweis der investierten Zeit und
     * keine Behauptung: er steht als Meilenstein mit Wert und Datum im Log.
     */
    function EscalationBlock({ s, lvl }) {
      const next = threshold(lvl + 1);
      const base = statsAtExact(s.species, 1);
      const ladder = statsAtExact(s.species, lvl);
      const peak = Math.max(0, Math.round(s.peakHit));
      const upcoming = MILESTONES.find((mark) => BigInt(mark) > s.damageTotal) ?? null;
      return h('div', { className: '__cm_block' },
        h('h3', null, `Eskalation — Faktor ${ESCALATION.factor} je Stufe`),
        h('ul', { className: '__cm_facts' },
          h('li', { key: 'threshold' },
            `Schwelle L${lvl + 1}: ${formatNumber(next)} XP (L1 ${formatNumber(threshold(1))}, L20 ${formatNumber(threshold(20))}, L50 ${formatNumber(threshold(50))})`),
          h('li', { key: 'stats' },
            `Werte L${lvl}: HP ${formatNumber(ladder.hp)} · ATK ${formatNumber(ladder.atk)} — auf L1: HP ${formatNumber(base.hp)} · ATK ${formatNumber(base.atk)} (exakte BigInt-Leiter)`),
          h('li', { key: 'cap' },
            `Decke: Level ${formatNumber(LEVEL_CAP)} — bis dahin bleibt Math.pow endlich, ab darueber rechnet nur die BigInt-Leiter`),
          h('li', { key: 'hit' }, `Groesster Treffer: ${formatNumber(peak)} (${digitsOf(peak)} Stellen)`),
          h('li', { key: 'total' }, `Lebenslauf: ${formatNumber(s.damageTotal)} Schaden in ${formatNumber(s.hits)} Treffern (BigInt, exakt)`),
          h('li', { key: 'digits' }, `Stellen: ${digitsOf(s.damageTotal)}`
            + (upcoming === null ? ' — alle Meilensteine erreicht' : ` — naechster Meilenstein ${formatNumber(upcoming)}`))),
        s.milestones.length === 0 ? null : h('ol', { className: '__cm_milestones' },
          s.milestones.slice(0, 5).map((entry, index) => h('li', { key: `${index}-${entry.at}` },
            `MEILENSTEIN ${formatNumber(entry.mark)}+ · ${entry.kind} · ${entry.label} → ${formatNumber(entry.value)} (${entry.digits} Stellen)`))));
    }

    /**
     * DAS REGELWERK, offen lesbar: Elementkreis, Synergie, Durchgriff, Buffs und
     * der Vererbungsbaum. Das System rechnet nicht klug, es schlaegt nach — wer
     * gewinnen will, muss die Tabelle lesen. Deshalb steht sie im Panel und
     * nicht in einer Hilfe.
     */
    function Rulebook({ s }) {
      const element = SPECIES[s.species].family;
      const lineage = LINEAGE[s.species] ?? {};
      const chain = [];
      let cursor = s.species;
      while (cursor !== undefined && cursor !== null && LINEAGE[cursor] !== undefined) {
        chain.push(cursor);
        cursor = LINEAGE[cursor].ancestor;
      }
      const abilityLabel = (id) => (ABILITIES.find((ability) => ability.id === id) ?? { label: id }).label;
      return h('div', { className: '__cm_block' },
        h('h3', null, 'Regelwerk (statisch)'),
        h('table', { className: '__cm_table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Angreifer / Ziel'),
            ...Object.keys(ELEMENTS).map((id) => h('th', { key: id }, ELEMENTS[id].label)))),
          h('tbody', null, Object.keys(ELEMENTS).map((attacker) => h('tr', { key: attacker },
            h('td', null, ELEMENTS[attacker].label),
            Object.keys(ELEMENTS).map((defender) => h('td', { key: defender }, `${ELEMENT_CHART[attacker][defender]}x`)))))),
        h('ul', { className: '__cm_facts' },
          h('li', { key: 'own' },
            `Eigenes Element: ${ELEMENTS[element].label} — schlaegt ${ELEMENTS[ELEMENTS[element].beats].label}, verliert gegen ${ELEMENTS[ELEMENTS[element].losesTo].label}`),
          h('li', { key: 'synergy' },
            `Synergie: speziell ${SYNERGY[`${element}:speziell`]}x · physisch ${SYNERGY[`${element}:physisch`]}x`),
          h('li', { key: 'category' },
            `Durchgriff: physisch ${CATEGORY.physisch.defFactor} · speziell ${CATEGORY.speziell.defFactor}`),
          h('li', { key: 'buff' }, `Buffs: ${BUFFS.map((buff) => `${buff.label} ${buff.factor}x`).join(' · ')}`),
          h('li', { key: 'line' },
            `Linie: ${chain.map((id) => SPECIES[id].label).join(' → ')} (Generation ${lineage.generation ?? 1})`),
          h('li', { key: 'inherits' },
            `Erbfaehigkeiten: ${(lineage.inherits ?? []).map(abilityLabel).join(', ') || 'keine'}`)),
        h('p', { className: '__cm_sub' },
          'Der Schaden ist BaseDamage x Element x Synergie x Buff - DEF x Durchgriff — fuenf Nachschlagevorgaenge, kein Zweig.'));
    }

    /**
     * DIE SKINNER-BOX, offen: Quoten und Zaehler stehen da. Es gibt keine Gnade
     * und keinen Pity-Timer — nur die Zahl der Siege seit dem letzten Shiny,
     * damit die irrationale Erwartung eine Anzeige hat.
     */
    function DropLedger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Beute — ${formatNumber(s.loot.shiny)} shiny`),
        h('ul', { className: '__cm_facts' },
          LOOT_TABLE.map((entry) => h('li', { key: entry.id },
            `${entry.label}: ${lootOdds(entry)} % — ${formatNumber(s.loot[entry.id] ?? 0)} gefunden`)),
          h('li', { key: 'streak' }, `${formatNumber(s.sinceShiny)} Siege seit dem letzten Shiny`)),
        s.drops.length === 0 ? null : h('ul', { className: '__cm_log' },
          s.drops.slice(0, 5).map((drop, index) => h('li', { key: `${index}-${drop.at}` }, `${drop.label} (Gegner L${drop.level})`))));
    }

    /** Bilanz und Log. Die Zahlen kommen aus dem Store, nicht aus der Darstellung. */
    function Ledger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Bilanz — ${s.wins} Siege / ${s.losses} K.o.`),
        h('p', { className: '__cm_sub' },
          '1 XP pro Token · Sieg XP nach Gegner-Level (multiplikativ) · jede Runde verzoegert, kein Input waehrend eines Zuges'),
        h('ul', { className: '__cm_log' },
          s.log.slice(0, 12).map((line, index) => h('li', { key: `${index}-${line}` }, line))));
    }

    function CodingmonPanel() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      const mine = statsAt(s.species, lvl);
      // Angezeigt wird die EXAKTE Leiter, gerechnet die schnelle Number-Fassung.
      const exact = statsAtExact(s.species, lvl);
      const learned = abilitiesFor(lvl, s.species);

      return h('div', { className: '__cm_panel' },
        h(PetHead, { s, lvl, onPick: pickSpecies }),
        h(StatsGrid, { stats: exact }),
        h(Arena, {
          s,
          lvl,
          myStats: mine,
          abilities: learned,
          onUse: useAbility,
          onStart: startBattle,
          onRest: rest,
        }),
        h(EscalationBlock, { s, lvl }),
        h(Rulebook, { s }),
        h(DropLedger, { s }),
        h(Ledger, { s }),
      );
    }

    // ── Styles ──────────────────────────────────────────────────────────────
    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/codingmon.css`, `
      .__cm_mark { display: inline-flex; align-items: center; }
      .__cm_panel { padding: 14px; height: 100%; overflow: auto; color: var(--dsw-alias-label-primary, #E0E7FF);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); }
      .__cm_panel-head { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
      .__cm_panel-stage { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .__cm_panel-id { flex: 1; }
      .__cm_panel-id h2 { margin: 0; font-family: var(--shinon-font-head, ui-sans-serif); letter-spacing: .06em; }
      .__cm_sub { margin: 2px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_xp { margin: 6px 0 4px; font-size: 12px; }
      .__cm_pick { display: flex; align-items: center; gap: 6px; margin: 6px 0; font-size: 12px; }
      .__cm_pick select { flex: 1; background: rgba(255,255,255,.05); color: inherit; border-radius: 5px;
        border: 1px solid rgba(124,58,237,.45); padding: 3px 6px; font: inherit; }
      .__cm_bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; min-width: 120px; margin: 2px 0; }
      .__cm_bar-fill { height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .25s ease; }
      .__cm_bar[data-tone="hp"] .__cm_bar-fill { background: linear-gradient(90deg,#22c55e,#84cc16); }
      .__cm_bar[data-tone="enemy"] .__cm_bar-fill { background: linear-gradient(90deg,#ef4444,#f59e0b); }
      .__cm_btn, .__cm_move { font-size: 11px; padding: 4px 9px; border-radius: 5px; cursor: pointer;
        background: rgba(124,58,237,.18); color: inherit; border: 1px solid rgba(124,58,237,.45); }
      .__cm_btn:disabled, .__cm_move:disabled { opacity: .45; cursor: not-allowed; }
      .__cm_move { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 132px; }
      .__cm_stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px,1fr)); gap: 8px; margin-bottom: 14px; }
      .__cm_stat { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); }
      .__cm_stat-k { font-size: 10px; letter-spacing: .1em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_stat-v { font-size: 15px; font-weight: 700; }
      .__cm_block { margin-bottom: 14px; }
      .__cm_block h3, .__cm_arena h3 { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_arena { margin-bottom: 14px; }
      .__cm_board { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center;
        padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));
        border: 1px solid rgba(124,58,237,.25); }
      .__cm_side { display: flex; gap: 10px; align-items: center; }
      .__cm_side--enemy { flex-direction: row-reverse; text-align: right; }
      .__cm_side-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .__cm_side-id strong { font-size: 13px; }
      .__cm_vs { font-size: 11px; letter-spacing: .2em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
      .__cm_move-name { font-weight: 600; }
      .__cm_move-meta { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_log { list-style: none; margin: 0; padding: 0; font-size: 12px; }
      .__cm_log li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }

      /* Globale EXP-Leiste im Composer-Dock: sichtbar in jeder Sitzung. */
      .__cm_expbar { display: flex; align-items: center; gap: 8px; width: 100%;
        padding: 4px 8px; margin-bottom: 6px; border-radius: 6px;
        background: color-mix(in srgb, var(--shinon-void, #0B0F14) 45%, transparent);
        border: 1px solid color-mix(in srgb, var(--shinon-violet, #7C3AED) 35%, transparent);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 11px; }
      .__cm_expbar-pet { display: inline-flex; }
      .__cm_expbar-lvl { font-weight: 700; letter-spacing: .08em; color: var(--shinon-violet-light, #A855F7); }
      .__cm_expbar-track { flex: 1; height: 7px; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,.12); }
      .__cm_expbar-fill { display: block; height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .3s ease; }
      .__cm_expbar-meta { color: var(--dsw-alias-label-secondary, #9aa); white-space: nowrap; }
      /* Die Sperre: Balken, Absagesatz, Zaehler der kalten Abweisungen. */
      .__cm_lock { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; margin-bottom: 10px;
        border-radius: 6px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); }
      .__cm_lock-text { font-size: 12px; font-weight: 600; color: #fca5a5; }
      .__cm_lock-track { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,.14); }
      .__cm_lock-fill { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: left center;
        background: linear-gradient(90deg,#ef4444,#f59e0b); animation-name: __cm_lock-grow;
        animation-timing-function: linear; animation-fill-mode: forwards; }
      @keyframes __cm_lock-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .__cm_facts { list-style: none; margin: 0 0 8px; padding: 0; font-size: 12px; }
      .__cm_facts li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
      .__cm_table th, .__cm_table td { padding: 3px 6px; text-align: left;
        border-bottom: 1px solid rgba(255,255,255,.08); }
      .__cm_table th { font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_milestones { margin: 6px 0 0; padding-left: 18px; font-size: 12px;
        color: var(--shinon-violet-light, #A855F7); }
      @media (prefers-reduced-motion: reduce) {
        .__cm_bar-fill, .__cm_expbar-fill { transition: none; }
        .__cm_lock-fill { animation: none; transform: scaleX(1); }
      }
    `);

    // ── Seams ────────────────────────────────────────────────────────────────
    return {
      inject: ['slots'],
      /**
       * Fenster-API — zugleich die Naht, ueber die @shinon/core die Marke
       * abgibt, und die Stelle, an der eine Probe den Zustand pruefen kann
       * (dasselbe Muster wie window.__mk bei @shinon/markers).
       */
      PetMark,
      apply(ctx) {
        // Sichtbarkeit: jede Client-Haelfte meldet sich in der gemeinsamen Liste
        // an, damit @shinon/dashboard sie zeigen kann. Kein Hintergrundprozess
        // ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Codingmon', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
        // Der Context des Client-Bundles: an ihm haengt (oder haengt nicht) der
        // Remote-Beitrag. Er wird nicht kopiert und nicht gehalten ueber den
        // Abbau hinaus — der Zustand des Spiegels ist der Zustand, nicht der Context.
        clientCtx = ctx;

        window.__codingmon = {
          plugin: PLUGIN,
          PetMark,
          state: () => ({ ...store, level: level(), stats: stats(), form: formOf(level()).label }),
          species: () => SPECIES_IDS.slice(),
          abilities: () => abilitiesFor(level(), store.species),
          arena: (round) => arenaFor(level(), round ?? store.round),
          start: () => startBattle(),
          use: (id) => useAbility(id),
          rest,
          pick: (id) => pickSpecies(id),
          addXp: (xp) => award(xp, `+${xp} XP (manuell)`),
          /** Die laufende Sperre (null = kein Zug). */
          lock: () => lockStatus(),
          /** Wie viele Eingaben die Sperre kalt abgewiesen hat. */
          rejections: () => store.rejections,
          /** Der Lebenslauf als Dezimaltext (BigInt ueberlebt JSON nicht). */
          damageTotal: () => store.damageTotal.toString(),
          milestones: () => store.milestones.slice(),
          /** Der Zustand der Uebergabe (Client -> Host): gespiegelt, abgelehnt, kein Kanal. */
          host: () => ({ ...hostMirror }),
          /** Die Uebergabe von Hand ausloesen — dieselbe Naht, die jeder Zug nimmt. */
          mirror: () => toHost(),
          /** Das Regelwerk, wie das Panel es liest. */
          rulebook: () => ({
            elements: Object.keys(ELEMENTS),
            chart: ELEMENT_CHART,
            category: CATEGORY,
            synergy: SYNERGY,
            buffs: BUFFS,
            lineage: LINEAGE,
            pacing: { ...PACING, delayMs: roundDelayMs },
          }),
          /** Die Loot-Tabelle samt Quote und der reine Wurf. */
          loot: () => ({ table: LOOT_TABLE.map((entry) => ({ ...entry, odds: lootOdds(entry) })), total: LOOT_TOTAL, roll: rollLoot }),
          /**
           * Der Vertrag, wie ihn nur der Client nachrechnen kann — dieselben
           * Funktionen, die der Host exportiert. Eine Probe vergleicht beide
           * Seiten Zahl fuer Zahl, damit die Dopplung nicht auseinanderlaeuft.
           */
          contract: () => ({
            threshold: (level) => threshold(level),
            levelFor: (xp) => levelFor(xp),
            statsAt: (speciesId, level) => statsAt(speciesId, level),
            /** Dieselben Werte EXAKT, als Dezimaltext (JSON kennt kein BigInt). */
            statsAtExact: (speciesId, level) => Object.fromEntries(
              Object.entries(statsAtExact(speciesId, level)).map(([key, value]) => [key, value.toString()]),
            ),
            /** Die Decke der Leiter. */
            levelCap: () => LEVEL_CAP,
            rewardFor: (level) => rewardFor(level),
            arenaFor: (level, round) => arenaFor(level, round),
            abilitiesFor: (level, speciesId) => abilitiesFor(level, speciesId).map((ability) => ability.id),
            inherited: (speciesId) => inheritedAbilities(speciesId).slice(),
            chart: () => ELEMENT_CHART,
            ladder: (base, level) => powerAtExact(base, level).toString(),
            describeValue: (base, level) => {
              const value = describeValue(base, level);
              return { text: value.text, digits: value.digits, safe: value.safe };
            },
            rollLoot: (uniform) => rollLoot(uniform).id,
            resolveAttack: (abilityId, speciesId, defenderSpeciesId, level) => {
              const ability = ABILITIES.find((entry) => entry.id === abilityId) ?? ABILITIES[0];
              const own = statsAt(speciesId, level);
              const attacker = {
                element: SPECIES[speciesId].family,
                stats: own,
                hp: own.hp,
                maxHp: own.hp,
                inherited: inheritedAbilities(speciesId),
              };
              const defender = { element: SPECIES[defenderSpeciesId].family, stats: statsAt(defenderSpeciesId, level) };
              const result = resolveAttack(ability, attacker, defender);
              return { ...result, buff: result.buff.id };
            },
          }),
          reset: () => {
            for (const timer of timers.values()) window.clearTimeout(timer);
            timers.clear();
            store = freshState(store.species);
            persist();
            emit();
          },
        };

        ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, PetMark));
        ctx.slots.inject('conversation.hero.brand.mark', () =>
          ctx.slots.register({ name: 'conversation.hero.brand.mark' }, PetMark));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, CodingmonPanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 25,
          label: () => 'Codingmon',
        }, CodingmonIcon));
        // Die globale EXP-Leiste: derselbe Store, andere Ansicht.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-exp-bar',
          order: 20,
        }, ExpBar));

        // XP aus dem Token-Zaehler. Der Takt ist bewusst traege: das Pet soll
        // den Agenten nicht ausbremsen. Kaempfe laufen NUR auf Klick.
        const tokenTimer = window.setInterval(tickTokens, 2000);

        ctx.effect?.(() => () => {
          window.clearInterval(tokenTimer);
          // Ein laufender Zug haengt an einem Timer, und der Abbau nimmt ihn mit.
          // Sonst feuerte `settle` in ein Bundle, das es nicht mehr gibt, und der
          // Zustand behauptete eine Sperre ohne Uhr — eine Wartezeit ohne Ende.
          for (const timer of timers.values()) window.clearTimeout(timer);
          timers.clear();
          if (store.lock !== null) {
            store.lock = null;
            persist();
          }
          // Der Context des Client-Bundles, an dem der Beitrag haengt, wird NICHT
          // abgeraeumt (er gehoert der Composition, nicht diesem Bundle) — aber
          // die Referenz darauf: ein abgebautes Bundle darf keinen Context halten.
          clientCtx = null;
          delete window.__codingmon;
        });

        console.log(`[shinon-codingmon] Arena aktiv — ${SPECIES_IDS.length} Codemons, Level ${level()}, ${abilitiesFor(level(), store.species).length} Faehigkeiten`);
      },
    };
  },
});
