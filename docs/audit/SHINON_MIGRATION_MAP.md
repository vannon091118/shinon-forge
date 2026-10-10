# SHINON_MIGRATION_MAP — Referenzgraph (kein Rename durchgeführt)

> **Status:** current — Phase-A-Audit, lesend erhoben am 2026-10-10. **Stand:** 2026-10-10
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Ein `shinon`-Kommando als installierbare CLI **existiert nicht** (A-INV-03). Was existiert, ist ein Namens-*System* mit einer maßgeblichen Quelle je Name. Kein Search-and-Replace in Phase A.

| Name / Pfad | Maßgebliche Definition | Referenzen (nachgewiesen) | Laufzeitrelevanz | Migration / Risiko / Verifikation |
|---|---|---|---|---|
| Scope `@shinon` | Root-`package.json` `name: @shinon/forge` → `repo.mjs::expected()` leitet Scope ab | 19× `packages/*/package.json`, Patches, `client.js`-Loader-IDs, Profil-Bundles | Jede Abweichung = Gate rot | Ordner umbenennen + 4 Spiegel nachziehen; Risiko niedrig (Gate fängt Drift); Verifikation `node scripts/dsh-test.mjs` |
| Paketname `@shinon/<dir>` | Ordner `packages/<dir>/` (Single Source) | Manifest-`name`, Patch-`id shinon-<dir>`/`name`, Loader-`id`, ggf. Profil-Bundle | Aktivierung + Lade-ID | wie oben; Verifikation Gate + `pack-test` |
| Profil `shinon` | `package.json` `scripts.dev --profile shinon` (eine Quelle, `repo.mjs::activeProfile`) | `profiles/shinon/*`, `open.mjs`, `stages.mjs`, `desktop-launcher.mjs`, `dsh-profile-test.mjs` | Boot-Ziel | Umbenennung = dev-Script + Profilordner + alle Leser; Risiko mittel (vergessene Leser → Boot fail-closed); Verifikation `dsh --profile <neu> --dump-config` (BLOCKIERT ohne dsh) |
| `DSH_HOME` = Repo-Root | Konvention (Repo enthält `profiles/`) + `open.mjs`/`stages.mjs` setzen `env.DSH_HOME=ROOT` | alle Boot-Skripte, `dsh-profile-test.mjs` | Boot-Wurzel | keine Änderung empfohlen |
| `SHINON_API_KEY` (+ `AGNES_API_KEY`, `NVIDIA_API_KEY` …) | **Referenzname** in `profiles/shinon/cordis.patch.yml` (`apiKeyEnv`) — Secret aus Umgebung, nie Datei | `profiles/headless/cordis.patch.yml`, `docs/contracts/model-route.json` | Modellroute ohne Key = fail-closed MISSING_CREDENTIAL (beabsichtigt) | keine Änderung; Verifikation nur mit Key (BLOCKIERT) |
| `shinon` als Binary | **fehlt**: `bin/shinon.mjs` ohne `bin`-Feld | nichts verweist darauf | keine | Falls gewünscht: `bin`-Feld + Oclif/Commander-Einstieg NEU bauen (Phase C, eigene Entscheidung), nicht umbenennen |
| `.desktop`-ID `shinon-forge` | `scripts/desktop-launcher.mjs` (`APP_ID`, schreibt nach `$HOME/.local/share/applications/`) | `npm run desktop:launcher*` | Starter-Eintrag (schreibt AUSSERHALB des Repos!) | Änderung nur mit Einwilligung (Heimverzeichnis-Effekt); Verifikation `--help`/Dry-run, kein Install in Phase A |
| Reload-Helfer | 3 Dateien, kein Kanon | unbekannte Aufrufer | unbekannt | erst Kanon bestimmen (Phase B), dann 2 stilllegen — nicht raten |
| `dsh-mod` (Altname) | verboten in Runtime-Artefakten (Legacy-Guard) | 0 Treffer (A-LEG-01) | Guard rot bei Verstoß | keine Migration nötig |

Offene Produktentscheidung: Ob `shinon` je eine echte CLI, ein Mod-Paket-Name oder ein Spiel-Mod-Name sein soll, ist im Baum unbeantwortet — der Baum kennt nur DSH-Bundles + DSH-Profile.
