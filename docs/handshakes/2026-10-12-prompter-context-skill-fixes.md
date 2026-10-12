# Handshake: Prompter-Kontext und Skill-Selektion

**Status:** Folgepaket in Arbeit; die Prompter-Änderungen unten sind jetzt ergänzt. DSH-PATH-Härtung und Launcher-Verdrahtung sind ebenfalls geändert. Der Commit-Guard läuft nach dem Push; ein vollständiger lokaler `npm test`-Lauf war in dieser Sandbox wegen fehlender GitHub-DNS-Auflösung und fehlendem Repository-Checkout nicht möglich.
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

Die Sandbox konnte GitHub nicht direkt auflösen (`git clone` scheiterte mit `Could not resolve host: github.com`; der vollständige Projektbaum samt `node_modules` stand deshalb lokal nicht bereit. Die isolierte Sandbox-Prüfung des extrahierten Parsing-/Ranking-Verhaltens lief mit `node --test /mnt/data/shinon-focused-validation.test.mjs` erfolgreich: **5/5 Tests, Exit 0**. Das ist ein gezielter Verhaltenstest und ausdrücklich **kein** Lauf der originalen Repo-Dateien oder von `npm test`.

Der Push-Workflow **Shinon Commit Guard** für Commit `14d3185b7122c9c16331dfc1350ef747d4e15061` wurde erfolgreich abgeschlossen: [GitHub Actions Run 38192734263](https://github.com/vannon091118/shinon-forge/actions/runs/38192734263). Die drei im Workflow protokollierten Testbatches meldeten **401/401**, **46/46** und **42/42** erfolgreich, jeweils ohne Fehlschlag. Das belegt den Guard-Lauf, nicht die komplette `npm test`-Suite; diese bleibt bis zu einem echten Voll-Repository-Lauf ungeprüft. Zwischenzeitliche fehlgeschlagene Guard-Runs auf den beiden vorherigen Commits wurden nach Fehleranalyse korrigiert.

## Anweisung an den nächsten Agenten

1. Lies diese Datei vor Änderungen an MAX-Kontext oder Skill-Auswahl.
2. Prüfe den Commit-Diff und führe die vier Befehle oben aus, sofern die Abhängigkeiten verfügbar sind.
3. Verändere nicht die fail-closed-Regel für ausdrücklich konfigurierte kaputte Kontextdateien.
4. Entferne kein Ranking-Limit: `maxSkills` gehört nach dem Ranking, nicht vor die Kandidatenliste.
5. Aktualisiere diesen Handshake mit tatsächlichen CI-Zahlen und konkreten Commit-SHA, sobald die Prüfungen abgeschlossen sind. Keine Statusklasse „Verified“ ohne Beleg.



## Folgepaket: Plan Phasen 0–4 (2026-10-12)

### Phase 0 — Skill-Selektion

- `readSkills()` liefert weiterhin alle Kandidaten; das Limit gilt erst in `selectSkills()`.
- Die Selektionsfunktion entfernt konfigurierbare Stopwörter aus Prompt und Skill-Metadaten.
- Ein Skill, der im **Nutzerprompt** explizit benannt ist (Slug oder ausgeschriebene Wörter), wird vor reinem Token-Overlap priorisiert. Namen, die nur aus Projektpfaden oder Indexkontext stammen, zählen nicht als explizite Nutzerbenennung.
- `skill-selection.test.mjs` prüft das echte Verzeichnis-/Dateisystem über temporäre Verzeichnisse: Frontmatter, spätes relevantes Skill, explizite Namenspriorität, Smalltalk ohne Treffer und fehlende Beschreibung.
- **Datenlimit:** Im Repo war kein echtes Session-Log auffindbar. Die Stopwortliste ist daher eine überprüfbare generische DE/EN-Baseline, ausdrücklich NICHT als aus realen Prompts gemessen markiert. Sobald ein Session-Log verfügbar ist, die Liste anhand tatsächlicher Fehlselektionen nachjustieren.

### Phase 1 — Doppel-Install / reproduzierbarer Start

- Aktiver DSH-Pin bleibt `@deepseek-ai/dsh@0.2.1-alpha.1`; kein zweiter Vendor-Pfad für eine ungeklärte alpha.2-Kopie wird aktiviert.
- `dshBinary()` akzeptiert standardmäßig die Repo-Installation bzw. den bereits vorgesehenen Vendor-Pfad. PATH-/Prefix-Fallback ist nur noch mit `SHINON_ALLOW_PATH_DSH=1` verfügbar.
- `scripts/open.mjs` und der optionale Desktop-Launcher verwenden denselben `dshBinary()`-Resolver wie `bin/shinon.mjs`. Der Desktop-Launcher benötigt dadurch nicht länger ein separat global installiertes `dsh`.
- Terminal-Start bleibt `shinon` (nach Installation des Pakets/CLI-Bins) beziehungsweise `npm start`; optionales Icon: `npm run desktop:launcher`.
- Noch offen: YAML-Test-Resolver `dshRoot()/dshHarnessDir()` zentralisieren, Fixture-Node-Modules symlinken und PATH-entfernte Abnahme. Das muss im vollständigen Checkout mit installierten Dependencies laufen.
- `schemastery@3.18.5-alpha.1` wird in diesem Commit **nicht** blind in Manifeste gepinnt: ohne Registry-Zugriff kann das Lockfile nicht neu erzeugt oder die Kompatibilität nachgewiesen werden. Aktueller Stand bleibt `~3.18.4`; das ist ein klar markierter Restposten, keine erledigte Phase.

### Phase 2 — Persona und Mood (offen)

- Die gewünschte feste/überschreibbare Stance muss mit dem vorhandenen Scoring-Vertrag auf genau eine Prompt-Zeile abgebildet werden. Der Satz „Niix ist fest“ ist als Entscheidung nicht eindeutig genug für eine sichere Verhaltensänderung; bis zur Klärung wird weder Baseline noch Scoring still überschrieben.
- `gate.*` und `claim.created` werden nicht entfernt, solange ihre Produzenten-/Replay-Kette nicht am realen Event-Spine nachgewiesen wurde.
- Dynamische Prompt-Blöcke und Zeichenbudget brauchen eine gemessene Laufzeitprobe, nicht eine geschätzte Kürzung.

### Phase 3 — Prompter und Index (offen)

- Trace-Zustand `index: absent|building|ready` sowie selbstständiger Index-Build bei erstem MAX-Bedarf bleiben offen. Sie ändern Laufzeitverhalten und benötigen einen echten DSH-Event-Replay-Test.
- Die zwei fehlenden Skills `cordis-composition-reference` und `cordis-plugin-development` wurden nicht erfunden oder aus fremden Quellen kopiert; Skill-Quelle/Version muss zuerst geklärt werden. Nutzerumgebungs-Skills bleiben gemäß Entscheidung ausgeschlossen.

### Phase 4 — Hygiene (offen)

- Provider-`displayName`, generierte Dashboard-`EXPECTED`, `@shinon/core`-Config, generierte Zahlen, Skip-Verdict und Codingmon-Dependency-Klassifikation sind noch nicht geändert. Jede Änderung braucht ihren jeweiligen Daten-/Gate-Vertrag; keine breite Massenänderung ohne Installationslauf.

## Folgepaket: Dateien

- `packages/prompter/index.js` — explizite Skill-Namenspriorität und Stopwortfilter
- `packages/prompter/assets/skill-rules.json` — generische DE/EN-Stopwortliste (vorläufig, nicht session-gemessen)
- `packages/prompter/test/skill-selection.test.mjs` — 5 gezielte Dateisystem-Regressionstests
- `scripts/lib/dsh.mjs` — globaler PATH-/Prefix-Fallback nur mit `SHINON_ALLOW_PATH_DSH=1`
- `scripts/open.mjs` — denselben DSH-Resolver wie CLI verwenden
- `scripts/desktop-launcher.mjs` — optionales Desktop-Icon ohne globale DSH-PATH-Abhängigkeit
- `docs/handshakes/2026-10-12-prompter-context-skill-fixes.md` — Planentscheidungen, Grenzen und offene Abnahmen


## CI-Nachtrag — Testdatei-Rename am 2026-10-12

- `package.json` verweist auf `scripts/shinon-test.mjs` und `scripts/shinon-profile-test.mjs`; die alten `dsh-*.mjs`-Dateien wurden entfernt.
- Der Commit-Guard-Lauf #127 schlug nicht wegen dieser Pfade fehl, sondern weil der Commit `c2fa87da` den verpflichtenden Vannon-Trailer in seiner Commit-Nachricht nicht enthielt.
- Künftige direkte Commits müssen den vom Repository vorgeschriebenen Trailer als letzte Commit-Nachrichtenzeile enthalten. Der aktuelle Commit-Guard prüft Commit-Metadaten; ein nachfolgender korrekt signierter Commit macht den bereits fehlgeschlagenen Lauf nicht rückwirkend grün.
