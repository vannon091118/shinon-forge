/**
 * @shinon/narrative — Client-Hälfte.
 *
 * Zeigt den aktuellen Narrative-State im UI an:
 * - Composite (Mood, Narrator, Arc)
 * - Relationship-State
 * - Letzte Events der Chronik
 */
window.__ModuleLoader__.load({
  id: '@shinon/narrative',
  factory() {
    return {
      inject: [],
      apply(ctx) {
        // TODO: Slot-Registrierung wenn Slot bekannt
        console.log('[shinon-narrative] Client aktiviert');
      }
    };
  }
});
