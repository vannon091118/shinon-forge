/**
 * @shinon/codingmon — Client-Hälfte (das Pet).
 *
 * Codingmon ersetzt das Helmchen in `sidebar.brand.mark` und
 * `conversation.hero.brand.mark`. Der Austausch laeuft ueber eine
 * Fenster-Konvention, nicht ueber einen Import: dieser Client legt
 * `window.__codingmon` mit `PetMark` an, und @shinon/core rendert die Marke
 * nur dann selbst, wenn dort nichts liegt. Dasselbe Muster benutzt
 * @shinon/markers bereits mit `window.__mk` — Pakete bleiben so referenzfrei.
 *
 * XP: 1 XP pro Token. Der Token-Zaehler wird aus dem Zaehler gelesen, den die
 * DSH-Oberflaeche ohnehin rendert. Das ist bewusst eine BRUECKE und keine
 * saubere Naht — stabil genug fuer ein Pet, aber die erste Stelle, die man
 * ersetzt, sobald der Client eine Store- oder Service-Naht fuer Usage hat.
 * `xpFromTokens()` ist deshalb die einzige Stelle, die die Quelle kennt.
 *
 * Der Client handelt nie autonom: Kaempfe passieren nur auf Klick, das Pet
 * greift nichts von selbst an.
 */
