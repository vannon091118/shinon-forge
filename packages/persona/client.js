/**
 * @shinon/persona — Client-Hälfte.
 *
 * Die Persona wirkt im Host (System-Prompt). Im Client gibt es nichts zu
 * besetzen — dieser Platzhalter existiert, weil der Bundle-Vertrag genau
 * vier Dateien verlangt und der Client-Loader eine Registrierung erwartet.
 */
window.__ModuleLoader__.load({
  id: '@shinon/persona',
  factory() {
    return {
      inject: [],
      apply() {
        // Bewusst leer: Persona ist Host-seitig.
      }
    };
  }
});
