/**
 * shinon-seams — client.js (Client-Hälfte)
 *
 * Leer, und das ist die Zusage: der Kern ist Host-Code. Ein Client-Bundle zieht
 * React per `require` und kann keine Host-Datei laden — die Client-Spiegel
 * bleiben deshalb Kopien mit Drift-Prüfung (`SOURCE_TWINS`, Stufe 2), und der
 * Generator für ihre Bausteine (`scripts/lib/plugin-idioms.mjs`) wird hier
 * nicht angefasst.
 *
 * Die Datei existiert, weil die Form eines Pakets in diesem Repo eine ist
 * (`AGENTS.md`, Abschnitt Conventions): vier Rollendateien, geprüft von Gate und Build.
 */
window.__ModuleLoader__.load({
  id: '@shinon/seams',
  factory() {
    return {
      inject: [],
      apply() {
        // Nichts zu rendern: kein Slot, keine Styles, keine Locale.
      },
    };
  },
});
