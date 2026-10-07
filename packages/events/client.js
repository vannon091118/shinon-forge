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
        // Bewusst leer: der Spine ist Host-seitig.
      }
    };
  }
});
