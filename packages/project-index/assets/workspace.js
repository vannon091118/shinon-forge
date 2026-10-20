/**
 * @shinon/project-index — workspace.js
 *
 * Die Workspace-Identität (S1) hat EINE Definition: `@shinon/seams`
 * (`assets/seams.js`). Diese Datei ist der Pfad, den dieses Paket importiert
 * (`index.js`, `assets/index-core.js`) — die Fläche bleibt, die Kopie ist fort.
 *
 * Was hier bis 2026-10-20 stand: eine bytegleiche zweite Fassung der
 * Prompter-Datei, geprüft von `SOURCE_TWINS`. Der Grund für die Kopie war, dass
 * Pakete einander nicht importieren durften. Der Kern macht genau diesen Grund
 * gegenstandslos: ein Import, der nur `node:`-Module mitbringt.
 *
 * Warum die Werte übereinstimmen MÜSSEN — jetzt strukturell statt per Prüfung:
 * Prompter, Project Index und Task-Router beantworten dieselbe Frage. Eine
 * abweichende Antwort hieße, dass ein Prompt den Index eines anderen Projekts
 * liest; genau die Verwechslung schließt S1 aus.
 */
export * from '@shinon/seams/core';
