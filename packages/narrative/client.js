/**
 * @shinon/narrative — Client-Hälfte.
 *
 * WAS HIER FRÜHER STAND: „Zeigt den aktuellen Narrative-State im UI an" mit einem
 * `// TODO: Slot-Registrierung wenn Slot bekannt` und einem `console.log`. Das war
 * eine Zusage ohne Wirkung: kein Slot, keine Anzeige, kein Leser.
 *
 * WAS WIRKLICH GILT (gemessen am Vertrag, `scripts/gate/tests/narrative.test.mjs`):
 * der Composite ist KEINE Prompt-Sektion und KEIN Panel. Der Prompter nimmt ihn
 * über `standFor`/`standTrace` als DATENSATZ in die Entscheidungsspur auf; die
 * Persona abonniert den Kanal nicht und schreibt keinen `shinon:narrative-arc`-
 * Abschnitt. Mood, Erzähler und Arc stehen damit dort, wo die Entscheidung
 * belegt wird — nicht in der Seitenleiste. Ein zweites Panel mit denselben
 * Zahlen wäre eine zweite Wahrheit über denselben Zustand.
 *
 * WAS DIESE HÄLFTE DESHALB TUT: sie meldet sich in der gemeinsamen Plugin-Liste
 * von @shinon/dashboard an (Konvention, kein Import) — dieselbe Mindestwirkung,
 * die `@shinon/tooltip` hat. Kein Slot, kein Zustand, keine Kopie des Composites;
 * `detail` nennt den Ort, an dem die Zahlen wirklich stehen.
 *
 * `scripts/gate/tests/client-effect.test.mjs` hält die Regel: eine Client-Hälfte
 * ohne Wirkung (nur Log, nur Kommentar) ist rot.
 */
window.__ModuleLoader__.load({
  id: '@shinon/narrative',
  factory() {
    const PLUGIN = '@shinon/narrative';
    return {
      inject: [],
      apply() {
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Narrative', kind: 'client', panel: null, detail: 'decision-trace:prompter' });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
      }
    };
  }
});
