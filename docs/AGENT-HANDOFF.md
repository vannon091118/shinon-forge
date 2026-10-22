# Agenten-Übergabe

> **Status:** current · **Eigentümer offener Arbeit:** [ROADMAP.md](ROADMAP.md)
> **Änderungsspur:** [CHANGELOG.md](CHANGELOG.md) · **Dauerhafte Historie:** [TAGEBUCH.md](TAGEBUCH.md)

## Startprotokoll

1. `git status --short` prüfen. Lokale Nutzerdaten und nicht zugehörige Änderungen nicht anfassen.
2. `AGENTS.md`, `docs/INDEX.md` und den relevanten Roadmap-Abschnitt lesen.
3. PRs, Pflicht-Checks und offene Review-Kommentare prüfen, bevor du eine Aufgabe übernimmst.
4. Eine atomare Aufgabe aus `docs/ROADMAP.md` wählen. Scope, Abnahmekommando und erwarteten Beleg vor der Implementierung festhalten.
5. Auf einem eigenen Branch/Worktree arbeiten; Konflikte klein halten und nach Repo-Regeln committen.

## Abschlussprotokoll

- [ ] Änderungen auf die vereinbarte Aufgabe begrenzt.
- [ ] Passende Tests/Gates ausgeführt; Befehl und Exit-Code dokumentiert.
- [ ] Keine Secrets, Sessions, Logs, lokale Agenten-Ausgaben oder Workspace-Metadaten eingecheckt.
- [ ] PR-Body enthält Zweck, Dateibereiche, Belege, bekannte Grenzen und nächste übertragbare Aufgabe.
- [ ] CI-Pflichtjobs grün; kein Pflichtjob übersprungen oder abgebrochen.
- [ ] `docs/CHANGELOG.md` enthält den übertragbaren Status und den tatsächlichen CI-/PR-Beleg.
- [ ] `docs/TAGEBUCH.md` enthält nach Merge einen Eintrag mit echtem Commit-SHA und heute existierenden Pfaden.
- [ ] Erledigte Roadmap-Punkte entfernt; neue TODOs ausschließlich in `docs/ROADMAP.md` ergänzt.

## Statusregeln

- `OFFEN`: noch nicht implementiert oder kein belastbarer Beleg.
- `BLOCKIERT`: externe Voraussetzung fehlt; Blocker und benötigte Aktion nennen.
- `ERLEDIGT`: belegte Umsetzung, erfolgreicher relevanter Check und referenzierbarer Commit/PR.
- Ein grüner Teiltest ist kein Release-Pass. Ein Review- oder Security-Check mit Status `skipped`, `cancelled` oder `pending` zählt nicht als grün.

## Automatische Preflight-Abnahme

Der Abschluss gilt nur als angenommen, wenn der GitHub-Job
**Preflight-Abnahme (fail-closed)** erfolgreich endet. Der Job prueft alle
Pflichtzweige einschliesslich Dokumentationsvertrag, Dependency-Audit, CodeQL
und Secret-Scan. `skipped`, `cancelled`, fehlende und unbekannte Resultate
sind kein Erfolg.

Bei einem Fehler zuerst den konkreten Code und den betroffenen Job im
`preflight-report.json`-Artefakt lesen. Beispiele sind
`PREFLIGHT_CODEQL_FAILED`, `PREFLIGHT_DEPENDENCY_AUDIT_FAILED`,
`PREFLIGHT_SECRET_SCAN_FAILED`, `PREFLIGHT_LINK_BROKEN` und
`PREFLIGHT_JOB_NOT_REQUIRED`. Run-ID, Commit-SHA und Run-Link gehoeren zum
Beleg. Kein Agent darf eine rote oder fehlende Abnahme in Dokumentation als
`ERLEDIGT` umetikettieren.
