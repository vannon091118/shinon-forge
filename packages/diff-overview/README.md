# @shinon/diff-overview

Die Änderungs-Übersicht im Datei-Browser: erst nur `+N −M` je Datei, auf Klick die Zeilen.

## Woher die Zahlen kommen

**Von `git`, nicht von einer eigenen Rechnung.** Das Panel liest
`git status --porcelain`, `git diff --numstat HEAD` und `git diff --unified HEAD -- <pfad>`.
Es gibt keinen Diff-Algorithmus im Baum und keinen im Paket.

Gemessen, nicht angenommen: `node_modules/diff` liegt nur **transitiv** im Baum — kein
Workspace-Paket deklariert es (`package-lock.json` führt es als Fremd-Abhängigkeit), und
einen Diff-*Dienst* gibt es nicht. Die Messung steht in
[`docs/probes/diff-overview.json`](../../docs/probes/diff-overview.json). Ein Import eines
nicht deklarierten Pakets wäre eine Bindung an Zufall; eine eigene Zeilenpaarung wäre eine
zweite Wahrheit über dieselbe Sache — bei Umbrüchen, Umbenennungen und Binärdateien eine
schlechtere. Dieses Paket deklariert deshalb **keine** neue Abhängigkeit.

## Was nicht mitzählt, und warum es das sagt

| Fall | Anzeige | Grund |
|---|---|---|
| unversionierte Datei | `neu` | Git hat keinen Vergleich gegen HEAD — 0 wäre erfunden |
| Binärdatei | `—` + „binär" | Git zählt dort keine Zeilen |
| Grenze erreicht | Zeile „Grenze … : Ist vorhanden, Soll gezeigt" | nie stilles Kürzen |
| kein Git-Baum / kein HEAD | ein Satz im Panel | es gibt nichts zu vergleichen |

## Naht

| Sache | Wert |
|---|---|
| Vertrag (Übersicht) | `shinon.diff/overview-v1` |
| Vertrag (Datei) | `shinon.diff/file-v1` |
| Route | `GET /shinon/diff`, `GET /shinon/diff/file?path=…` |
| Slot | `sidebar.right.tab.files.actions` (Kopfzeile des Datei-Browsers) |
| Fläche im Browser | `window.__shinonDiffOverview` (`open`, `close`, `load`, `state`) |

Beide Routen sind **lesend**. Ein Pfad aus dem Browser wird geprüft (`safeInside`): absolut,
`..` oder außerhalb der Wurzel endet als `NICHT_IM_BAUM`, nicht als Datei.

## Tests

```sh
node --test packages/diff-overview/test/*.test.mjs   # Kern, ohne node_modules
node --test scripts/gate/tests/diff-overview.test.mjs # echter Git-Baum + Client-Bundle
```
