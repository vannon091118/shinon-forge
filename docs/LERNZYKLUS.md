# Lernzyklus bedienen

> **Status:** current — was du siehst, wann du freigibst, wie du zurücknimmst. **Stand:** 2026-10-24
> **Einstieg:** `README.md` · **Vertrag:** `packages/prompter/assets/learning-review-rules.json` · **Zahlen:** `docs/ZAHLEN.md`

Shinon lernt im Hintergrund — nach einem abgeschlossenen Turn oder sofort nach einer
ausdrücklichen Korrektur. Der Zyklus hat fünf Schritte, und du kannst an jedem davon
eingreifen. **Müssen** musst du an keinem.

```
Turn / Korrektur
      │  Digest (redigiert, begrenzt)
      ▼
Prüfer ── ein Modellaufruf, keine Werkzeuge
      │  { decision: memory | skill | none }
      ▼
Vorschlag ── Form, Größe, Herkunft, Risiko, Dublette
      │
      ├─ skill  → Skill-Writer  → wird geschrieben oder wartet
      └─ memory → Persona-Naht  → wird übernommen oder wartet
      ▼
Register (.shinon/learning-proposals.json)  ← Audit + Rücknahme-Anker
      ▼
Curator (wöchentlich)  →  Dubletten, Veraltetes, Ungenutztes
```

## Was du siehst

**Nichts, solange nichts passiert.** Der Prüfer läuft asynchron: Antwort und Abbruch eines
Turns warten nie auf ihn. Es gibt keine Fortschrittsanzeige, weil es keinen Fortschritt
gibt, den du sehen müsstest — nur ein Ergebnis.

**Den Stand jederzeit:**

```bash
npm run learn status          # wie viele Vorschläge offen / angenommen / automatisch
npm run learn list            # offene Vorschläge mit Ziel, Grund, Quellen
npm run learn list -- --all   # auch entschiedene
npm run learn show <id>       # Prüfbefunde und Diff eines Vorschlags
```

**Im Panel:** Angenommene Erinnerungen und Auflagen der Persona stehen als Zeilen im
Prompt-Abschnitt (maximal 6 Erinnerungen, 4 Auflagen). Was dort steht, hat einen Beleg —
eine Quelle aus dem Gespräch, keine Erfindung.

## Wann du freigibst

Die Vorgabe ist **Autonomie mit Netz**: risikoarme, eindeutig belegte Vorschläge gelten
sofort, alles andere wartet.

| Lage | Ergebnis |
|---|---|
| Schalter auf `false` (Vorgabe), Risiko `niedrig`, Beleg erfüllt (Korrektur oder ≥ 3 abgeschlossene Züge) | **automatisch** übernommen |
| Schalter auf `false`, aber Ziel ist ein zentraler Pfad (`AGENTS.md`, `docs/contracts/`, `profiles/`, `scripts/gate/`) | **gestagt** — zentrale Regeln ändert niemand unbeaufsichtigt |
| Schalter auf `false`, aber Beleg zu dünn | **gestagt** |
| Schalter auf `true` | **jede** Änderung wird bereitgestellt |

Schalter: `learningReview.memoryWriteApproval` und `learningReview.skillWriteApproval`
(Profil `profiles/shinon/fragments/70-prompter.yml`). Sie wirken getrennt — Skills und
Gedächtnis haben verschiedene Eigentümer.

**Freigeben:**

```bash
npm run learn approve <id>    # prüft den Basis-Hash erneut; Abweichung = KONFLIKT, keine Änderung
npm run learn reject <id>     # ablehnen, mit Grund im Register
npm run learn undo <id>       # zurücknehmen (nur wenn der Ist-Hash passt)
```

Für Gedächtnis-Vorschläge entscheidet die Persona, nicht das Skript:
`POST /shinon/persona/review` mit `{ id, decision: "accepted" | "rejected" | "revoked" }`
oder der Klick im Review-Panel. `npm run learn approve <memory-id>` nennt dir die Route,
statt daran vorbei zu schreiben.

## Wie du eine falsche Automatik-Übernahme zurücknimmst