window.__ModuleLoader__.load({
  id: '@shinon/codingmon',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/codingmon';
    const PANEL_ID = 'shinon-codingmon';
    const STORAGE_KEY = 'shinon.codingmon/v1';

    // ── Vertrag (Spiegel der Host-Hälfte in index.js) ───────────────────────
    // Bewusst dupliziert: Client- und Host-Bundle teilen keinen Code, und ein
    // Import quer ueber Pakete ist in diesem Repo nicht erlaubt.
    const SPECIES = {
      spark: { label: 'Spark', hue: 268, hp: 42, atk: 9, def: 7, agi: 8, int: 6 },
      byte: { label: 'Byte', hue: 212, hp: 38, atk: 7, def: 9, agi: 6, int: 10 },
      feral: { label: 'Feral', hue: 340, hp: 48, atk: 11, def: 6, agi: 9, int: 4 },
    };
    const GROWTH = { hp: 8, atk: 2, def: 2, agi: 1, int: 1 };
    /**
     * Faehigkeiten. `species === null` = von jeder Linie lernbar; sonst eine
     * Signatur-Faehigkeit der Linie. `stat` bestimmt, welcher Wert den Schaden
     * traegt — dadurch spielen sich die drei Linien wirklich unterschiedlich:
     * spark ueber Tempo, byte ueber Verstand, feral ueber rohe Kraft.
     */
    const ATTACKS = [
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
    const XP_PER_LEVEL = 250;

    /**
     * Entwicklungsstufen. Jede Spezies hat genau drei Formen; die Stufe haengt
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

    /** Palette je Spezies-Farbton — dieselben Rollen fuer alle Sprites. */
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
    for (const [speciesId, stages] of Object.entries(SPRITES)) {
      stages.forEach((rows, stage) => {
        const bad = rows.length !== 16 || rows.some((row) => row.length !== 16);
        if (bad) console.warn(`[shinon-codingmon] Sprite ${speciesId}#${stage} ist nicht 16x16 (${rows.length} Zeilen)`);
      });
    }

    const spriteCache = new Map();
    /**
     * Matrix -> SVG. `shape-rendering: crispEdges` plus 1x1-Rects im 16er-
     * viewBox: die Pixel bleiben beim Skalieren scharf, es wird kein Bild
     * interpoliert. Ergebnis wird je Spezies/Stufe/Groesse zwischengespeichert.
     */
    function spriteSvg(speciesId, stage, size) {
      const key = `${speciesId}:${stage}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const rows = (SPRITES[speciesId] ?? SPRITES.spark)[stage] ?? SPRITES.spark[0];
      const colors = paletteFor((SPECIES[speciesId] ?? SPECIES.spark).hue);
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

    const threshold = (level) => (XP_PER_LEVEL * (level - 1) * level) / 2;
    const levelFor = (xp) => {
      let level = 1;
      while (threshold(level + 1) <= xp) level += 1;
      return level;
    };
    const statsAt = (speciesId, level) => {
      const base = SPECIES[speciesId] ?? SPECIES.spark;
      const steps = Math.max(0, Math.floor(level) - 1);
      return {
        hp: base.hp + GROWTH.hp * steps,
        atk: base.atk + GROWTH.atk * steps,
        def: base.def + GROWTH.def * steps,
        agi: base.agi + GROWTH.agi * steps,
        int: base.int + GROWTH.int * steps,
      };
    };
    const attacksFor = (level, speciesId = store.species) =>
      ATTACKS.filter((attack) => attack.minLevel <= level
        && (attack.species === null || attack.species === speciesId));
    const formOf = (level) => STAGES[stageIndex(level)];
    const damageOf = (attack, stats, defenderDef) =>
      Math.max(1, Math.round((attack.power * (stats[attack.stat] ?? 0)) / 10 - defenderDef * 0.8));

    // ── Store ───────────────────────────────────────────────────────────────
    const listeners = new Set();
    const emit = () => { for (const fn of listeners) { try { fn(); } catch { /* ein Abnehmer darf den Rest nicht kippen */ } } };
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
    const useStore = () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => subscribe(() => bump((n) => n + 1)), []);
      return store;
    };

    const freshState = (speciesId = 'spark') => ({
      name: 'Codingmon',
      species: speciesId,
      xp: 0,
      peakTokens: 0,
      hp: statsAt(speciesId, 1).hp,
      wins: 0,
      losses: 0,
      log: [],
    });

    let store = freshState();
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) store = { ...freshState(), ...JSON.parse(raw) };
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
        const learned = attacksFor(after).filter((attack) => attack.minLevel > (attacksFor(before).length ? before : 1) - 1);
        store.hp = maxHp();
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

    // ── Wilde Pets + Kaempfe ────────────────────────────────────────────────
    let overlay = null;
    const wilds = new Map();
    let wildSeq = 0;

    function overlayRoot() {
      if (overlay?.isConnected) return overlay;
      overlay = document.createElement('div');
      overlay.className = '__cm_root';
      overlay.setAttribute('data-plugin', PLUGIN);
      document.body.appendChild(overlay);
      return overlay;
    }

    const wildStats = (lvl) => statsAt('feral', lvl);

    function spawnWild() {
      const limit = 3;
      if (wilds.size >= limit) return;
      const lvl = Math.max(1, level() + Math.floor(Math.random() * 5) - 2);
      const stats = wildStats(lvl);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = '__cm_wild';
      el.title = `Wildes Codingmon · Level ${lvl} · klicken zum Angreifen`;
      el.innerHTML = `<span class="__cm_wild-body">${wildGlyph(lvl, 26 + Math.min(18, lvl))}</span>`
        + `<span class="__cm_wild-tag">L${lvl} · ${stats.hp} HP</span>`;
      const id = `w${++wildSeq}`;
      const wild = { id, level: lvl, hp: stats.hp, maxHp: stats.hp, def: stats.def, atk: stats.atk, x: 0, y: 0, el };
      wilds.set(id, wild);
      overlayRoot().appendChild(el);
      moveWild(wild);
      el.addEventListener('click', (event) => { event.preventDefault(); strike(wild); });
      return wild;
    }

    function moveWild(wild) {
      const w = overlayRoot().clientWidth || 900;
      const hgt = overlayRoot().clientHeight || 600;
      wild.x = Math.round(w * (0.08 + Math.random() * 0.8));
      wild.y = Math.round(hgt * (0.12 + Math.random() * 0.68));
      wild.el.style.transform = `translate(${wild.x}px, ${wild.y}px)`;
    }

    function retireWild(wild, defeated) {
      wild.el.classList.add(defeated ? '__cm_wild--down' : '__cm_wild--flee');
      setTimeout(() => wild.el.remove(), 420);
      wilds.delete(wild.id);
    }

    /** Ein Klick ist eine Attacke — die einzige Handlung, die dieses Pet kennt. */
    function strike(wild) {
      const mine = stats();
      const move = attacksFor(level()).slice(-1)[0] ?? ATTACKS[0];
      const dealt = damageOf(move, mine, wild.def);
      wild.hp -= dealt;

      if (wild.hp <= 0) {
        const reward = 20 * wild.level;
        store.wins += 1;
        note(`${move.label} trifft · wildes Level ${wild.level} besiegt (+${reward} XP)`);
        retireWild(wild, true);
        award(reward, null);
        return;
      }

      // Nur der Wildling schlaegt zurueck — das eigene Pet greift nie von selbst an.
      const back = Math.max(1, Math.round((wild.atk * 8) / 10 - mine.def * 0.8));
      store.hp -= back;
      note(`${move.label} —${dealt} · Rueckstoss —${back}`);
      if (store.hp <= 0) {
        store.losses += 1;
        store.hp = maxHp();
        note('K.o. — das Pet rappelt sich wieder auf');
      }
      wild.el.classList.add('__cm_wild--hit');
      setTimeout(() => wild.el.classList.remove('__cm_wild--hit'), 220);
      persist();
      emit();
    }

    /** Silhouette nach Stufe — waechst sichtbar mit dem Level. */
    /** Wilde Codingmon: dieselbe Pixelart-Maschine, eigene Linie, Groesse nach Stufe. */
    function wildGlyph(lvl, size) {
      return spriteSvg('feral', stageIndex(lvl), size);
    }

    // ── Das Pet selbst ──────────────────────────────────────────────────────
    /**
     * Prozedurales SVG: keine Asset-Datei, damit das Pet mit dem Level wachsen
     * kann. Die Merkmale kommen aus dem Level, nicht aus Zufall.
     */
    /**
     * Die Figur des Pets. Pixelart aus SPRITES — die Entwicklungsstufe waehlt
     * die Matrix, es wird nichts prozedural gezeichnet.
     */
    function petGlyph(speciesId, lvl, size) {
      return spriteSvg(speciesId, stageIndex(lvl), size);
    }

    /** Die Marke — von @shinon/core aus den Brand-Slots gerendert. */
    function PetMark({ size = 24 }) {
      const s = useStore();
      const lvl = levelFor(s.xp);
      return h('span', {
        className: '__cm_mark',
        title: `${s.name} · Level ${lvl} · ${formOf(lvl).label}`,
        dangerouslySetInnerHTML: { __html: petGlyph(s.species, lvl, size) },
      });
    }

    function CodingmonIcon() {
      const s = useStore();
      return h('span', {
        className: '__cm_mark',
        dangerouslySetInnerHTML: { __html: petGlyph(s.species, levelFor(s.xp), 18) },
      });
    }

    function Bar({ value, max, tone }) {
      const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
      return h('div', { className: '__cm_bar', 'data-tone': tone ?? 'xp' },
        h('div', { className: '__cm_bar-fill', style: { width: `${pct}%` } }));
    }

    // TODO: [DSH-Refactor] - 54 Zeilen bei Tiefe 6: Kopf, Werte, Attacken, Bilanz und Log in einer Komponente. Die Zahlen kommen bereits aus reinen Funktionen (statsAt, attacksFor, levelFor) — es fehlt nur die Trennung der Darstellung.
    function CodingmonPanel() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      const cur = statsAt(s.species, lvl);
      const learned = attacksFor(lvl);
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const form = formOf(lvl);

      return h('div', { className: '__cm_panel' },
        h('header', { className: '__cm_panel-head' },
          h('span', { className: '__cm_panel-stage' },
            h('span', { dangerouslySetInnerHTML: { __html: petGlyph(s.species, lvl, 72) } }),
            h('button', {
              type: 'button',
              className: '__cm_btn',
              title: 'Ein wildes Codingmon aufs Fenster rufen',
              onClick: () => { spawnWild(); },
            }, 'Wildling rufen'),
          ),
          h('div', { className: '__cm_panel-id' },
            h('h2', null, s.name),
            h('p', { className: '__cm_sub' },
              `${SPECIES[s.species].label} · Level ${lvl} · ${form.label}`),
            h('p', { className: '__cm_xp' },
              `${s.xp} XP · ${next - s.xp} XP bis Level ${lvl + 1}`),
            h(Bar, { value: s.xp - prev, max: Math.max(1, next - prev), tone: 'xp' }),
          ),
        ),

        h('div', { className: '__cm_stats' },
          [['HP', cur.hp], ['ATK', cur.atk], ['DEF', cur.def], ['AGI', cur.agi], ['INT', cur.int]]
            .map(([label, value]) => h('div', { className: '__cm_stat', key: label },
              h('span', { className: '__cm_stat-k' }, label),
              h('span', { className: '__cm_stat-v' }, String(value)))),
        ),

        h('div', { className: '__cm_block' },
          h('h3', null, 'Attacken'),
          h('ul', { className: '__cm_moves' },
            learned.map((attack) => h('li', { key: attack.id },
              h('span', { className: '__cm_move-name' }, attack.label),
              h('span', { className: '__cm_move-meta' }, `${attack.kind} · ${attack.stat.toUpperCase()} ${attack.power}`)))),
        ),

        h('div', { className: '__cm_block' },
          h('h3', null, `Bilanz — ${s.wins} Siege / ${s.losses} K.o.`),
          h('p', { className: '__cm_sub' },
            `Eigenes HP ${Math.max(0, s.hp)}/${cur.hp} · 1 XP pro Token · ${wilds.size} Wildlinge auf dem Fenster`),
          h('ul', { className: '__cm_log' },
            s.log.slice(0, 8).map((line, index) => h('li', { key: `${index}-${line}` }, line))),
        ),
      );
    }

    // ── Skills ───────────────────────────────────────────────────────────────
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
      .__cm_root { position: fixed; inset: 0; pointer-events: none; z-index: 40; }
      .__cm_wild {
        position: absolute; top: 0; left: 0; pointer-events: auto; cursor: crosshair;
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        background: none; border: 0; padding: 4px; color: var(--shinon-violet, #7C3AED);
        transition: transform 2.4s ease-in-out, opacity .4s ease;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,.45));
      }
      .__cm_wild:hover { color: var(--shinon-violet-light, #A855F7); }
      .__cm_wild-tag { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); white-space: nowrap; }
      .__cm_wild--hit { animation: __cm_shake .2s linear; }
      .__cm_wild--down { opacity: 0; transform: scale(.4) !important; }
      .__cm_wild--flee { opacity: 0; }
      @keyframes __cm_shake { 0%,100% { margin-left: 0 } 25% { margin-left: -4px } 75% { margin-left: 4px } }

      .__cm_panel { padding: 14px; height: 100%; overflow: auto; color: var(--dsw-alias-label-primary, #E0E7FF);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); }
      .__cm_panel-head { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
      .__cm_panel-stage { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .__cm_panel-id h2 { margin: 0; font-family: var(--shinon-font-head, ui-sans-serif); letter-spacing: .06em; }
      .__cm_sub { margin: 2px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_xp { margin: 6px 0 4px; font-size: 12px; }
      .__cm_bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; min-width: 120px; }
      .__cm_bar-fill { height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); }
      .__cm_bar[data-tone="hp"] .__cm_bar-fill { background: linear-gradient(90deg,#ef4444,#f59e0b); }
      .__cm_btn { font-size: 11px; padding: 3px 8px; border-radius: 5px; cursor: pointer;
        background: rgba(124,58,237,.18); color: inherit; border: 1px solid rgba(124,58,237,.45); }
      .__cm_stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px,1fr)); gap: 8px; margin-bottom: 14px; }
      .__cm_stat { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); }
      .__cm_stat-k { font-size: 10px; letter-spacing: .1em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_stat-v { font-size: 15px; font-weight: 700; }
      .__cm_block { margin-bottom: 14px; }
      .__cm_block h3 { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_moves, .__cm_log { list-style: none; margin: 0; padding: 0; font-size: 12px; }
      .__cm_moves li { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0;
        border-bottom: 1px solid rgba(255,255,255,.06); }
      .__cm_move-name { font-weight: 600; }
      .__cm_move-meta { color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_log li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }
      @media (prefers-reduced-motion: reduce) { .__cm_wild { transition: none; } }
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
        window.__codingmon = {
          plugin: PLUGIN,
          PetMark,
          state: () => ({ ...store, level: level(), stats: stats(), form: formOf(level()).label }),
          attacks: () => attacksFor(level()),
          callWild: () => spawnWild(),
          wilds: () => [...wilds.values()].map((w) => ({ id: w.id, level: w.level, hp: w.hp, maxHp: w.maxHp })),
          strike: (id) => { const w = wilds.get(id); return w ? strike(w) : null; },
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

        // XP aus dem Token-Zaehler. Der Takt ist bewusst traege: das Pet soll
        // den Agenten nicht ausbremsen.
        const tokenTimer = window.setInterval(tickTokens, 2000);
        const wildTimer = window.setInterval(() => {
          if (document.hidden) return;
          if (wilds.size < 3) spawnWild();
          for (const wild of wilds.values()) moveWild(wild);
        }, 9000);
        // Erster Wildling kurz nach dem Start, damit die Mechanik sichtbar ist.
        const firstWild = window.setTimeout(() => { overlayRoot(); spawnWild(); emit(); }, 2500);

        ctx.effect?.(() => () => {
          window.clearInterval(tokenTimer);
          window.clearInterval(wildTimer);
          window.clearTimeout(firstWild);
          for (const wild of wilds.values()) wild.el.remove();
          wilds.clear();
          overlay?.remove();
          delete window.__codingmon;
        });

        console.log(`[shinon-codingmon] Pet aktiv — Marke uebernommen, Level ${level()}, ${attacksFor(level()).length} Attacken`);
      },
    };
  },
});
