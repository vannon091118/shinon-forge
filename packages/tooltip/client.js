/**
 * shinon-tooltip — Client-Hälfte: die Tooltip-Skin.
 *
 * WAS SIE TUT (und warum es nicht mehr die alte Fassung ist): bis 2026-10-23
 * injizierte diese Hälfte eine Regel für die Klasse `.dsh-tooltip`. Diese
 * Klasse setzt im Baum NIEMAND — weder ein Shinon-Client noch die DSH-Oberfläche
 * (gemessen: `dsh-tooltip` kommt in `node_modules/@deepseek-ai/**` nicht vor).
 * Die Regel war also toter Text, der wie Gestaltung aussah.
 *
 * Der einzige Weg, auf dem eine reine Style-Hälfte WIRKLICH wirkt, sind die
 * Design-Token der Oberfläche: DSH zeichnet seine Tooltip-Blase mit
 * `background: var(--dsw-alias-tooltip-bg)` und die Tasten-Hülle mit
 * `var(--dsw-alias-tooltip-key-bg)` (Themeschicht `body` bzw.
 * `body[data-ds-dark-theme]`), der Text bleibt `--dsw-static-neutral-bluish-00`.
 * Genau diese beiden Aliase werden hier überschrieben — dunkles Shinon-Violett
 * in beiden Themes, weißer Text bleibt lesbar.
 *
 * `body` und `body[data-ds-dark-theme]` sind Absicht: die Themeschicht setzt die
 * Aliase auf denselben Selektoren; gleiche Spezifität, spätere Einfügung gewinnt.
 * Ein `:root`-Block verlöre gegen `body[data-ds-dark-theme]` und wäre im dunklen
 * Theme wieder wirkungslos.
 *
 * Kein Service, kein Zustand, keine Messung: die Hälfte schreibt CSS und meldet
 * sich in der gemeinsamen Plugin-Liste von @shinon/dashboard an (Konvention,
 * kein Import).
 */
window.__ModuleLoader__.load({
  id: '@shinon/tooltip',
  factory(require) {
    const PLUGIN = '@shinon/tooltip';
    const CSS_ID = `${PLUGIN}/tooltip-tokens.css`;

    /**
     * Die Aliase, die diese Hälfte setzt. `scripts/gate/tests/tooltip-client.test.mjs`
     * pinnt die Liste gegen die Themen-Schicht der installierten DSH-Fassung:
     * ein Tippfehler in einem Token-Namen wäre sonst ein stiller Ausfall
     * (CSS kennt keine unbekannten Eigenschaften, es ignoriert sie).
     */
    const TOKENS = {
      '--dsw-alias-tooltip-bg': { light: '#2A1746', dark: '#1C1030' },
      '--dsw-alias-tooltip-key-bg': { light: '#3D2364', dark: '#2E1B4D' },
    };

    /** Das Stylesheet als Text — eine Quelle für Injektion und Test. */
    function stylesheet() {
      const declare = (theme) => Object.entries(TOKENS)
        .map(([name, values]) => `          ${name}: ${values[theme]};`)
        .join('\n');
      return [
        '        /* Shinon-Tooltip-Skin — Design-Token der Oberfläche, keine eigene Klasse. */',
        '        body {',
        declare('light'),
        '        }',
        '        body[data-ds-dark-theme] {',
        declare('dark'),
        '        }',
        '      ',
      ].join('\n');
    }

    if (document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null) {
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = CSS_ID;
      style.textContent = stylesheet();
      document.head.appendChild(style);
    }

    return {
      inject: [],
      apply() {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Tooltip', kind: 'client', panel: null, detail: 'tooltip-skin' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
      }
    };
  }
});
