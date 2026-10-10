# CHANGELOG — Audit-Spuren (nur Audit-Artefakte, kein Code)

> **Status:** current — wird nach jeder relevanten Reparatur fortgeschrieben, nicht überschrieben. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · **Zahlen:** `Docs/ZAHLEN.md`

- 2026-10-10 — Startdatei + Profiltest: `scripts/start.mjs` neu (`npm start`, Node-Selbstheilung, dsh-Suche, `--check`); belegt `--check` Exit 0, `--dump-config` Exit 0, `dsh-profile-test` 3/0 mit dsh im PATH. Matrix nachgetragen.
- 2026-10-10 — Nutzer-Messungen nachgetragen (Terminal): `build.mjs` Exit 0 (19 Pakete, 96 Dateien, 907012 Bytes), `dsh-update.mjs`-„kein Update" als Scheinprüfung enttarnt (hartcodiert, `latest: current`), `open.mjs` Exit 1 (`dsh` nicht im PATH). Matrix ergänzt; kein Source geändert.
- 2026-10-10 — Phase A abgeschlossen (read-only + `docs/audit/` neu): 6 Dateien angelegt (`REPOSITORY_INVENTORY`, `ARCHITECTURE_MAP`, `DEPENDENCY_FINDINGS`, `SHINON_MIGRATION_MAP`, `VERIFICATION_MATRIX`, `REPAIR_PLAN`). Keine Source-Datei geändert. Offene Punkte: P0-Umgebung (Node 18 statt ≥22, kein dsh, pnpm tot), 31 fremde Worktree-Änderungen ungeklärt, 7 `gate:test`-Dateien umgebungsrot, Boot/Modell/Browser UNGEPRÜFT/BLOCKIERT.
