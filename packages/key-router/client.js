/**
 * @shinon/key-router — Client-Hälfte
 *
 * UI-Komponenten:
 * - Key-Pool-Status in der Settings-Leiste
 * - Live-Anzeige welcher Key aktiv ist
 */

window.__ModuleLoader__.load({
  id: '@shinon/key-router',
  factory() {
    return {
      inject: [],
      apply(ctx) {
        console.log('[shinon-key-router] Client aktiviert');

        // Style für Key-Pool-Anzeige
        const style = document.createElement('style');
        style.textContent = `
          .key-router-status {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: var(--dsw-bg-surface-secondary, #1a1a1a);
            border-radius: 3px;
            font-size: 10px;
            color: var(--dsw-fg-secondary, #888);
            font-family: var(--dsw-font-mono, monospace);
          }
          .key-router-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--dsw-fg-tertiary, #555);
          }
          .key-router-dot.active { background: #22c55e; box-shadow: 0 0 3px #22c55e; }
          .key-router-dot.cooling { background: #f59e0b; }
          .key-router-dot.exhausted { background: #ef4444; }
        `;
        document.head.appendChild(style);

        return () => {
          style.remove();
          console.log('[shinon-key-router] Client deaktiviert');
        };
      }
    };
  }
});
