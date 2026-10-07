/**
 * @shinon/project-index — Client-Hälfte.
 *
 * Der Index lebt im Host: er liest das Projekt, schreibt SQLite außerhalb des
 * Projekts und liefert später den MAX-Kontext. Im Client gibt es nichts zu
 * besetzen — dieser Platzhalter existiert, weil der Bundle-Vertrag genau vier
 * Dateien verlangt und der Client-Loader eine Registrierung mit der
 * Contract-id erwartet.
 *
 * Ein späteres Panel darf hier andocken und den letzten Lauf zeigen
 * (Dateien, Symbole, Chunks), aber erst, wenn es dafür einen echten Zustand im
 * Client gibt. Heute wäre jede Anzeige eine Erfindung.
 */
window.__ModuleLoader__.load({
  id: '@shinon/project-index',
  factory() {
    return {
      inject: [],
      apply() {
        // Bewusst leer: der Index ist Host-seitig.
      }
    };
  }
});
