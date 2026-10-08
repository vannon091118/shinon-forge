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
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/persona', { label: 'Persona', kind: 'client', panel: null });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/persona' } }));
        // Bewusst leer: Persona ist Host-seitig.
      }
    };
  }
});
