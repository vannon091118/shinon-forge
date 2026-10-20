# CI-UND-GATES — Prüfungen, Hooks, Workflows

> **Status:** current · **Stand:** 2026-10-20
>
> Erzählt, **wie** geprüft wird. **Was** in einem Durchlauf herauskam
> (Exit-Codes, Zählungen, rote Befunde) steht ausschließlich in
> [`ZAHLEN.md`](ZAHLEN.md) §2/§3. Commit-Regeln selbst:
> [`COMMIT-REGELN.md`](COMMIT-REGELN.md).

## 1. Die Gate-Engine

`scripts/gate/engine.mjs` lädt Plugins aus `scripts/gate/plugins/` und
entscheidet anhand von `scripts/gate/policy.json`, welche Plugins laufen.
Jedes Plugin meldet `pass` / `not-applicable` / `fail`; Exit 1 bei Issues.

| Modus | Befehl | Wann |
|---|---|---|
| **SLICE** (Default) | `npm run gate` | nur Plugins, deren Slice-Trigger auf die geänderten Dateien zutrifft |
| **LOCAL** | `npm run gate:local` | feste lokale Menge (Hook-Lauf) |
| **FULL / RELEASE** | `npm run gate:full` | alle Gates |
| einzelner Gate | `npm run gate -- --only <id>` | gezielt |
| Typecheck | `npm run typecheck` | `--only typescript` |

### policy.json — was wann läuft

- **`always`** (jeder Lauf): `bundle-resolution`, `manifest`, `contract`,
  `patch`, `host-half`, `client-half`, `legacy-guard`, `profile`,
  `typescript`, `dsh-singleton`.
- **`local`** (Hook): `bundle-resolution`, `contract`, `legacy-guard`,
  `dsh-singleton`.
- **`slices`** (Präfix-/Contains-Match auf geänderte Pfade):
  `package-drift`, `duplicate-plugin`, `dead-package`, `registry`,
  `contracts`, `doctor`, `probe-twin`, `persona`, `narrative`,
  `events-spine`, `scoring`, `markers`, `commit-trailer`.

### Die Plugins in einem Satz

| Plugin | Prüft |
|---|---|
| `manifest` | `package.json`-Exporte und `dsh`-Metadaten |
| `contract` | Namensvertrag in vier Richtungen (Name, Paket, Profil, Datei) |
| `patch` | `cordis.patch.yml` gegen das Schema |
| `host-half` / `client-half` | Syntax + generierte Idiome der beiden Pakethälften |
| `legacy-guard` | kein `dsh-mod` (Fremdcode-Patching bleibt verboten) |
| `profile` | nur existierende Pakete im Profil |
| `dsh-singleton` | eine DSH-Kopie je Paket |
| `bundle-resolution` | jedes Profil-Bundle löst auf |
| `package-drift` | Paket-Quelle und Profil-Kopie auseinandergelaufen? |
| `duplicate-plugin` | kein Plugin doppelt registriert |
| `dead-package` | inaktive Pakete tragen `dsh.inactive`, aktive stehen im Profil |
| `registry` | Namens-Registry ([`contracts/canon.json`](contracts/canon.json)) gegen den Baum |
| `contracts` | Vertragsdateien in 7-Punkt-Form |
| `contracts`-Ziel `probe-twin` | Proben: Form + Zieldateien existieren |
| `doctor` | Repo-Drift-Scanner (gleiche Familie wie `scripts/doctor.mjs`) |
| `persona`, `narrative`, `events-spine`, `scoring`, `markers` | die gleichnamigen Verträge gegen die Pakete (inkl. Fixture-Replay) |
| `commit-trailer` | Trailer-Regeln ([`contracts/commit-trailer.json`](contracts/commit-trailer.json)) |
| `typescript` | `tsc` über den Baum |

## 2. Statische Gates (eigene Skripte)

Diese laufen zusätzlich zur Engine und sind die Abnahme des Baums:

| Befehl | Prüft |
|---|---|
| `node scripts/shinon-test.mjs` | Manifest, Namensvertrag, `index.js`/`client.js`/`cordis.patch.yml`, Legacy-Guard, Quell-Zwillings-Drift, Profil, Kanon, Struktur (Klassen, Grenzen, Bestand) — auch via `npm test` |
| `node scripts/validate-test.mjs` | Regel-Fixtures: jede Regel muss Gate **und** Build rot werden (ein stillschweigend grüner Prüfer ist kein Prüfer) |
| `node scripts/pack-test.mjs` | Distribution je Paket: `npm pack` → entpacken → isoliert installieren → laden |
| `node scripts/shinon-profile-test.mjs` | Profiltest: `dsh --profile shinon --dump-config`, alle Layer (`--profile mobile` für das Mobile-Profil) |
| `npm run scale:check` | Skalierung: Kopie des Baums + `--plugins N` Klon-Pakete durch die ganze Kette — eigener Lauf, weder `test` noch `test:full` |
| `npm run zahlen:check` | [`ZAHLEN.md`](ZAHLEN.md) §1 stimmt mit dem Baum überein (auch im `pre-commit`-Hook) |
| `npm run idioms:check` | generierte Idiome gegen ihre Quelle |
| `npm run branding:check` | Brand-Marken im Baum (`--branding` der Engine ruft dasselbe Skript) |
| `npm run notes:check` | Zettel in `generated-skills/` gegen `packages/prompter/assets/note-rules.json` (fail-closed in beide Richtungen) |

