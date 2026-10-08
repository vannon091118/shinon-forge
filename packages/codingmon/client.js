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
    const STORAGE_KEY = 'shinon.codingmon/v1';
    const XP_PER_LEVEL = 250;

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
    const GROWTH = { hp: 8, atk: 2, def: 2, agi: 1, int: 1 };

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

    // ── Reine Funktionen (Spiegel des Host-Vertrags) ─────────────────────────
    const speciesOfFamily = (family) => SPECIES_IDS.find((id) => SPECIES[id].family === family) ?? SPECIES_IDS[0];
    const threshold = (level) => (XP_PER_LEVEL * (level - 1) * level) / 2;
    const levelFor = (xp) => {
      let level = 1;
      while (threshold(level + 1) <= xp) level += 1;
      return level;
    };
    const statsAt = (speciesId, level) => {
      const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      const steps = Math.max(0, Math.floor(level) - 1);
      return {
        hp: base.hp + GROWTH.hp * steps,
        atk: base.atk + GROWTH.atk * steps,
        def: base.def + GROWTH.def * steps,
        agi: base.agi + GROWTH.agi * steps,
        int: base.int + GROWTH.int * steps,
      };
    };
    const abilitiesFor = (level, speciesId) =>
      ABILITIES.filter((ability) => ability.minLevel <= level
        && (ability.species === null || ability.species === speciesId));
    const formOf = (level) => STAGES[stageIndex(level)];
    const damageOf = (ability, stats, defenderDef) =>
      Math.max(1, Math.round((ability.power * (stats[ability.stat] ?? 0)) / 10 - defenderDef * 0.8));
    const rewardFor = (level) => 20 + 8 * Math.max(1, Math.floor(level));
    const firstStrike = (challengerStats, enemyStats) => (challengerStats.agi >= enemyStats.agi ? 'challenger' : 'enemy');
    const arenaFor = (level, round) => {
      const lvl = Math.max(1, Math.floor(level));
      const rnd = Math.max(0, Math.floor(round));
      const speciesId = SPECIES_IDS[(lvl * 3 + rnd * 7) % SPECIES_IDS.length];
      const enemyLevel = Math.max(1, lvl + ((rnd % 3) - 1));
      return { speciesId, level: enemyLevel, stats: statsAt(speciesId, enemyLevel), reward: rewardFor(enemyLevel) };
    };
    /** Die staerkste Faehigkeit eines Gegners. Determinismus statt Wuerfel. */
    const bestMove = (level, speciesId) =>
      abilitiesFor(level, speciesId).slice().sort((a, b) => b.power - a.power)[0] ?? ABILITIES[0];

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
    });

    /**
     * Einen gelesenen Stand BRAUCHBAR machen: ein Pet aus einer aelteren
     * Fassung (die drei Spezies spark/byte/feral) darf den Client nicht mit
     * `undefined`-Werten in die Arena schicken. Unbekannte Spezies fallen auf
     * die erste zurueck, ein Kampf mit unbekanntem Gegner wird verworfen —
     * XP, Siege und Log bleiben.
     */
    function revive(raw) {
      const state = { ...freshState(), ...raw };
      if (!SPECIES[state.species]) state.species = SPECIES_IDS[0];
      if (!Number.isFinite(state.xp) || state.xp < 0) state.xp = 0;
      if (!Number.isFinite(state.round) || state.round < 0) state.round = 0;
      const battle = state.battle;
      const usable = battle !== null && typeof battle === 'object' && SPECIES[battle.speciesId]
        && Number.isFinite(battle.hp) && Number.isFinite(battle.maxHp);
      state.battle = usable ? battle : null;
      if (!Number.isFinite(state.hp) || state.hp <= 0) state.hp = statsAt(state.species, levelFor(state.xp)).hp;
      return state;
    }

    let store = freshState();
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) store = revive(JSON.parse(raw));
    } catch { /* kein Storage: das Pet lebt dann nur in dieser Sitzung */ }

    const persist = () => {
      try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* siehe oben */ }
    };
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

    function award(xp, reason) {
      const before = level();
      store.xp += xp;
      const after = level();
      if (after > before) {
        const learned = abilitiesFor(after, store.species)
          .filter((ability) => ability.minLevel > before);
        store.hp = statsAt(store.species, after).hp;
        note(`LEVEL ${after} — ${formOf(after).label}!${learned.length ? ` Gelernt: ${learned.map((a) => a.label).join(', ')}` : ''}`);
      } else if (reason) {
        note(reason);
      }
      persist();
      emit();
    }

    function tickTokens() {
      const gained = xpFromTokens();
      if (gained > 0) award(gained, null);
    }

    // ── Arena: rundenbasiert, nur auf Klick ─────────────────────────────────
    /** Einen Gegner stellen. Ohne laufenden Kampf; sonst passiert nichts. */
    function startBattle() {
      if (store.battle !== null) return store.battle;
      const arena = arenaFor(level(), store.round);
      store.round += 1;
      store.battle = {
        speciesId: arena.speciesId,
        level: arena.level,
        hp: arena.stats.hp,
        maxHp: arena.stats.hp,
        stats: arena.stats,
        reward: arena.reward,
        turn: firstStrike(stats(), arena.stats),
        over: null,
      };
      note(`Runde ${store.round}: ${SPECIES[arena.speciesId].label} L${arena.level} erscheint (${arena.reward} XP)`);
      if (store.battle.turn === 'enemy') enemyTurn();
      persist();
      emit();
      return store.battle;
    }

    /** Der Gegner schlaegt zurueck — dieselbe reine Schadensformel. */
    function enemyTurn() {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return;
      const move = bestMove(battle.level, battle.speciesId);
      const dealt = damageOf(move, battle.stats, stats().def);
      store.hp = Math.max(0, store.hp - dealt);
      note(`${SPECIES[battle.speciesId].label} nutzt ${move.label} —${dealt} (eigenes HP ${store.hp}/${maxHp()})`);
      if (store.hp <= 0) finish('loss', battle);
      else battle.turn = 'challenger';
    }

    /** Eine gewaehlte Faehigkeit ausfuehren: Schaden, dann ist der Gegner dran. */
    function useAbility(abilityId) {
      const battle = store.battle;
      if (battle === null || battle.over !== null || battle.turn !== 'challenger') return null;
      const move = abilitiesFor(level(), store.species).find((ability) => ability.id === abilityId)
        ?? abilitiesFor(level(), store.species)[0];
      const dealt = damageOf(move, stats(), battle.stats.def);
      battle.hp = Math.max(0, battle.hp - dealt);
      note(`${move.label} —${dealt} gegen ${SPECIES[battle.speciesId].label} (${battle.hp}/${battle.maxHp} HP)`);
      if (battle.hp <= 0) finish('win', battle);
      else {
        battle.turn = 'enemy';
        enemyTurn();
      }
      persist();
      emit();
      return { move: move.id, dealt, battle: { ...battle } };
    }

    /** Kampfende. Sieg zahlt XP (die einzige XP-Quelle neben den Token), K.o. heilt. */
    function finish(outcome, battle) {
      battle.over = outcome;
      if (outcome === 'win') {
        store.wins += 1;
        const reward = battle.reward;
        store.battle = null;
        note(`Sieg gegen ${SPECIES[battle.speciesId].label} L${battle.level} — +${reward} XP`);
        award(reward, null);
      } else {
        store.losses += 1;
        store.battle = null;
        store.hp = maxHp();
        note(`K.o. gegen ${SPECIES[battle.speciesId].label} L${battle.level} — das Codemon rappelt sich wieder auf`);
      }
    }

    /** Rast: HP auffuellen. Kein Sieg, kein XP — die einzige Heilung ausser K.o. */
    function rest() {
      if (store.battle !== null) return;
      store.hp = maxHp();
      note('Rast — HP aufgefrischt');
      persist();
      emit();
    }

    /** Spezies wechseln. Der Fortschritt (XP, Siege) bleibt, der Kampf endet. */
    function pickSpecies(speciesId) {
      if (!SPECIES[speciesId]) return;
      store.species = speciesId;
      store.battle = null;
      store.hp = statsAt(speciesId, level()).hp;
      note(`Gewechselt zu ${SPECIES[speciesId].label}`);
      persist();
      emit();
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
        h('span', { className: '__cm_expbar-meta' }, `${s.xp} XP · HP ${Math.max(0, s.hp)}/${maxHp()}`),
      );
    }

    // ── Panel-Bausteine (Kopf / Werte / Arena / Liste / Bilanz) ─────────────
    /** Kopf: Figur, Spezies-Wahl (alle ZEHN erreichbar), Level und Fortschritt. */
    function PetHead({ s, lvl, onPick }) {
      const cur = statsAt(s.species, lvl);
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      return h('header', { className: '__cm_panel-head' },
        h('span', { className: '__cm_panel-stage' },
          h('span', { dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 72) } }),
          h('span', { className: '__cm_sub' }, formOf(lvl).label)),
        h('div', { className: '__cm_panel-id' },
          h('h2', null, `${s.name} — ${SPECIES[s.species].label}`),
          h('p', { className: '__cm_sub' }, `Level ${lvl} · ${s.wins} Siege / ${s.losses} K.o. · Runde ${s.round}`),
          h('p', { className: '__cm_xp' }, `${s.xp} XP · ${next - s.xp} XP bis Level ${lvl + 1}`),
          h(Bar, { value: s.xp - prev, max: Math.max(1, next - prev), tone: 'xp' }),
          h('label', { className: '__cm_pick' },
            h('span', null, 'Codemon'),
            h('select', {
              value: s.species,
              onChange: (event) => onPick(event.target.value),
            }, SPECIES_IDS.map((id) => h('option', { key: id, value: id }, SPECIES[id].label)))),
          h('p', { className: '__cm_sub' }, `HP ${Math.max(0, s.hp)}/${cur.hp}`),
        ),
      );
    }

    /** Werte in einer Zeile — dieselben fuenf Zahlen wie im Vertrag. */
    function StatsGrid({ stats }) {
      return h('div', { className: '__cm_stats' },
        [['HP', stats.hp], ['ATK', stats.atk], ['DEF', stats.def], ['AGI', stats.agi], ['INT', stats.int]]
          .map(([label, value]) => h('div', { className: '__cm_stat', key: label },
            h('span', { className: '__cm_stat-k' }, label),
            h('span', { className: '__cm_stat-v' }, String(value)))));
    }

    /** Eine Seite der Arena: Figur, Name, Level, HP-Balken, Werte. */
    function ArenaSide({ side, speciesId, level: lvl, hp, maxHp: top, stats: values }) {
      return h('div', { className: `__cm_side __cm_side--${side}` },
        h('span', { dangerouslySetInnerHTML: { __html: speciesGlyph(speciesId, lvl, 56) } }),
        h('div', { className: '__cm_side-id' },
          h('strong', null, SPECIES[speciesId].label),
          h('span', { className: '__cm_sub' }, `L${lvl}`),
          h(Bar, { value: hp, max: top, tone: side === 'enemy' ? 'enemy' : 'hp' }),
          h('span', { className: '__cm_sub' }, `HP ${Math.max(0, hp)}/${top} · ATK ${values.atk} · DEF ${values.def}`)),
      );
    }

    /**
     * Die Arena: Gegner, eigenes Codemon und die Knoepfe der Faehigkeiten.
     * Ein Klick ist eine Runde. Ist der Gegner am Zug, sind die Knoepfe
     * gesperrt — die Anzeige sagt, warum.
     */
    function Arena({ s, lvl, myStats, abilities, onUse, onStart, onRest }) {
      const battle = s.battle;
      const myTurn = battle !== null && battle.over === null && battle.turn === 'challenger';
      return h('section', { className: '__cm_arena' },
        h('h3', null, 'Arena'),
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
            disabled: battle !== null && !myTurn,
            title: battle === null ? 'Erst einen Gegner stellen' : `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`,
            onClick: () => onUse(ability.id),
          },
            h('span', { className: '__cm_move-name' }, ability.label),
            h('span', { className: '__cm_move-meta' }, `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`))),
        ),
        h('div', { className: '__cm_actions' },
          h('button', {
            type: 'button',
            className: '__cm_btn',
            disabled: battle !== null,
            onClick: onStart,
          }, battle === null ? 'Naechster Gegner' : `Gegner: ${SPECIES[battle.speciesId].label} L${battle.level}`),
          h('button', {
            type: 'button',
            className: '__cm_btn',
            disabled: battle !== null,
            onClick: onRest,
          }, 'Rast (+HP)'),
          h('span', { className: '__cm_sub' }, battle === null
            ? `${Math.max(0, s.hp)}/${myStats.hp} HP`
            : (battle.turn === 'challenger' ? 'Du bist am Zug' : 'Gegner ist am Zug'))),
      );
    }

    /** Bilanz und Log. Die Zahlen kommen aus dem Store, nicht aus der Darstellung. */
    function Ledger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Bilanz — ${s.wins} Siege / ${s.losses} K.o.`),
        h('p', { className: '__cm_sub' }, '1 XP pro Token · Sieg XP nach Gegner-Level · Faehigkeiten ab Level 4 die zweite'),
        h('ul', { className: '__cm_log' },
          s.log.slice(0, 10).map((line, index) => h('li', { key: `${index}-${line}` }, line))));
    }

    function CodingmonPanel() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      const mine = statsAt(s.species, lvl);
      const learned = abilitiesFor(lvl, s.species);

      return h('div', { className: '__cm_panel' },
        h(PetHead, { s, lvl, onPick: pickSpecies }),
        h(StatsGrid, { stats: mine }),
        h(Arena, {
          s,
          lvl,
          myStats: mine,
          abilities: learned,
          onUse: useAbility,
          onStart: startBattle,
          onRest: rest,
        }),
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
      @media (prefers-reduced-motion: reduce) {
        .__cm_bar-fill, .__cm_expbar-fill { transition: none; }
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
          reset: () => { store = freshState(store.species); persist(); emit(); },
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
          delete window.__codingmon;
        });

        console.log(`[shinon-codingmon] Arena aktiv — ${SPECIES_IDS.length} Codemons, Level ${level()}, ${abilitiesFor(level(), store.species).length} Faehigkeiten`);
      },
    };
  },
});
