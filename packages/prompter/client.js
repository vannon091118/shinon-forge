/**
 * @shinon/prompter — Client-Hälfte.
 *
 * Der Enhancer lebt im Host: er hängt am Schritt und ruft ein Modell. Im Client
 * gibt es nichts zu besetzen — dieser Platzhalter existiert, weil der
 * Bundle-Vertrag genau vier Dateien verlangt und der Client-Loader eine
 * Registrierung mit der Contract-id erwartet.
 *
 * Ein späteres Panel darf hier andocken und die Entscheidungen aus
 * `shinon/prompter/decision` zeigen (übernommen/verworfen + Grund), aber erst,
 * wenn es dafür einen echten Zustand im Client gibt.
 */
window.__ModuleLoader__.load({
  id: '@shinon/prompter',
  factory() {
    return {
      inject: [],
      apply() {
        // Bewusst leer: der Enhancer ist Host-seitig.
      }
    };
  }
});
