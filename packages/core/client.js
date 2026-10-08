/**
 * shinon-core — Branding-Overlay (Client-Hälfte).
 *
 * Ersetzt DeepSeeks Marke in der Sidebar und im Hero. Die Official-Brand
 * (@deepseek-ai/dsh-client-ui-brand-official) ist im Profil deaktiviert, weil
 * `sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark`
 * Single-Slots sind: genau ein Besetzer.
 *
 * Abgeleitet aus @deepseek-ai/dsh-client-ui-brand-official (DSH-eigenes Muster):
 *   - factory(require) bekommt CommonJS-require; React aus 'react'.
 *   - ctx.slots.inject(<slot>, …) wartet auf den deklarierten Slot.
 *   - Styles als <style data-plugin-css>, kein 'styles'-Service.
 *   - Das Bundle ist SELF-CONTAINED: kein top-level `import`, denn der
 *     __ModuleLoader__ lädt klassische Scripts (kein ES-Modul).
 *
 * Die Marke ist ein eigener SVG-Pfad (weibliche Cyberpunk-Persona), kein Fremdlogo.
 */
window.__ModuleLoader__.load({
  id: '@shinon/core',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/core';

    // ── Marken-Geometrie (self-contained; viewBox 32×32) ──────────────────
    const MARK = {
      // Helm-/Gesichtssilhouette
      silhouette: 'M16 3.2c-5.1 0-8.6 3.4-8.6 8.2 0 3.1 1.1 5.6 3 7.3v3.1c0 .9.7 1.6 1.6 1.6h8c.9 0 1.6-.7 1.6-1.6v-3.1c1.9-1.7 3-4.2 3-7.3 0-4.8-3.5-8.2-8.6-8.2z',
      // Visor-Band
      visor: 'M9.4 12.1h13.2c.5 0 .9.4.9.9v2.3c0 .5-.4.9-.9.9H9.4c-.5 0-.9-.4-.9-.9v-2.3c0-.5.4-.9.9-.9z',
      // Seitliche Haarpinsel — ergeben die weibliche Silhouette
      hairLeft: 'M7.3 10.6C5.9 12 5.2 13.9 5.2 16.1c0 2.9 1 5.3 2.7 7-.6-2.3-.8-4.6-.6-6.9z',
      hairRight: 'M24.7 10.6c1.4 1.4 2.1 3.3 2.1 5.5 0 2.9-1 5.3-2.7 7 .6-2.3.8-4.6.6-6.9z',
      // Signal-Kern
      core: 'M16 15.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
      // Antennen-Detail
      antenna: 'M16 1.4c-.4 0-.7.3-.7.7v1.4c0 .4.3.7.7.7s.7-.3.7-.7V2.1c0-.4-.3-.7-.7-.7z'
    };
    const DEFAULT_SIZE = 24;

    // Persona-Asset: der Client wird unter dem Profil-Root ausgeliefert, das
    // Asset liegt im Bundle. Relativer Pfad, damit es ohne absoluten Host geht.
    const PERSONA_SRC = new URL('assets/persona.webp', document.baseURI).href;

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
      .shinon-mark .shinon-mark__body { fill: url(#shinon-mark-gradient); }
      .shinon-mark .shinon-mark__hair { fill: currentColor; opacity: .85; }
      .shinon-mark .shinon-mark__visor { fill: var(--shinon-void); opacity: .92; }
      .shinon-mark .shinon-mark__core { fill: var(--shinon-mist); }

      /* Signal-Kern pulsiert — reine Presentation, kein Gameplay-Effekt. */
      @keyframes shinon-core-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
      .shinon-mark .shinon-mark__core { animation: shinon-core-pulse 2.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .shinon-mark .shinon-mark__core { animation: none; } }

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

    /** Gemeinsame Marken-Geometrie für Sidebar und Hero. */
    function MarkGlyph({ size = DEFAULT_SIZE, className }) {
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
        h('path', { className: 'shinon-mark__body', d: MARK.silhouette }),
        h('path', { className: 'shinon-mark__hair', d: MARK.hairLeft }),
        h('path', { className: 'shinon-mark__hair', d: MARK.hairRight }),
        h('path', { className: 'shinon-mark__visor', d: MARK.visor }),
        h('path', { className: 'shinon-mark__core', d: MARK.core }),
        h('path', { className: 'shinon-mark__hair', d: MARK.antenna })
      );
    }

    /** Sidebar-Marke: Slot gibt nur die Kantenlänge vor. */
    function SidebarBrandMark({ size }) {
      // @shinon/codingmon uebernimmt die Marke, sobald es geladen ist. Die
      // Uebergabe laeuft ueber eine Fenster-Konvention statt ueber einen
      // Paket-Import, damit Pakete referenzfrei bleiben — dasselbe Muster wie
      // window.__mk bei @shinon/markers. Ohne Pet bleibt das Helmchen.
      const Pet = window.__codingmon?.PetMark;
      if (Pet) return h(Pet, { size: size ?? DEFAULT_SIZE });
      return h(MarkGlyph, { size: size ?? DEFAULT_SIZE });
    }

    /** Sidebar-Name: Besetzer besitzt eigenen Inhalt und Breite. */
    function SidebarBrandName() {
      return h('span', { className: 'shinon-wordmark' }, 'SHINON');
    }

    /** Hero-Marke vor der Headline der leeren Session. */
    function HeroBrandMark({ size, className }) {
      const Pet = window.__codingmon?.PetMark;
      if (Pet) return h(Pet, { size: size ?? 48 });
      return h(MarkGlyph, { size: size ?? 48, className });
    }

    /** Hinweisbanner über dem Composer — Status aus der Brand-Spec. */
    function InfoBanner() {
      return h('div', { className: 'shinon-banner' },
        h('span', { className: 'shinon-banner__name' }, 'SHINON'),
        h('span', { className: 'shinon-banner__status' }, 'Bereit. Kritisch. Neugierig.')
      );
    }

    /** Animiertes Background-Branding: Persona + Schleier + Scanlines. */
    function BackgroundBranding() {
      return h('div', { className: 'shinon-bg', 'aria-hidden': 'true' },
        h('img', {
          className: 'shinon-bg__persona',
          src: PERSONA_SRC,
          alt: '',
          draggable: 'false',
          decoding: 'async'
        }),
        h('div', { className: 'shinon-bg__veil' }),
        h('div', { className: 'shinon-bg__scan' })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/core', { label: 'Core (Marke)', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/core' } }));

        // Single-Slots: je genau ein Besetzer. Sidebar-Marke und -Name hängen
        // zusammen (verschwinden gemeinsam, wenn die Sidebar-Deklaration fällt).
        ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, SidebarBrandMark);
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, SidebarBrandName);
        }));
        ctx.slots.inject('conversation.hero.brand.mark', () =>
          ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HeroBrandMark));
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-info-banner',
          order: 10
        }, InfoBanner));
        // Background-Branding hinter dem Hero (leere Session).
        ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register({
          name: 'conversation.hero.workspace',
          id: 'shinon-bg',
          order: -100
        }, BackgroundBranding));
      }
    };
  }
});
