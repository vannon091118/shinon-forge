/**
 * @shinon/shinon-forge — Client-Hälfte
 *
 * UI-Komponenten:
 * - Runner-Status-Anzeige im Composer-Dock
 * - Memory-Freshness-Badge
 */

window.__ModuleLoader__.load({
  id: '@shinon/shinon-forge',
  factory() {
    return {
      inject: [],
      apply(ctx) {
        console.log('[shinon-forge] Client aktiviert');

        // Style für Runner-Status
        const style = document.createElement('style');
        style.textContent = `
          .shinon-forge-status {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: var(--dsw-bg-surface-secondary, #1a1a1a);
            border-radius: 4px;
            font-size: 11px;
            color: var(--dsw-fg-secondary, #888);
            font-family: var(--dsw-font-mono, monospace);
          }
          .shinon-forge-status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--dsw-fg-tertiary, #555);
          }
          .shinon-forge-status.running .shinon-forge-status-dot {
            background: #22c55e;
            box-shadow: 0 0 4px #22c55e;
          }
          .shinon-forge-status.stale {
            border-left: 2px solid #f59e0b;
          }
          .shinon-forge-status.stale .shinon-forge-status-dot {
            background: #f59e0b;
          }
        `;
        document.head.appendChild(style);

        // TODO: Slot-Registrierung für Runner-Status
        //Empfohlener Slot: conversation.composer.dock
        // ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        //   id: 'shinon-forge-runner-status',
        //   order: 0,
        //   label: 'Runner Status',
        // }));

        return () => {
          style.remove();
          console.log('[shinon-forge] Client deaktiviert');
        };
      }
    };
  }
});
