# Generierte Skills — Zettel

> **Status:** current — das Verzeichnis der Zettel (Zug 4, 2026-10-12). **Stand:** 2026-10-12
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Ein **Zettel** ist eine Lesson in der Form **„bei X immer Y, weil Z"** — nicht
offensichtlich, aus einer gelösten Aufgabe gelernt. Er ist kein Log: „am 12.03.
ist Folgendes passiert" ist ein Log-Eintrag und hier falsch.

Dieses Verzeichnis (`generated-skills/`) ist die Ablage: **eine Datei je Zettel**,
versioniert wie der Rest des Repos, ohne Unterordner.

## Eigentümer

| Rolle | Wer | Was er tut |
|---|---|---|
| **Schreiben** | das arbeitende Modell (Shinon) mit seinen eigenen Werkzeugen | legt eine Datei je Zettel hier an, ändert und streicht sie |
| **Lesen und prüfen** | der Veredler (`@shinon/prompter`) | lädt vor einem passenden Schritt die Zettel, deren Thema-Marke im aufgelösten Kontext vorkommt, und prüft die Sammlung auf zu spitz, zu breit und doppelt |

Der Veredler **erzeugt keine** Zettel und ändert keinen: er liest und prüft. Diese
Trennung ist dieselbe wie bei den Signalen des Scorings — wer die Aufgabe löst,
weiß, was nicht offensichtlich war; wer die Muster sieht, entscheidet, was bleibt.

## Format

`.json`, flach — dieselben Felder, dieselben Grenzen, kein Unterordner.
Die verbindliche Fassung steht **nicht hier**, sondern in
[`packages/prompter/assets/note-rules.json`](../packages/prompter/assets/note-rules.json)
(`shinon.note-rules/v1`, Abschnitt `format`); diese Datei nennt nur den Weg.

| Feld | Bedeutung |
|---|---|
| `contract` | `shinon.skill-note/v1` — ein fremder Vertrag ist kein Zettel |
| `version` | Fassung des Formats; eine unbekannte Fassung wird nicht gelesen |
| `thema` | die **Marke**, an der der Zettel geladen wird (ein Wort, am besten aus dem Projektwortschatz) |
| `bei` | der Auslöser: wann gilt der Zettel |
| `immer` | die Anweisung: was dann zu tun ist |
| `weil` | der Grund: warum das nicht offensichtlich ist |
| `beleg` | wo er gelernt wurde (Pfad, Test, Sitzung) — damit ein späterer Leser nachsehen kann |

Zwei weitere Felder sind erlaubt, aber freiwillig: `herkunft` (in welchem Zug
und Commit der Zettel geschrieben wurde) und `datum` (YYYY-MM-DD, aus der
Git-Historie abgelesen, nie geraten). Der Veredler liest nur die sieben
Pflichtfelder oben; Herkunft und Datum stehen in der Datei für den menschlichen
Leser, der wissen will, woher ein Zettel kommt, bevor er ihm vertraut.

## Wann ein Zettel lädt

Der Titel entscheidet, nicht die Reihenfolge: geprüft wird die `thema`-Marke
gegen den **aufgelösten Kontext** dieses Schritts (Projekt, Pfade, Symbole,
Randbedingungen, Touches, Abhängigkeiten) und gegen den Prompt. Ohne Kontext lädt
**kein** Zettel — ein Zettel, dessen Thema niemand aufgelöst hat, ist ein Zettel
ohne Anlass. Es laden höchstens so viele, wie die Regeldatei erlaubt
(`reading.maxNotes`); die Auswahl ist bei gleichem Kontext immer dieselbe.

Was geladen wurde, steht sichtbar im Entscheidungsdatensatz des Schritts
(`notes.loaded`); was nicht geladen wurde, steht mit **Grund** da
(`notes.reasons`: `THEMA_NICHT_IM_KONTEXT`, `THEMA_OHNE_MARKE`, `UEBER_DEM_LIMIT`,
`FELD_FEHLT:*`, `VERTRAG_FREMD:*`, …). Eine stille Lücke gibt es nicht.

## Die Prüfung am Ende einer Sitzung

`npm run notes:check` liest dieses Verzeichnis und meldet die drei Befunde der
Regeldatei (`review`):

- **zu spitz** — der Zettel gilt für einen Fall: ein Datum, eine Sitzung, ein
  absoluter Pfad oder mehr als `maxPaths` konkrete Dateien.
- **zu breit** — die Anweisung trägt zu wenige eigene Begriffe und gilt damit
  für alles.
- **doppelt** — zwei Zettel desselben Themas sagen dasselbe.

**Benannte Lücke:** DSH kennt im Spine **kein** Sitzungsende-Ereignis, an dem
diese Prüfung hängen könnte (dieselbe Lücke, an der sich das Scoring orientiert).
Deshalb ist sie ein **Befehl** und kein Listener: Exit 0 heißt „kein Befund",
Exit 1 nennt jeden Befund mit Datei und Grund. Die reinen Prüffunktionen liegen
in [`packages/prompter/assets/note-core.js`](../packages/prompter/assets/note-core.js)
und werden von beiden Wegen benutzt — vom Veredler und von diesem Befehl.