**Skill:** `npm run learn undo <id>`. Der Writer hat vor dem Schreiben gesichert
(`.shinon/skill-backups/<id>.md`). Die Rücknahme prüft den Hash der angewandten Datei —
wenn du sie inzwischen selbst geändert hast, verweigert sie mit `KONFLIKT` und lässt deine
Version stehen. Eine neu angelegte Datei wird **verschoben**, nie gelöscht. Danach ist der
Skill wieder aus dem Katalog; der nächste Prompt enthält ihn nicht mehr.

**Erinnerung/Auflage:** Panel öffnen, die Zeile anklicken, `revoked` wählen — oder
`POST /shinon/persona/review { id, decision: "revoked" }`. Die Auflage verschwindet aus
dem Prompt, der Beleg bleibt im Register (Widerruf ist symmetrisch, Löschen wäre Geschichtsklitterung).

**Wenn du gar nicht willst, dass automatisch geschrieben wird:** einen der beiden Schalter
auf `true` setzen. Dann ist jeder Vorschlag ein Antrag. Rückkehr zur Automatik: `false`.

## Konsolidierung (Curator)

Der Curator läuft wöchentlich im Hintergrund (`autoApply: true`), wenn du mindestens zwei
Stunden ruhig warst. Er **meldet** Dubletten, Veraltetes (14 Tage) und Ungenutztes
(30 Tage) und **archiviert** nur, was die Regeln erlauben:

- Skills mit dem Marker `shinon-skill-fp:` (vom Writer erzeugt) — handgeschriebene sind gepinnt.
- Nur bei belegter Nutzungslage. Fehlt `.shinon/skill-usage.json`, lautet der Befund
  `UNBEKANNT` und es wird **nichts** archiviert.
- Dubletten werden aufgelöst, indem die überzählige Kopie ins Archiv wandert (die benutzte
  bleibt) — Prosa wird nie automatisch verschmolzen.

```bash
npm run learn curate -- --dry-run   # nur zeigen
npm run learn archive               # den fälligen Lauf erzwingen
npm run learn restore <name>        # zurückholen, verweigert bei belegtem Ziel
npm run learn pin <name>            # nie anfassen (auch für verwaltete Skills)
npm run learn adopt <name>          # handgeschriebenen Skill bewusst übernehmen
```

Archiv: `.shinon/learning-archive/<stamp>/JOURNAL.json` mit SHA-256 je Datei. Ein Umzug
ist immer umkehrbar; es wird nie gelöscht.

## Wo die Grenzen sind — benannt, nicht versteckt

- **Redaktion ist mustergebunden.** Private-Key-Blöcke, `sk-`/`ghp_`/`AKIA`/JWTs, Bearer,
  `KEY=value`, lange Base64-Folgen, Home-Pfade, E-Mails und unsichtbare Unicode-Zeichen
  werden ersetzt. Kodierte oder zerlegte Geheimnisse erkennt sie nicht.
- **Ein Vorschlag hat Grenzen:** Claim ≤ 160 Zeichen, Begründung ≤ 240, höchstens 6 Quellen,
  Register-Deckel 100 Einträge (nur entschiedene werden gekürzt).
- **Der Prüfer hat keine Werkzeuge** und genau einen Modellaufruf je Auftrag. Er schreibt
  nie selbst; das tun nur die Eigentümer.
- **Ohne Sitzungsworkspace passiert nichts.** Kein `process.cwd()` als Ersatz für ein
  Projekt — ein fremdes Projekt erbt deinen Lernstand nicht.
- **Modelltreue ist nicht deterministisch prüfbar.** Belegt ist die Mechanik (Tests,
  Grenzen, Register); ob das Modell klug lernt, zeigt erst ein echter Lauf.

## Wenn etwas klemmt

| Symptom | Erste Frage | Befehl |
|---|---|---|
| Kein Vorschlag nach einer Korrektur | War eine Antwort zugeordnet? Ohne sie gibt es kein Signal | `npm run learn status` |
| Vorschlag „blockiert" | Welcher Befund? `SENSIBEL`, `DUPLIKAT`, `KONFLIKT`? | `npm run learn show <id>` |
| Automatik schreibt nicht | Belegschwelle, zentrales Ziel oder Schalter `true` | Profil-Config prüfen |
| Nichts wird kuratiert | Fehlt die Nutzungsdatei? Weniger als 7 Tage seit dem letzten Lauf? | `npm run learn curate -- --dry-run` |
| Register unlesbar | Ein fremder Vertrag wird verworfen, nie überschrieben | Datei heißt `.shinon/learning-proposals.json` |