Das **Tagebuch** wird mitgeprüft: `scripts/lib/diary.mjs` (`diaryIssues()`)
prüft bei jedem Gate/Build, dass Kapitel an existierende Commits und Pfade
gebunden sind.

## 3. Testpfade

```bash
npm test        # Alltag: statisches Gate + lokale Engine-Slices (Sekunden), stoppt beim ersten Fehler
npm run test:full   # CI-Kette: Package-Units → Gate → Fixtures → Distribution → Profil
```

Drei Ebenen:

1. **Package-Units** — `node:test` in `packages/*/test/`, bündelbar über
   `npm run test:codingmon`, `test:scoring`, `test:token`, `test:prompter`,
   `test:narrative`, `test:popup`, `test:key-router`, `test:traceability`,
   `test:hook`.
2. **Gate-Tests** — `scripts/gate/tests/` (`npm run gate:test`): reine
   Gate-/Lib-Logik, kein DSH nötig; braucht Node ≥ 22 und das Repo-`dsh`
   zuerst im PATH.
3. **Distribution & E2E** — `pack-test`, Profil-Tests,
   `mobile-profile-contract-test`; dazu `scripts/e2e/`
   (`probe` liest Beweise aus Index-/Ledger-SQLite, `report` ordnet sie,
   `mutate` setzt eine Inkonsistenz und erwartet fail-closed).

## 4. Git-Hooks

Einmal pro Klon: `npm run hooks:install` (`scripts/install-hooks.mjs`).

| Hook | Aktion |
|---|---|
| `pre-commit` | `zahlen:check` + `npm test` |
| `commit-msg` | `commit-guard.mjs --file` (fail-closed) |
| `prepare-commit-msg` | `commit-guard.mjs --fix` — tauscht KI-Footer gegen den Vannon-Trailer |

## 5. GitHub-Workflows

### `commit-guard.yml` — „Shinon Forge Gate"

Läuft bei **jedem Push, jedem PR** und auf Zuruf. Zehn parallele Zweige plus
ein `verdict`-Zweig:

1. `node scripts/commit-guard.mjs --ci` (Trailer/Footer-Regeln)
2. Unit-Matrix (acht Pakete, ohne Install)
3. Gate-Tests (`scripts/gate/tests/`)
4. `shinon-test.mjs` + `check-dsh-versions.mjs`
5. Fixtures (`validate-test.mjs`)
6. Distribution (`pack-test.mjs`)
7. Profilboot (`shinon-profile-test.mjs`)
8. Prompter-Tests
9. `npm run typecheck`
10. `npm test` (Schnellpfad)

Alle Install-Zweige: `npm ci`, danach `node_modules/.bin` via
`$GITHUB_PATH`. **`verdict` ist rot bei `failure`, `cancelled` und
`skipped`** — ein stillschweigend übersprungener Zweig zählt als Bruch.

### `mobile-profile.yml`

PRs auf `main` + Zuruf: `mobile-profile-contract-test.mjs` +
`shinon-profile-test.mjs --profile mobile`.

### `release.yml` (S5)

Nur Tags `v*`: Tag = `package.json`-Version, `npm ci`,
`profile-links --check`, statisches Gate, `gate:test`, dann ein
**reproduzierbares** `git archive`-Tarball mit SHA-256 (Zweitlauf muss
identisch sein) als Artefakt. **Publiziert nichts** (`contents: read`).

### `runtime-release.yml`

Nur `workflow_dispatch` (Input `skip_release`): Mobile-Gate, dann
ARM64-Runtime: Debian-Rootfs-Struktur + Node 22.19.0-arm64 + Repo +
node_modules → deterministischer `zstd`-Tarball + SHA-256; optional
GitHub-Release `runtime-<sha7>` und Auto-Bump von `SHINON_FORGE_PIN` /
`RUNTIME_SHA256` in `Shinon_Agent/SetupActivity.kt` (braucht
`SHINON_AGENT_TOKEN`, `contents: write`).

## 6. Commit-Regeln und ihre Durchsetzung

Drei Regeln (Quelle: `scripts/lib/commit-policy*.mjs`, Erzählung:
[`COMMIT-REGELN.md`](COMMIT-REGELN.md)): Vannon-Trailer, kein KI-Footer,
Begrenzung auf ~150 Wörter mit Datenbeleg. Durchsetzung an drei Stellen:
lokaler Hook (`prepare-commit-msg` korrigiert, `commit-msg` verweigert),
CI (`commit-guard --ci`), Gate (`commit-trailer` auf Slice-Trigger).
