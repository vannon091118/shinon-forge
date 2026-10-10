/**
 * @shinon/events — Client-Hälfte.
 *
 * Der Hook/Event-Spine lebt im Host: er beobachtet dort die DSH-Signale. Im
 * Client gibt es nichts zu besetzen — dieser Platzhalter existiert, weil der
 * Bundle-Vertrag genau vier Dateien verlangt und der Client-Loader eine
 * Registrierung mit der Contract-id erwartet.
 *
 * Ein späteres @shinon/brand-state darf hier andocken (Persona-State →
 * Animation), aber erst, wenn es echte Events zu zeigen gibt.
 */
window.__ModuleLoader__.load({
  id: '@shinon/events',
  factory() {
    return {
      inject: [],
      apply() {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/events', { label: 'Event-Spine', kind: 'client', panel: null });
        // Label "Event-Spine" bewusst englisch: technische Komponente (Event-Beobachter), kein Endnutzer-Titel.
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/events' } }));
        // Bewusst leer: der Spine ist Host-seitig.
      }
    };
  }
});
