# Changelog für Übergaben

> **Zweck:** kompakte, übertragbare Änderungsspur für Menschen und Folge-Agenten.
> Erledigt heißt erst erledigt, wenn der konkrete Beleg und der CI-Status genannt sind.
> Die ausführliche Erzählung mit Commit- und Pfadankern bleibt in [TAGEBUCH.md](TAGEBUCH.md);
> offene Aufgaben bleiben ausschließlich in [ROADMAP.md](ROADMAP.md).

## Unreleased

### Geändert
- README/Banner/Clean-Clone-Hygiene plus permanente Agenten-Übergabe werden in PR #23 zusammengeführt.
- Modularer Preflight ergänzt mit zentraler Policy (`scripts/lib/preflight/policy.mjs`), formatierbaren Diagnosen, Dokumentations-/Linkprüfung, job-spezifischen `PREFLIGHT_*` Fehlercodes und maschinenlesbarer Abnahme (`scripts/preflight-verdict.mjs`).
- Der Abschlussjob bewertet alle 13 Pflichtjobs und bindet jede deklarierte Prüfstrecke ein; `failure`, `cancelled`, `skipped`, fehlende und unbekannte Resultate sind rot. Der Report enthält Commit-SHA, Run-ID, Logs-Link und Status je Job. Diese Änderung ist noch nicht angenommen, bevor die tatsächlichen GitHub-Checks grün sind.
- Messbeleg für vermeidbare Kosten: Gate-Run `39711072872` maß rund 16 s für `npm ci` und 17,2 s für die Gate-Suiten. Entfernt wurden nur nachweisbare Duplikate: zweiter `shinon-test.mjs`-Lauf, Installation im Lockfile-Audit und doppelte Literal-Checks zusätzlich zu echtem `git check-ignore`/`git ls-files`.

### Belege
- PR: https://github.com/vannon091118/shinon-forge/pull/23
- CI: lokal nicht als ausgeführt behaupten. Auf den GitHub-Check `Preflight-Abnahme (fail-closed)` und das `preflight-report.json`-Artefakt warten; den tatsächlichen Status erst danach eintragen.

### Übergabe an den nächsten Agenten
- Zuerst PR-Checks und Security-Workflow prüfen, Fehler beheben und den Merge erst bei erfüllten Pflicht-Gates ausführen.
- Danach Release-Freigabe v0.4.0 anhand der kanonischen Kriterien in [ROADMAP.md](ROADMAP.md) fortsetzen.
- Neue offene Arbeit nur in [ROADMAP.md](ROADMAP.md) aufnehmen; abgeschlossene Punkte dort entfernen und hier mit Beleg sowie in [TAGEBUCH.md](TAGEBUCH.md) mit Commit-/Pfadankern dokumentieren.
