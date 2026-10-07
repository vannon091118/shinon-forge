/**
 * shinon-better-errors - Fehlerdarstellung (Client-Hälfte)
 *
 * Platzhalter: bisher nur Styles. Der frühere 'styles'-Service existiert nicht,
 * und der leere 'main'-Slot-Eintrag hat nie etwas gerendert.
 */
window.__ModuleLoader__.load({
  id: '@shinon/better-errors',
  factory(require) {
    const PLUGIN = '@shinon/better-errors';

    if (document.querySelector(`style[data-plugin-css="${PLUGIN}/errors.css"]`) === null) {
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = `${PLUGIN}/errors.css`;
      style.textContent = `
        .shinon-better-errors {
          padding: 16px;
        }
        .shinon-better-errors__error {
          background: var(--dsw-color-bg-error);
          color: var(--dsw-color-fg-on-color);
          border-radius: 8px;
          padding: 12px;
          font-family: monospace;
        }
      `;
      document.head.appendChild(style);
    }

    return {
      inject: [],
      apply() {}
    };
  }
});
