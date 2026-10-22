# SCRIPTS — Nachschlagewerk zu `scripts/` und `bin/`

> **Status:** current · **Stand:** 2026-10-22
>
> Erzählt, was jedes Skript tut und ob ein npm-Script darauf zeigt. Den Einstieg
> und Quellklon-Weg beschreibt das [`../README.md`](../README.md) und
> [`SETUP.md`](SETUP.md); die Prüflogik steht in [`CI-UND-GATES.md`](CI-UND-GATES.md).
> Pfade und Laufzeiten-Namen entstehen **einmal** in `scripts/lib/paths.mjs`.

## Einstieg und Boot

| Skript | npm-Script | Zweck |
|---|---|---|
| `bin/shinon.mjs` | `start`, `dev`, `dev:web`, `bin`-Feld | **der** Einstieg: Node heilen (engines + `node:sqlite`-Rauchtest), DSH auflösen (Repo-Installat → vendor → PATH, Herkunft nennen), DSH_HOME seeden, spawn mit Signalweiterleitung. `shinon doctor` → `scripts/doctor.mjs`; `--check` nur Diagnose. Der Serverstart selbst liegt in DSH |
| `start.mjs` | — | Kompatibilitäts-Entrypoint; importiert dieselbe Umsetzung wie `bin/shinon.mjs` |
| `open.mjs` | `open`, `dev:mobile` | vorhandene Instanz öffnen; Startstufen/Ready-Zeile (nachvollziehbar via `npm run stages`) |
| `doctor.mjs` | via `bin/shinon.mjs doctor` | read-only Diagnose, Codes 0/1/2, Schlüssel nur als Anwesenheit |
| `stages.mjs` | `stages` | Startstufen des Boots nachvollziehen |

## Build, Links, Idiome

| Skript | npm-Script | Zweck |
|---|---|---|
| `build.mjs` | `build` | regeneriert `dist/` (Manifest, Profil, Paketkopien) |
| `profile-links.mjs` | `profile:links` | setzt/prüft die `link:`-Bundles der Profile (idempotent; Fremdpfade Exit 2) |
| `remote-worktree.mjs` | `worktree` | erstellt, listet und entfernt Task-Worktrees außerhalb des Klons; Remove ohne `--force` |
| `sync-idioms.mjs` | `idioms`, `idioms:check` | generiert geteilte Idiome; `--check` ohne Schreiben |
| `branding-check.mjs` | `branding` | Brand-Marken im Baum; die Engine ruft es bei `--branding` |
| `vendor-dsh.mjs` | — | aktualisiert `vendor/dsh/` aus dem Registry-Tarball (inkl. `MANIFEST.json`) |
| `assets/build-sprites.mjs` | — | Grid → SVG-Sprites (Codingmon) |
| `appimage-build.mjs` | `appimage` | AppImage-Hülle aus derselben Nutzlast wie das `.deb`; braucht `appimagetool`, CI-Job `appimage` |
| `assets/build-codingmon.mjs` | — | kopiert die Katalogdaten aus `packages/codingmon/assets/data/codingmon-50.json` in die Datenregionen von `client.js` (`--write`); `--check` vergleicht und bricht bei Drift ab, geprüft von `packages/codingmon/test/katalog.test.mjs` |

## Prüfung und Gates

| Skript | npm-Script | Zweck |
|---|---|---|
| `gate/engine.mjs` | `gate`, `gate:local`, `gate:full`, `typecheck` | modulare Gate-Engine (SLICE/LOCAL/FULL, `--only`, `--branding`) |
| `gate/policy.mjs` | — | liest `gate/policy.json` (Triggersystem: always/local/slices) |
| `gate/tests/*.test.mjs` | `gate:test` | reine Gate-/Lib-Logik, kein DSH nötig |
| `shinon-test.mjs` | in `test`, CI | statisches Gate: Manifest, Namensvertrag, Rollendateien, Legacy-Guard, Drift, Profil, Kanon, Struktur |
| `validate-test.mjs` | in `test:full`, CI | Regel-Fixtures: jede Regel muss Gate **und** Build rot werden |
| `pack-test.mjs` | in `test:full`, CI | Distribution je Paket: pack → entpacken → isoliert installieren → laden |
| `shinon-profile-test.mjs` | in `test:full`, CI | Profiltest `--dump-config` (`--profile mobile` möglich) |
| `mobile-profile-contract-test.mjs` | `test:mobile-profile` | Vertragstest des Mobile-Profils |
| `panel-check.mjs` | `verify:panel` | Panel-Beleg über die Web-UI (braucht jsdom) |
| `scale-check.mjs` | `scale:check` | Skalierung: Baumkopie + `--plugins N` Klon-Pakete durch die ganze Kette |
| `commit-guard.mjs` | `commit:guard`, `commit:check-file` | Commit-Regeln (`--ci`, `--last n`, `--range`, `--all`, `--file`, `--fix`) |
| `install-hooks.mjs` | `hooks:install` | legt die drei Git-Hooks aus `.githooks/` |
| `notes-check.mjs` | `notes:check` | Zettel in `generated-skills/` gegen `prompter/assets/note-rules.json` (fail-closed) |
| `preflight-docs.mjs` | `preflight:docs`, `preflight:docs:check` | prüft reale Linkziele und den vollständigen GitHub-Jobgraphen; lokal sichere Reparatur, CI read-only |
| `preflight-verdict.mjs` | GitHub Actions | reines Abschlussurteil plus JSON-/Summary-Bericht mit Commit, Run-ID, Jobstatus und Fehlercodes |


