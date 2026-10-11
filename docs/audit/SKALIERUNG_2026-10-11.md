# Skalierung des Gates — 20 neue Plugins als Messlatte (2026-10-11)

> **Status:** current — Nachweis, was ein neues Plugin kosten darf. **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (§2, Zeile „Skalierungslauf“; dieses Dokument wiederholt keine Zustandszahl)

## 1. Die Frage

„Es kommen noch einige Plugins.“ Die ehrliche Fassung dieser Aussage ist eine
Messung: **was kostet ein zusätzliches Paket, wenn die Gate-Kette darüber läuft?**
Gemessen wurde am 2026-10-11 mit einer Kopie des Baums in `/tmp` und 20 geklonten
Paketen (39 statt 19) — jedes mit eigenem Ordnernamen, eigenen Vertragsnamen,
eigenen Idiom-Werten und der eigenen Erklärung `"dsh": { "inactive": true }`.

**Befund: die Kette war an drei Stellen zentral pflegebedürftig.** Alle drei waren
dieselbe Bauart — eine Handliste in einer Datei AUSSERHALB des neuen Pakets, deren
Eintrag man vergessen konnte, obwohl das Paket selbst vollständig war:

| Stelle (vorher) | Bauart | Befunde bei 20 neuen Paketen |
|---|---|---|
| `scripts/gate/plugins/host-half.mjs` + `client-half.mjs` mit der Regionen-Tabelle in `scripts/lib/plugin-idioms.mjs` | zentrale Liste der Idiom-Regionen je Baustein | 60 (`host-half` 20, `client-half` 40) |
| `scripts/gate/plugins/dead-package.mjs`, `KNOWN_INACTIVE` | zentrale Liste der zurückgestellten Pakete | 5 |
| `scripts/gate/plugins/doctor.mjs`, `EXPECTED_VERSIONS` | zentrale Liste der Vorbereitungs-Versionen | 1 (je abweichendem Paket) |
| dazu ein Gate-Test, der die Bestandszahl pinnte (`12 Blöcke in 11 Dateien`, `6 Host-Hälften`) | absolute Zahl statt abgeleiteter Form | 3 |
| `scripts/pack-test.mjs` (nicht rot, aber teuer) | je Paket sequenziell `npm pack` + isoliertes `npm install` | 19 Pakete ≈ 22 s, wachsend linear |

## 2. Was daraus wurde — Erklärung im Paket statt Liste im Gate

Dieselbe Begründung trägt alle drei Umbauten: **eine Erklärung, die nur im Gate
wohnt, ist keine Erklärung des Pakets.** Das Gate liest sie jetzt aus dem Baum.

1. **Idiome** (`scripts/lib/plugin-idioms.mjs`): die zentrale `REGIONS`-Tabelle ist
   weg. Jede Datei erklärt ihre Regionen selbst — die **Startmarke trägt die
   Parameter** des Bausteins (`params={"table":…,"key":…,"label":…}`), die Prüfung
   findet die Blöcke im Baum, der Schreiber (`npm run idioms`) rendert aus der
   Erklärung. Die Zusage bleibt scharf: der Block muss zeichengenau die Ableitung
   der einen Quelle sein, und eine handgepflegte Kopie daneben bleibt ein Befund.
   Geraten wird nicht: ein unbekannter Baustein, unvollständige oder unparsbare
   Parameter lassen die Datei unangetastet und werden gemeldet (fail-closed).
2. **Zurückstellung** (`dead-package`): `KNOWN_INACTIVE` ist weg; das Paket sagt es
   selbst — `"dsh": { "inactive": true }` im eigenen Manifest. Ein Nicht-Boolean in
   diesem Feld ist ein Befund, „gilt als aktiv“ gibt es nicht.
3. **Versionen** (`doctor`): `EXPECTED_VERSIONS` ist weg. Die Regel ist abgeleitet,
   ohne Namensliste: ein ausgeliefertes Paket führt die Auslieferungs-Zeile, ein als
   `dsh.inactive` deklariertes darf die Vorbereitungs-Zeile führen. Alles andere
   bleibt rot — der Befund nennt Paket und Zeile.
4. **Inventar** (`doctor`): ein `dsh.inactive`-Paket muss noch nicht im
   Root-Manifest stehen; ein ausgeliefertes Paket muss (und ein Eintrag ohne Ordner
   bleibt ein Befund).
5. **Distributionstest** (`pack-test.mjs`): die Pakete laufen in einem begrenzten
   Pool (höchstens sechs gleichzeitig); die Zusagen je Paket sind unverändert, die
   Ausgabereihenfolge bleibt die Discovery-Reihenfolge. Gemessen: 39 Pakete schneller
   als vorher 19 (Zahlen in `docs/ZAHLEN.md` §2).
6. **Die Gate-Tests** (`plugin-idioms.test.mjs`) prüfen jetzt **Formen statt
   Bestandszahlen**: dass beide Hälften vertreten sind, dass jeder Block ein
   bekannter Baustein ist, dass nur Paket-Hälften Blöcke tragen, und dass die
   Anzahl der Regionen relativ stimmt. Absolute Zahlen stehen in `docs/ZAHLEN.md` —
   sie sind der Zustand, nicht die Regel.

## 3. Der Nachweis ist wiederholbar: `npm run scale:check`

`scripts/scale-check.mjs` baut die Kopie, erzeugt die Klon-Pakete und lässt die
ganze Kette darüber laufen (Idiom-Schreiber, statisches Gate, Gate-Engine `--full`,
Gate-Tests, Distributionstest, Build). Der echte Baum wird nie angefasst; `--keep`
behält die Kopie, `--json` schreibt die Messung weg, `--plugins N` ändert die Zahl
der neuen Pakete. Der Lauf gehört **nicht** zu `npm test` (er kopiert den Baum und
dauert rund anderthalb Minuten), sondern ist der Beleg für genau die Frage aus §1.

Das Rezept, das der Lauf je Paket ausführt — und das damit der Vertrag für ein neues
Plugin ist (ausgeschrieben in `docs/ARCHITECTURE.md` §2):

- Ordner `packages/<dir>/` mit den vier Rollendateien und eigenen Vertragsnamen;
- die eigenen Idiom-Werte in den Startmarken der generierten Blöcke;
- `"dsh": { "inactive": true }`, solange das Paket nicht im Profil steht;
- **eine** Zeile in `packages/locale-de/client.js`, wenn das Paket einen Menü-Text
  zeigt (das Wörterbuch ist die Besitzerin der Texte, der Fallback im Paket ist nur
  die Sicherheitsleine) — die einzige Zeile außerhalb des eigenen Ordners.

## 4. Was dieser Lauf nicht misst

- **Ein Paket, das ins Profil soll.** Patch-Eintrag, Profil-Manifest und ein
  `npm install` sind bewusst Handarbeit (`docs/ARCHITECTURE.md` §3) und werden hier
  nicht simuliert.
- **Laufzeit.** Der Lauf prüft Verträge, Verteilung, Build — kein Modell, kein
  Browser, kein `dsh`-Boot.
- **Zeit als Zusage.** Die Dauer des Distributionstests ist gemessen, aber kein
  Gate: eine langsamere Maschine darf ihn nicht rot machen.

## 5. Offen

- Die Paketquelle bleibt `npm` (Schritt 3.5/A1); die zwei pnpm-Aufrufe des
  Distributionstests sind ersetzt, `dsh plugin add` spricht weiter pnpm — fremder
  Code, unverändert.
- Ob die fünf zurückgestellten Pakete (namentlich in `docs/ZAHLEN.md` §1) ins Profil
  sollen, entscheidet dieses Dokument nicht.
