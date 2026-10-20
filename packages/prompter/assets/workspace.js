/**
 * @shinon/prompter — workspace.js
 *
 * Die Workspace-Identität (S1) hat EINE Definition: `@shinon/seams`
 * (`assets/seams.js`). Diese Datei ist nur noch der Pfad, den dieses Paket
 * importiert — die Fläche bleibt gleich, die zweite Fassung ist fort.
 *
 * WARUM DIE FRÜHERE KOPIE WEG IST: bis 2026-10-20 stand hier die volle
 * Implementierung und in `@shinon/project-index/assets/workspace.js` eine
 * bytegleiche Fassung; `SOURCE_TWINS` hielt beide per Drift-Prüfung zusammen.
 * Zwei Antworten auf dieselbe Frage („welcher Workspace ist aktiv?") sind aber
 * nur dann ungefährlich, wenn niemand sie falsch liest — und der teurere Fall,
 * ein Prompt liest den Index eines anderen Projekts, wird von einer Kopie nicht
 * kleiner. Seit der Kern importierbar ist, gibt es die zweite Antwort nicht mehr.
 *
 * Die Eigenschaft bleibt: `assets/seams.js` hat KEINE Bare-Imports, dieser
 * Import ist deshalb transitiv importfrei — `packages/prompter/test/workspace.test.mjs`
 * läuft weiter ohne zusätzliche Abhängigkeit.
 */
export * from '@shinon/seams/core';
