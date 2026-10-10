# REPAIR_PLAN — priorisiert, nach Ursachen (Phase B/C-Vorschlag, nichts umgesetzt)

> **Status:** current — Phase-A-Audit, Vorschlag mit Stand 2026-10-10. **Stand:** 2026-10-10
> **Einstieg:** `Docs/INDEX.md` · **Zahlen:** `Docs/ZAHLEN.md`

Reihenfolge = Fundament zuerst. Jede Einheit: Ausgangszustand → Referenzen prüfen → minimal ändern → Verifikation tatsächlich ausführen → Diff kontrollieren.

1. **P0 — Umgebung herstellen (BLOCKIERT alles andere):** Node ≥22 (vorhanden: `~/.nvm/versions/node/v24.21.0` — per nvm/mise aktivieren, NICHT per System-Umbau), `pnpm` lauffähig machen, `dsh` auf PATH (Pin `0.2.1-alpha.1` vs. installiert-Drift aus `Docs/ZAHLEN.md` beachten), `schemastery` auflösbar machen. Verifikation: `node --version`, `pnpm --version`, `dsh --version`, `npm run test:codingmon` ohne Skips, `node scripts/dsh-profile-test.mjs` Exit 0.
2. **P0 — Arbeitsbaum sichern:** 31 fremde Änderungen + 2 untracked sind geschützt. Nichts resetten/cleanen. Mit Eigentümer klären: `{en,de}`-Meta-Diffs behalten oder reverten? `profiles/web`-Diff Absicht? Untracked (`branding-check.mjs`, `client-activation.test.mjs`) in Suiten verdrahten oder verwerfen? Erst danach Phase C.
3. **P1 — `gate:test`-Rot auflösen:** nach P0 erneut messen; falls die 7 Dateien grün werden, war es reines Umgebungs-Rot (Erwartung). Falls Reste bleiben, je Datei Root-Cause (kein Sammel-Fix).
4. **P1 — Einstiegspunkte entwirren:** `bin/shinon.mjs` entweder zum echten CLI ausbauen (eigene Produktentscheidung + `bin`-Feld + Tests) oder löschen; Reload-Helfer-Kanon bestimmen (1 behalten, 2 stilllegen); `*.tgz` aus `packages/` entfernen (Artefakt gehört nicht in Source).
5. **P2 — Produktentscheidungen (OFFEN, vor Code):** Was heißt „Standalone" hier (Desktop-Starter? Mod-Paket? — kein Spiel-Produkt belegbar)? Sollen die 4 inaktiven Pakete ins Profil? Was gilt als „fertig" für Lokalisierung/QoL/Design (Inventar + Abnahmekriterien fehlen)? Ohne diese Antworten kein Umbau.
6. **Ausdrücklich NICHT:** großflächige Rewrites, Stack-Migration, Löschen vermutet-toten Codes, `sync` (kein `upstream`-Remote — `origin`+`main` zeigen auf dieses Repo), `update` (hartcodierter Fremdpfad), Dependency-Upgrades, Lockfile-Anpassungen.

## P2 — Architektur-Umbau (Phase D, nach Reparatur)
- **P2-D1 — Paket-Shape konsolidieren.** Sechs `settings.configure`-Kopien in EINE Quelle (gemeinsames Host-Modul oder generierter Abschnitt), `tooltipDelay`-Leiche klären, `narrative`/`key-router` Contracts auf denselben `Config`/`apply`-Standard heben. *Abhängig von:* P0 (Tests müssen laufen), P1-Einstiegsentscheidungen. *Risiko:* niedrig–mittel (Gate fängt Vertragsdrift, aber Client-Snapshots müssen neu verifiziert werden).
- **P2-D2 — Profil-Schichten vereinfachen.** `profiles/web` entweder löschen oder als dokumentiertes Minimalprofil einfrieren; `profiles/shinon/cordis.patch.yml` nach Domänen gruppieren (Modellroute / Task-Router / Index / UI-Branding) statt chronologisch. *Abhängig von:* P0 (Dump-Config muss laufen). *Risiko:* mittel (Schicht-Reihenfolge ist laufzeitrelevant).
- **P2-D3 — Client-Aktivierung härten.** `client-activation.test.mjs` in `gate:test` + CI verdrahten, `branding-check.mjs` als nächtlichen Browser-Job (nicht blockierend), `ctx.get?.()`-Regel als Gate-Plugin statt nur Test. *Abhängig von:* P0 (Cordis-Context + Chromium). *Risiko:* niedrig.
- **P2-D4 — Namenssystem einfrieren.** `SHINON_MIGRATION_MAP.md` als verbindlichen Referenzgraph ins Gate übernehmen (Änderungen nur mit Migrationsplan + Dump-Config-Beleg). *Abhängig von:* P1 (`bin/shinon`-Entscheidung). *Risiko:* niedrig.
