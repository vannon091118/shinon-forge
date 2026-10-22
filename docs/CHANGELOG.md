# Changelog für Übergaben

> **Zweck:** kompakte, übertragbare Änderungsspur für Menschen und Folge-Agenten.
> Erledigt heißt erst erledigt, wenn der konkrete Beleg und der CI-Status genannt sind.
> Die ausführliche Erzählung mit Commit- und Pfadankern bleibt in [TAGEBUCH.md](TAGEBUCH.md);
> offene Aufgaben bleiben ausschließlich in [ROADMAP.md](ROADMAP.md).

## Unreleased

### Geändert
- Branch-Integration: PR #22 (`work/dsh-provenance-docs`) ist als `0ad4618` und `88a37ab` linear auf `main` übernommen; beide Commits tragen die bestehende Vannon-Regel. Die vier offenen Dependabot-Zweige (#24–#27) waren vier Commits hinter `main`; ihre Bumps sind direkt eingearbeitet (`checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, `download-artifact@v8`).
- Paketbau: Doku-only-Pushes überspringen den Bau (`paths-ignore` für `docs/**` und `AGENTS.md`, weil die Nutzlast laut `scripts/lib/payload.mjs` nur README, Code und Produktionsabhängigkeiten trägt); eine `concurrency`-Gruppe je Ref bricht überholte `main`-Bauten ab, Tag-Bauten bleiben unberührt. Kein Job entfällt.
- Testline: `npm run gate:test` bricht bei 20 s ab (`--test-timeout=20000`). Die Gate-Engine nennt bei Rot `GATE_<ID>_FAILED` bzw. `GATE_<ID>_THREW` und sammelt die Codes im Verdict; das statische Gate nennt `STATIC_<STEP>_FAILED`. Die frühere Existenz-Zusage im Narrative-Test prüft jetzt Vertrag, Zustände und Verbotsliste.
- Governance-Doku: Die Testzeit-Regel in `AGENTS.md` ist von 48 auf die Regel selbst eingekürzt (Ziel 10 s, Abbruch 20 s, Ereignisfrist 5 s, Antragspflicht); gemessene Zeiten und Ausnahmen stehen ausschließlich in `docs/ZAHLEN.md` §2. Der Bestandsblock wurde per `npm run zahlen:sync` auf den gebauten Baum nachgezogen (24 Pakete, 294 Dateien).
- README/Banner/Clean-Clone-Hygiene plus permanente Agenten-Übergabe sind mit PR #23 gemergt (`8f4a7ea`).
- Modularer Preflight ergänzt mit zentraler Policy (`scripts/lib/preflight/policy.mjs`), formatierbaren Diagnosen, Dokumentations-/Linkprüfung, job-spezifischen `PREFLIGHT_*` Fehlercodes und maschinenlesbarer Abnahme (`scripts/preflight-verdict.mjs`).
- Der Abschlussjob bewertet alle 13 Pflichtjobs und bindet jede deklarierte Prüfstrecke ein; `failure`, `cancelled`, `skipped`, fehlende und unbekannte Resultate sind rot. Der Report enthält Commit-SHA, Run-ID, Logs-Link und Status je Job. Abgenommen: PR-Head `e51d3cf` hat den vollständigen GitHub-Gate-Lauf `39744957109` mit 21/21 Jobs erfolgreich bestanden; darunter Schnellpfad, Gate-Tests, Distribution, TypeScript, Dependency Audit, Secret Scan, CodeQL und fail-closed Verdict.
- Korrektur zum Abnahmebericht: Der grüne Lauf `39744957109` belegt nur den PR-Head `e51d3cf` vor dem Merge, nicht den Zustand von `main` danach. Der Folge-Push `e0169018dcbd13814fbbf8d50ab1b58f3418069c` fiel in Run `39763565653` am Commit-Wächter und am Schnellpfad durch. Der Wächter meldete fehlenden Vannon-Trailer, weniger als 150 Wörter, fehlenden Datenbeleg und fehlende Bildsprache; der Tagebuchcheck verwarf einen vollständigen SHA, weil `scripts/lib/diary.mjs` nur Kurz-SHAs aus `git log` geladen hatte. Das ist der belegte Ausgangsbefund dieser Korrektur, kein Release-Pass.
- Messbeleg für vermeidbare Kosten: Gate-Run `39711072872` maß rund 16 s für `npm ci` und 17,2 s für die Gate-Suiten. Entfernt wurden nur nachweisbare Duplikate: zweiter `shinon-test.mjs`-Lauf, Installation im Lockfile-Audit und doppelte Literal-Checks zusätzlich zu echtem `git check-ignore`/`git ls-files`.

### Belege
- Lokale Abnahme 2026-10-22: `npm test` Exit 0 (3 s), `npm run gate:test` Exit 0 (948 Tests, 0 rot, 0 geskippt, 14 s; langsamste Datei 5,8 s), `npm run preflight:docs:check` Exit 0, `npm run build` Exit 0, `npm run zahlen:check` Exit 0, Profiltest 4/4 Exit 0. Dev-Server auf Port 3000: UI mit Token HTTP 200 (46 264 Bytes), ohne Token 401, fremder Origin 403.
- PR #23: https://github.com/vannon091118/shinon-forge/pull/23 · Merge-Commit: `8f4a7ea8f6e639525a312e61a88d8910bdc23e7e`.
- Gate-Run: https://github.com/vannon091118/shinon-forge/actions/runs/39744957109 · 21/21 Jobs grün, 0 fehlgeschlagen, 0 übersprungen.

### Übergabe an den nächsten Agenten
- Nächster Agent: Release-Freigabe v0.4.0 anhand der kanonischen Kriterien in [ROADMAP.md](ROADMAP.md) fortsetzen.
- Neue offene Arbeit nur in [ROADMAP.md](ROADMAP.md) aufnehmen; abgeschlossene Punkte dort entfernen und hier mit Beleg sowie in [TAGEBUCH.md](TAGEBUCH.md) mit Commit-/Pfadankern dokumentieren.

