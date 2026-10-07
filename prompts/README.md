# Goose Prompt Overrides — Shinon (deutsch)

Overrides der eingebauten Goose-Prompt-Templates. Goose lädt sie aus `~/.config/goose/prompts/<name>.md`
und benutzt sie statt der im Binary eingebetteten Defaults. Der Deploy ist erfolgt; die Dateien hier sind
die versionierbare Quelle (identische Checksummen, per `check-prompts.py` geprüft).

## Herkunft
- Basis: Goose **v1.53.0** (`crates/goose/src/prompts/*`, `crates/goose-context-management/src/prompts/compaction*.md`).
- Basis jeweils byte-identisch zum im Binary (`/usr/lib/goose/resources/bin/goose`) eingebetteten Default — verifiziert.
- `defaults-en/`: die englischen Original-Defaults als Referenz (Diff, Reset, Re-Assemble nach Goose-Updates).
- Alle Jinja-Konstrukte (`{{ … }}`, `{% … %}`) sind unverändert erhalten — geprüft durch `check-prompts.py`.

## Anpassung (Stand: Shinon, deutsch)
- **Sprache**: alle Templates auf Deutsch. Fachbegriffe, Dateinamen, API- und Tool-Namen bleiben englisch.
- **Identität/Ton**: Shinon — direkt, trocken, zynisch bei unnötiger Komplexität, sarkastisch bei
  "Warum einfach, wenn es auch JavaScript sein kann?", selbstbewusst in technischen Einschätzungen,
  ehrlich über Unsicherheit und Fehler, türkisch-salopp ("bro", "kanka", "tamam", "yani", "hadi", "wallah").
- **Kein "verstehe"**: als Standardbestätigung verboten; stattdessen "meinst du? aber bro..",
  "yani, meinst du das ernst?", "tamam bro, ich hab's —" und dann liefern.
- **Augenhöhe-Lernlogik**: Shinon lernt über die Zeit das Niveau des Nutzers (technisches Niveau, Tempo,
  Detailtiefe, Humor-Dosis, Härte im Feedback), liest `.goosehints`/MOIM/Memory als Startwert und
  aktualisiert das Bild bei Korrekturen. Dauerhaftes Speichern nur mit ausdrücklichem Ja des Nutzers.
- **Engineering-Regeln** (unverändert inhaltlich): SAFE / BEHAVIOR CHANGE / BREAKING CHANGE, keine
  Golden-Tests blind grün schreiben, Determinismus für Seed-/RNG-Systeme, Game-/Produkt-Blick,
  Multi-Agent-Zuständigkeitsgrenzen, Git-Disziplin, Reportformat Gemacht/Gefunden/Risiko/Tests/Offen, No-BS-Regel.

## Bewusst konservative Dateien
- `permission_judge.md` — deutsch, aber sachlich ohne Slang: Persona/Ton ausdrücklich für ungültig erklärt,
  Klassifikationsvertrag (read-only-Latte, untrusted data) unverändert.
- `compaction.md` — deutsch, aber **JSON-Schlüssel unverändert englisch** (das Schema ist im Binary als
  `StructuredSummary` fest verdrahtet; neue Felder werden still verworfen). Persona-Ton gilt im JSON nicht.
- `session_name.md` — nur der Titel; Ausgabeformat ("Antworte nur mit dem Titel") unverändert.
- `tiny_model_system.md` — `$ `-Kommandoformat und Platzhalter unverändert.

## Prüfen
```
python3 check-prompts.py     # deutsch, Name Shinon, Augenhöhe, kein "verstehe", Jinja/Maschinen-Verträge
```
Exit-Code 0 = alle Checks grün.

## Reset (zurück zu Goose-Default)
```
rm ~/.config/goose/prompts/<name>.md      # einzelnes Template
rm ~/.config/goose/prompts/*.md           # alle
```
Änderungen greifen in **neuen** Sessions; laufende Sessions behalten ihren Prompt.

## Wirkung nach Template
| Template | gilt für |
|---|---|
| system.md, compaction.md, permission_judge.md, subagent_system.md, session_name.md | Desktop + CLI |
| apps_create.md, apps_iterate.md | nur Desktop (Apps-Extension) |
| tiny_model_system.md | nur CLI (kleine lokale Modelle) |
