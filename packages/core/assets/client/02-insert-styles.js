    /** Styles wie im DSH-Client üblich als <style data-plugin-css> einhängen. */
    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/brand.css`, `
      /* Shinon Forge — Brand-Spec: Persona • Evidence • Governance
         Palette (verbindlich): #7C3AED Lila · #A855F7 Hell-Lila ·
         #6366F1 Indigo · #E0E7FF Hell · #0B0F14 Tiefschwarz */
      :root {
        --shinon-violet: #7C3AED;
        --shinon-violet-light: #A855F7;
        --shinon-indigo: #6366F1;
        --shinon-mist: #E0E7FF;
        --shinon-void: #0B0F14;
        --shinon-gradient: linear-gradient(115deg, var(--shinon-violet) 0%, var(--shinon-violet-light) 45%, var(--shinon-indigo) 100%);
        --shinon-font-head: 'Sora', ui-sans-serif, system-ui, sans-serif;
        --shinon-font-body: 'Inter', ui-sans-serif, system-ui, sans-serif;
      }

      .shinon-mark { display: block; flex-shrink: 0; color: var(--dsw-alias-brand-primary, var(--shinon-violet)); }
      .shinon-mark .shinon-mark__ring { stroke: currentColor; opacity: .92; }
      .shinon-mark .shinon-mark__wing { stroke: currentColor; opacity: .5; }
      .shinon-mark .shinon-mark__spark { fill: url(#shinon-mark-gradient); }

      /* Der Funke pulsiert — reine Presentation, kein Gameplay-Effekt. */
      @keyframes shinon-core-pulse { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
      .shinon-mark .shinon-mark__spark { animation: shinon-core-pulse 2.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .shinon-mark .shinon-mark__spark { animation: none; } }

      /* ── Alt-Architektur: der gelieferte Fisch als FALLBACK ─────────────
         Die Marken-Slots sind Single-Slots MIT Fallback (Sidebar-Rail,
         Logo-Zeile, Hero-Hitbox): gibt DSH dort seinen eigenen Fisch aus —
         weil kein Besetzer da ist oder ein Besetzer abgedankt hat —, haengt
         sichtbar das Zeichen der alten Marke in der UI. Diese Regeln greifen
         nur, solange DIESES Bundle geladen ist, und lassen an den Marken-
         Stellen allein Shinons Zeichen stehen. */
      [class*="railMark"] > svg:not(.shinon-mark),
      [class*="brandMark"] > svg:not(.shinon-mark),
      [class*="fishHitbox"] > svg:not(.shinon-mark) { display: none; }

      /* ── Laufanzeige ("Arbeitet") ─────────────────────────────────────
         DSH malt dort einen Wal: [data-chat-running] haelt eine leere
         Spanne mit 'background: currentColor' und der Wal-APNG als 'mask',
         daneben einen statischen Wal als SVG. Beides wird hier ersetzt:
         dieselbe Geometrie wie die Marke, die Palette des Hintergrunds, und
         die Bewegung kommt aus dieser Datei statt aus dem Fremd-Asset.
         Spezifitaet (Attribut + Klasse) schlaegt die gelieferte Regel, auch
         wenn dessen Style-Tag spaeter eingehaengt wird. */
      [data-chat-running] [class*="runningWhaleAnimated"] {
        background: var(--shinon-gradient);
        -webkit-mask: ${MARK_MASK} center/contain no-repeat;
        mask: ${MARK_MASK} center/contain no-repeat;
        animation: shinon-running-drift 1.8s ease-in-out infinite;
      }
      [data-chat-running] [class*="runningWhaleStill"] { display: none; }
      @keyframes shinon-running-drift {
        0%, 100% { transform: translateY(-6%) rotate(-5deg) scale(.96); }
        50%      { transform: translateY(6%) rotate(5deg) scale(1.04); }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-chat-running] [class*="runningWhaleAnimated"] { animation: none; }
      }

      /* Der gelieferte Fisch schwamm beim Hover (SMIL in seinem SVG). Das
         Zeichen antwortet ebenfalls — dieselbe Geste mit ruhigeren Mitteln:
         es wiegt sich, der Funke atmet weiter. */
      [class*="fishHitbox"]:hover .shinon-mark,
      button:hover > [class*="railMark"] .shinon-mark { animation: shinon-mark-sway 1.6s ease-in-out infinite; }
      @keyframes shinon-mark-sway {
        0%, 100% { transform: rotate(-5deg); }
        50%      { transform: rotate(5deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        [class*="fishHitbox"]:hover .shinon-mark,
        button:hover > [class*="railMark"] .shinon-mark { animation: none; }
      }

      .shinon-wordmark {
        font-family: var(--shinon-font-head);
        font-weight: 700; font-size: 14px; letter-spacing: .12em;
        background: var(--shinon-gradient);
        -webkit-background-clip: text; background-clip: text;
        color: transparent; white-space: nowrap;
      }

      .shinon-banner {
        display: flex; align-items: baseline; gap: 8px;
        background: color-mix(in srgb, var(--shinon-void) 55%, transparent);
        border: 1px solid color-mix(in srgb, var(--shinon-violet) 40%, transparent);
        border-radius: 6px; padding: 8px 12px; margin-bottom: 8px;
        font-family: var(--shinon-font-body);
      }
      .shinon-banner__name {
        font-family: var(--shinon-font-head); font-weight: 700; font-size: 12px;
        letter-spacing: .1em; color: var(--shinon-violet-light);
      }
      .shinon-banner__status { font-size: 12px; color: var(--shinon-mist); opacity: .8; }

      /* ── Animiertes Background-Branding ──────────────────────────────
         Die freigestellte Persona liegt hinter dem Hero, dezent animiert.
         Reine Presentation: kein Zufall, kein State, kein Gameplay-Einfluss.
         prefers-reduced-motion schaltet jede Bewegung ab. */
      .shinon-bg {
        position: absolute; inset: 0; overflow: hidden;
        pointer-events: none; z-index: 0;
      }
      /* GEMESSEN im Browser (Chromium): der gelieferte Overlay-Layer ist
         click-through, gibt seine Klicks aber an seine DIREKTEN Kinder zurueck —
         '.pI_x6G_overlayLayer>*{pointer-events:auto}' (ui-layout). Diese Regel hat
         dieselbe Spezifitaet wie '.shinon-bg', also entscheidet die Quellreihenfolge:
         steht das Layout-CSS nach unserem Style-Tag, schluckt der Hintergrund JEDEN
         Klick im ganzen Fenster. Deshalb hier eine Stufe hoeher — der Layer traegt
         data-shell-overlay, damit gewinnt diese Regel in beiden Reihenfolgen. */
      [data-shell-overlay] > .shinon-bg { pointer-events: none; }
      .shinon-bg__persona {
        position: absolute; top: 50%; right: 4%;
        height: min(78%, 620px); width: auto;
        transform: translateY(-50%);
        opacity: .17;
        mix-blend-mode: screen;
        filter: saturate(.9) contrast(1.05);
        animation: shinon-persona-float 18s ease-in-out infinite;
      }
      .shinon-bg__veil {
        position: absolute; inset: 0;
        background:
          radial-gradient(60% 55% at 78% 45%, color-mix(in srgb, var(--shinon-violet) 22%, transparent) 0%, transparent 70%),
          linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--shinon-void) 55%, transparent) 100%);
      }
      .shinon-bg__scan {
        position: absolute; inset: -20% 0;
        background: repeating-linear-gradient(
          180deg, transparent 0 3px,
          color-mix(in srgb, var(--shinon-violet-light) 7%, transparent) 3px 4px);
        animation: shinon-scan 9s linear infinite;
        opacity: .5;
      }
      @keyframes shinon-persona-float {
        0%, 100% { transform: translateY(-50%) translateX(0) scale(1); }
        50%      { transform: translateY(-52%) translateX(-10px) scale(1.02); }
      }
      @keyframes shinon-scan {
        from { transform: translateY(0); }
        to   { transform: translateY(4px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .shinon-bg__persona { animation: none; }
        .shinon-bg__scan { animation: none; opacity: .25; }
      }
    `);

    /**
     * Shinons Zeichen fuer Sidebar (Rail im Toggle-Button) und Hero.
     * Dekorativ wie die gelieferte Marke daneben: `aria-hidden`.
     */
    function ForgeSigil({ size = DEFAULT_SIZE, className }) {
      return h('svg', {
        className: ['shinon-mark', className].filter(Boolean).join(' '),
        viewBox: '0 0 32 32',
        width: size,
        height: size,
        'aria-hidden': 'true',
        focusable: 'false'
      },
        h('defs', null,
          h('linearGradient', { id: 'shinon-mark-gradient', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0%', stopColor: 'var(--shinon-violet)' }),
            h('stop', { offset: '45%', stopColor: 'var(--shinon-violet-light)' }),
            h('stop', { offset: '100%', stopColor: 'var(--shinon-indigo)' })
          )
        ),
        h('path', { className: 'shinon-mark__ring', d: MARK.ring, fill: 'none', strokeWidth: 2.4, strokeLinejoin: 'round' }),
        h('path', { className: 'shinon-mark__wing', d: MARK.wingLeft, fill: 'none', strokeWidth: 2.4, strokeLinecap: 'round' }),
        h('path', { className: 'shinon-mark__wing', d: MARK.wingRight, fill: 'none', strokeWidth: 2.4, strokeLinecap: 'round' }),
        h('path', { className: 'shinon-mark__spark', d: MARK.spark })
      );
    }

    /** Sidebar-Marke: Slot gibt nur die Kantenlänge vor. */
    function SidebarBrandMark({ size }) {
      // GEMESSEN (2026-10-10): ui-sidebar rendert diesen Slot INNEN in seinen
      // Toggle-<button> (railMark, ui-sidebar/lib/client.js:279) — hier steht
      // also das Zeichen auf einer Schaltflaeche, und darum gehoert hier
      // Shinons gezeichnete Marke hin und kein Pixel-Sprite.
      return h(ForgeSigil, { size: size ?? DEFAULT_SIZE });
    }

    /** Sidebar-Name: Besetzer besitzt eigenen Inhalt und Breite. */
    function SidebarBrandName() {
      return h('span', { className: 'shinon-wordmark' }, 'SHINON');
    }

