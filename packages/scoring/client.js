/**
 * @shinon/scoring — Client-Hälfte.
 *
 * Das Scoring wirkt im Host (Scorecard lesen). Im Client gibt es nichts zu
 * besetzen — dieser Platzhalter existiert, weil der Bundle-Vertrag genau
 * vier Dateien verlangt und der Client-Loader eine Registrierung erwartet.
 */
window.__ModuleLoader__.load({
  id: '@shinon/scoring',
  factory() {
    return {
      inject: [],
      apply() {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/scoring', { label: 'Scoring', kind: 'client', panel: null });
        // Label "Scoring" bewusst englisch: technische Komponente (Scorecard), kein Endnutzer-Titel.
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/scoring' } }));
        // Bewusst leer: Scoring ist Host-seitig.
      }
    };
  }
});
