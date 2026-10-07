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
      /* Shinon Forge — Branding + Farbverlauf */
      :root {
        --shinon-cyber-1: #7b2ff7;
        --shinon-cyber-2: #f107a3;
        --shinon-cyber-3: #00e5ff;
        --shinon-gradient: linear-gradient(115deg, var(--shinon-cyber-1) 0%, var(--shinon-cyber-2) 52%, var(--shinon-cyber-3) 100%);
      }

      .shinon-mark { display: block; flex-shrink: 0; color: var(--dsw-alias-brand-primary, var(--shinon-cyber-2)); }
      .shinon-mark .shinon-mark__body { fill: url(#shinon-mark-gradient); }
      .shinon-mark .shinon-mark__hair { fill: currentColor; opacity: .85; }
      .shinon-mark .shinon-mark__visor { fill: var(--dsw-alias-bg-layer-1, #0b0b12); opacity: .9; }
      .shinon-mark .shinon-mark__core { fill: var(--shinon-cyber-3); }

      /* Signal-Kern pulsiert — reine Presentation, kein Gameplay-Effekt. */
      @keyframes shinon-core-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
      .shinon-mark .shinon-mark__core { animation: shinon-core-pulse 2.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .shinon-mark .shinon-mark__core { animation: none; } }

      .shinon-wordmark {
        font-weight: 700; font-size: 14px; letter-spacing: .6px;
        background: var(--shinon-gradient);
        -webkit-background-clip: text; background-clip: text;
        color: transparent; white-space: nowrap;
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
            h('stop', { offset: '0%', stopColor: 'var(--shinon-cyber-1)' }),
            h('stop', { offset: '52%', stopColor: 'var(--shinon-cyber-2)' }),
            h('stop', { offset: '100%', stopColor: 'var(--shinon-cyber-3)' })
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
      return h(MarkGlyph, { size: size ?? DEFAULT_SIZE });
    }

    /** Sidebar-Name: Besetzer besitzt eigenen Inhalt und Breite. */
    function SidebarBrandName() {
      return h('span', { className: 'shinon-wordmark' }, 'SHINON');
    }

    /** Hero-Marke vor der Headline der leeren Session. */
    function HeroBrandMark({ size, className }) {
      return h(MarkGlyph, { size: size ?? 48, className });
    }

    /** Hinweisbanner über dem Composer. */
    function InfoBanner() {
      return h('div', {
        style: {
          background: 'var(--dsw-alias-bg-layer-1)',
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '12px',
          color: 'var(--dsw-alias-label-secondary)',
          marginBottom: '8px'
        }
      }, 'Shinon Forge aktiv');
    }

    return {
      inject: ['slots'],
      apply(ctx) {
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
      }
    };
  }
});
