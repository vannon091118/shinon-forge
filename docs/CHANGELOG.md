# Changelog für Übergaben

> **Zweck:** kompakte, übertragbare Änderungsspur für Menschen und Folge-Agenten.
> Erledigt heißt erst erledigt, wenn der konkrete Beleg und der CI-Status genannt sind.
> Die ausführliche Erzählung mit Commit- und Pfadankern bleibt in [TAGEBUCH.md](TAGEBUCH.md);
> offene Aufgaben bleiben ausschließlich in [ROADMAP.md](ROADMAP.md).

## Unreleased

### Geändert
- README/Banner/Clean-Clone-Hygiene plus permanente Agenten-Übergabe sind mit PR #23 gemergt (`8f4a7ea`).
- Modularer Preflight ergänzt mit zentraler Policy (`scripts/lib/preflight/policy.mjs`), formatierbaren Diagnosen, Dokumentations-/Linkprüfung, job-spezifischen `PREFLIGHT_*` Fehlercodes und maschinenlesbarer Abnahme (`scripts/preflight-verdict.mjs`).
- Der Abschlussjob bewertet alle 13 Pflichtjobs und bindet jede deklarierte Prüfstrecke ein; `failure`, `cancelled`, `skipped`, fehlende und unbekannte Resultate sind rot. Der Report enthält Commit-SHA, Run-ID, Logs-Link und Status je Job. Abgenommen: PR-Head `e51d3cf` hat den vollständigen GitHub-Gate-Lauf `39744957109` mit 21/21 Jobs erfolgreich bestanden; darunter Schnellpfad, Gate-Tests, Distribution, TypeScript, Dependency Audit, Secret Scan, CodeQL und fail-closed Verdict.
- Korrektur zum Abnahmebericht: Der grüne Lauf `39744957109` belegt nur den PR-Head `e51d3cf` vor dem Merge, nicht den Zustand von `main` danach. Der Folge-Push `e0169018dcbd13814fbbf8d50ab1b58f3418069c` fiel in Run `39763565653` am Commit-Wächter und am Schnellpfad durch. Der Wächter meldete fehlenden Vannon-Trailer, weniger als 150 Wörter, fehlenden Datenbeleg und fehlende Bildsprache; der Tagebuchcheck verwarf einen vollständigen SHA, weil `scripts/lib/diary.mjs` nur Kurz-SHAs aus `git log` geladen hatte. Das ist der belegte Ausgangsbefund dieser Korrektur, kein Release-Pass.
- Messbeleg für vermeidbare Kosten: Gate-Run `39711072872` maß rund 16 s für `npm ci` und 17,2 s für die Gate-Suiten. Entfernt wurden nur nachweisbare Duplikate: zweiter `shinon-test.mjs`-Lauf, Installation im Lockfile-Audit und doppelte Literal-Checks zusätzlich zu echtem `git check-ignore`/`git ls-files`.

### Belege
- PR #23: https://github.com/vannon091118/shinon-forge/pull/23 · Merge-Commit: `8f4a7ea8f6e639525a312e61a88d8910bdc23e7e`.
- Gate-Run: https://github.com/vannon091118/shinon-forge/actions/runs/39744957109 · 21/21 Jobs grün, 0 fehlgeschlagen, 0 übersprungen.

### Übergabe an den nächsten Agenten
- Nächster Agent: Release-Freigabe v0.4.0 anhand der kanonischen Kriterien in [ROADMAP.md](ROADMAP.md) fortsetzen.
- Neue offene Arbeit nur in [ROADMAP.md](ROADMAP.md) aufnehmen; abgeschlossene Punkte dort entfernen und hier mit Beleg sowie in [TAGEBUCH.md](TAGEBUCH.md) mit Commit-/Pfadankern dokumentieren.

