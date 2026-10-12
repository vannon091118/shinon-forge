# Handshake: Prompter-Kontext und Skill-Selektion

**Status:** Fixes vorbereitet und im Quelltext verankert; der nächste Agent soll die Änderungen nachvollziehen, nicht neu erraten.
**Ausgangspunkt:** `main` bei `3add4879a8b6fc28549eb5c5d1c9aa9947eaa399`.
**Ziel:** MAX muss den Laufzeit-Project-Index erreichen können; Skill-Auswahl muss auf echten Frontmatter-Metadaten und dem vollständigen Kandidatensatz arbeiten.

## Befund und Änderungen

### 1. MAX wurde durch eine ungültige Kontextdatei vor dem Index blockiert

- `packages/prompter/cordis.patch.yml` setzte `contextPath: ./assets/max-context.json`.
- `packages/prompter/assets/max-context.json` ist kein `ContextSchema`-Datensatz. Es enthält stattdessen Metadaten über `shinon.project-index/query-v1`, aber nicht die erforderlichen Felder `project`, `files`, `symbols`, `constraints`, `touches`, `dependencies`.
- `apply()` markiert die konfigurierte Datei beim Mount als `invalid`. `maxContext()` kehrt in diesem Zustand mit `CONTEXT_INVALID` zurück, bevor `indexContext()` den optionalen Dienst `shinon_index_query` fragen kann.
- **Fix:** Die ungültige `contextPath`-Konfiguration wurde entfernt. Der Schemastery-Default ist leer; MAX fragt damit zur Laufzeit den Indexdienst ab. Die unbrauchbare Platzhalterdatei wurde entfernt, damit sie nicht erneut versehentlich aktiviert wird.
- **Invariante:** Eine später ausdrücklich konfigurierte, aber kaputte Kontextdatei sperrt MAX weiterhin. Das ist beabsichtigtes fail-closed-Verhalten. Der Fix betrifft die falsche Standardverdrahtung, nicht die Sicherheitsregel.

### 2. Skill-Beschreibungen wurden aus der falschen Zeile gelesen

- `readSkills()` nahm die erste nichtleere Zeile, die nicht mit `#` begann. Bei üblichem Skill-Frontmatter ist das `---`, nicht die Beschreibung.
- **Fix:** `readSkillDescription()` liest die `description` aus YAML-Frontmatter. Unterstützt werden einfache/doppelte Quotes und gefaltete/literale Mehrzeilenwerte. Skills ohne Beschreibung werden mit `BESCHREIBUNG_FEHLT` protokolliert. Skills ohne Frontmatter behalten den bisherigen Freitext-Fallback.
- Der Skill-Body bleibt weiterhin aus dem Stand-Block ausgeschlossen. Das ist die bestehende Vertragsentscheidung in `skill-rules.json`, kein Teil dieses Bugs.

### 3. Relevante Skills konnten vor dem Ranking abgeschnitten werden

- `readSkills()` sortierte Ordner alphabetisch und wendete `maxSkills` an, bevor `selectSkills()` Treffer zählte.
- **Fix:** `readSkills()` liefert alle lesbaren Kandidaten; `selectSkills()` bewertet und sortiert sie deterministisch und wendet `maxSkills` erst danach an.
- **Invariante:** Trefferzahl absteigend, bei Gleichstand Name alphabetisch; die konfigurierte Obergrenze gilt weiterhin für geladene Skills.

## Betroffene Dateien

- Geändert: `packages/prompter/index.js`
- Geändert: `packages/prompter/cordis.patch.yml`
- Entfernt: `packages/prompter/assets/max-context.json` (ungültiger, nicht als ContextSchema nutzbarer Platzhalter)
- Neu: `packages/prompter/test/skill-selection.test.mjs`
- Neu: `scripts/gate/tests/prompter-profile-wiring.test.mjs`
- Dieser Handshake: `docs/handshakes/2026-10-12-prompter-context-skill-fixes.md`

## Nachweise und lokale Grenzen

Tests, die im Repository laufen sollen:

```sh
node --test packages/prompter/test/skill-selection.test.mjs
node --test scripts/gate/tests/prompter-profile-wiring.test.mjs
node --test scripts/gate/tests/context-wiring.test.mjs
npm test
```

Die Sandbox konnte GitHub nicht direkt auflösen (`git clone` scheitert mit `Could not resolve host: github.com`), und der Projektbaum samt `node_modules` war dort nicht vorhanden. Deshalb wurde die vollständige Repository-Suite vor dem Push nicht als lokal grün ausgegeben. Die neuen Regressionstests liegen im Repository und werden auf dem Push von CI geprüft; Status muss anhand der tatsächlichen Workflow-Läufe nachgesehen werden.

## Anweisung an den nächsten Agenten

1. Lies diese Datei vor Änderungen an MAX-Kontext oder Skill-Auswahl.
2. Prüfe den Commit-Diff und führe die vier Befehle oben aus, sofern die Abhängigkeiten verfügbar sind.
3. Verändere nicht die fail-closed-Regel für ausdrücklich konfigurierte kaputte Kontextdateien.
4. Entferne kein Ranking-Limit: `maxSkills` gehört nach dem Ranking, nicht vor die Kandidatenliste.
5. Aktualisiere diesen Handshake mit tatsächlichen CI-Zahlen und konkreten Commit-SHA, sobald die Prüfungen abgeschlossen sind. Keine Statusklasse „Verified“ ohne Beleg.