| `check-dsh-versions.mjs` | `check:dsh-versions` | `package.json`-Pin gegen `dsh-target-versions.json` |
| `run-with-node.mjs` | — | Wrapper: führt Befehle mit der geheilten Node-Fassung |

## Messung und Sonden (→ `docs/probes/`)

| Skript | npm-Script | Zweck |
|---|---|---|
| `perf-baseline.mjs` | `perf:baseline` | P50/P95-Baseline mit Fingerabdruck → `docs/probes/perf-baseline.json` |
| `index-warm-measure.mjs` | `index:warm` | warme Index-Messung |
| `index-cold-cost.mjs` | `index:cold-cost` | kalte Index-Kosten → Probe |
| `index-match-eq.mjs` | `index:match-eq` | Äquivalenz der Index-Matching-Pfade |
| `index-scan-cost.mjs` | — | Scan-Kosten (ohne npm-Verweis) |
| `store-cost.mjs` | — | Kosten des Stores |
| `sync-zahlen.mjs` | `zahlen:sync`, `zahlen:check` | schreibt/prüft §1 der [`ZAHLEN.md`](ZAHLEN.md) aus dem Baum |
| `s6-turn.mjs` | `s6:check`, `s6:boot`, `s6:stop` | Turn-Audit S6 (Boot/Check/Stop) → Proben |

| `spike-resolved-profile.mjs` | — | Spike PLAN 3.3/D3: Profil außerhalb `$DSH_HOME/profiles` laden (Vorbedingung für 3.6) |

## Installation und Betrieb

| Skript | npm-Script | Zweck |
|---|---|---|
| `install-user.mjs` | `install:user`, `uninstall:user`, `verify:install` | Nutzer-Installation: `install`/`update`/`rollback`/`status`/`history`/`auto`/`units`/`selftest`/`uninstall`; `--purge`, `--keep-checkout` |
| `backup-retention.mjs` | `backup:retention` | Aufbewahrung des Sicherungsordners (`--keep`, `--max-age`, `--dry-run`, `--json`) |
| `desktop-launcher.mjs` | `desktop:launcher` | Desktop-Starter (Konzept, ROADMAP §2.3); `--uninstall` |
| `dsh-update.mjs` | `update` | **DSH-Upstream**-Update ins kanonische Profil; offline UNGEPRÜFT statt „keine Updates" |
| `deb-build.mjs` | `deb` | `.deb`-Bau (Mint/Ubuntu) aus der gemeinsamen Nutzlast: Code + Prod-Abhängigkeiten aus dem Lockfile + mitgelieferte Node-Laufzeit. `postinst` installiert **nichts** nach; das Paket zwingt **kein** System-Node. Braucht `dpkg-deb`. |
| `win-build.mjs` | `win` | Windows-ZIP aus derselben Nutzlast: `shinon.cmd` (portabel), `install.ps1` (kopieren, PATH, Startmenü), `uninstall.ps1`. **Nur auf einem Windows-Bauhost** — sonst trägt das Archiv Linux-Binärdateien und ist nicht lauffähig (`--force` nur zum Prüfen der Form). |

## Bibliotheken (nur importiert)

`lib/` — kein Script für sich; Träger der Namen und Regeln:

- **Pfade/Repo:** `paths`, `repo`, `yaml`, `structure`, `canon`, `diary` (Tagebuch-Prüfung `diaryIssues()`), `source-scan`
- **Pakete:** `payload` (die Nutzlast: Code, Prod-Abhängigkeiten, mitgelieferte Node-Laufzeit, relative Bundle-Links), `huelle` (die Texte der beiden Verpackungshüllen: Debian `control`/`postinst`/Menüeintrag/PATH-Starter, Windows `install.ps1`/`uninstall.ps1`), `runtime` (die EINE Node-Auflösung: `engines.node` → Untergrenze → Archivname → Prüfsumme)
- **Boot:** `runtime` (Node-Heilung), `dsh` (Auflösung), `dsh-home`, `dsh-versions`, `port`
- **Regeln:** `model-route` (Routen-Formprüfung), `plugin-idioms`, `commit-text`, `commit-policy`, `commit-policy-file`, `ci-range`, `preflight/diagnostics`, `preflight/documentation`, `preflight/fixes`, `preflight/policy`
- **Sonstiges:** `perf-stats`, `secrets` (Tresor-Disziplin der Nutzer-Installation)

## E2E (`scripts/e2e/`, kein npm-Script)

| Skript | Zweck |
|---|---|
| `probe.mjs` | liest Beweise aus Index-/Ledger-SQLite |
| `report.mjs` | ordnet sie (AUS / SICHTBAR / SPUR / WIRKUNG) |
| `mutate.mjs` | setzt gezielt **eine** Inkonsistenz und erwartet fail-closed |
