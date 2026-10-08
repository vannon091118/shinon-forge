/**
 * shinon-task-router — Client-Hälfte.
 *
 * Keine autonome Aktion und KEINE eigene Policy: die Entscheidung UND die
 * Aktivierung fallen im Host (`index.js`), weil sie dort nachprüfbar sind. Der
 * Client spiegelt nur lesbar, damit im Browser nachvollziehbar ist, welche
 * Schwelle gilt und ob ein Goal entstand — eine Anzeige, die dieselben Zahlen
 * errät statt sie zu lesen, wäre eine zweite Wahrheit. Kein Goal-State hier:
 * den führt DSH, und ihn zu duplizieren hiesse, ihm zu widersprechen.
 *
 * Kein Config-Schema hier (die Konfiguration lebt im Host), kein Goal-State:
 * §16 endet bei goal/no goal; die Goal-Anzeige gehört zur Projektion (§22).
 */
window.__ModuleLoader__.load({
  id: '@shinon/task-router',
  factory(require) {
    const PLUGIN = '@shinon/task-router';

    /**
     * Der Kanal, auf dem der Host seine Entscheidungen meldet. Als Konstante
     * dupliziert wie im Host — bewusst: der Client lädt das Host-Modul nicht,
     * und ein gemeinsamer Import wäre eine Kopplung, die es sonst nirgends gibt.
     */
    const DECISION_CHANNEL = 'shinon/task-router/decision';

    return {
      inject: [],
      decisionChannel: DECISION_CHANNEL,
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/task-router', { label: 'Task Router', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/task-router' } }));
        const mirror = { plugin: PLUGIN, decisions: [], channel: DECISION_CHANNEL, last: null };
        if (typeof ctx?.on === 'function') {
          ctx.on(DECISION_CHANNEL, (decision) => {
            mirror.last = decision ?? null;
            mirror.decisions.push(decision);
            // Die Aktivierung ist eine eigene Auskunft: die Entscheidung kann
            // `goal` sein, waehrend kein Goal entstand (§17, Schalter/Agent).
            const goal = decision?.activated === true ? `goal ${decision.goalId || '(ohne id)'}` : `kein goal (${decision?.activation ?? '—'})`;
            console.log(`[shinon-task-router-client] ${decision?.outcome ?? 'unbekannt'} / ${goal} (${decision?.reason ?? '—'})`);
          });
        }
        window.__shinon_task_router = mirror;
        const stop = () => {
          console.log(`[shinon-task-router-client] ${PLUGIN} gestoppt — keine Anzeige mehr aktiv`);
        };
        if (typeof ctx?.effect === 'function') ctx.effect(() => stop);
      },
    };
  },
});
