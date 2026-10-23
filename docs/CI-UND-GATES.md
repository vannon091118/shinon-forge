# CI-UND-GATES — Prüfungen, Hooks, Workflows

> **Status:** current · **Stand:** 2026-10-22
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

### policy.json — was wann läuft

- **`always`** (jeder Lauf): `bundle-resolution`, `manifest`, `contract`,
  `patch`, `host-half`, `client-half`, `legacy-guard`, `profile`,
  `dsh-singleton`.
- **`local`** (Hook): `bundle-resolution`, `contract`, `legacy-guard`,
  `dsh-singleton`.
- **`slices`** (Präfix-/Contains-Match auf geänderte Pfade):
  `package-drift`, `duplicate-plugin`, `dead-package`, `registry`,
  `contracts`, `doctor`, `probe-twin`, `persona`, `narrative`,
  `events-spine`, `scoring`, `markers`, `canon`, `schemastery-enum`,
  `package-checklist`, `commit-trailer`.

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
| `registry` | Bundles: `dsh.bundle.patch` existiert und jedes Profil-Bundle ist in `packages/*` registriert (nicht der Kanon — den prüfen `canon` und das statische Gate) |
| `canon` | der Kanon (`scripts/lib/canon.mjs`): ein Name, eine Schreibweise, eine Definition — dieselbe Quelle wie das statische Gate |
| `schemastery-enum` | kein `z.enum(` in `packages/*/index.js` (das deklarierte Schemastery hat keins; Kommentare und `assets/*.js` mit `zod` zählen nicht) |
| `package-checklist` | die vier Pflichten eines Pakets: Dateien, Struktur-Klasse, Profil-Eintrag oder `dsh.inactive`, Fähigkeit mit `owner` |
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
2. **Gate-Tests** — `scripts/gate/tests/`, zwei fail-closed Bahnen:
   `npm run gate:test` (fast, 20 s je Test) und `npm run gate:test:slow`
   (CI-Tier, echte SQLite/DSH, 600 s). `npm run gate:test:all` fährt beide;
   die Zuordnung steht in `scripts/gate/test-lanes.json` und eine Datei ohne
   Bahn ist Exit 2. Der Runner wertet TAP selbst aus: `cancelled` ist rot.
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
| `pre-push` | Marker, `zahlen:check`, `gate:local`, Paket-Vollständigkeit — **ohne** die schweren Ketten |

## 5. GitHub-Workflows

### `commit-guard.yml` — „Shinon Forge Gate"

Läuft bei **Push auf main, jedem PR und auf Zuruf**. Feature-Branch-Pushes
lösen keinen zweiten vollständigen Lauf zusätzlich zum PR aus. Neue PR-Commits
brechen überholte PR-Läufe ab; der Lauf auf `main` wird nicht abgebrochen.

Die Prüfjobs laufen parallel, soweit sie unabhängig sind. `preflight-docs` ist
der günstige, installationsfreie Gatekeeper: fehlerhafte Doku oder Workflow-
Verdrahtung blockiert die Installations-/Build-Jobs. Der finale Verdict-Job
wartet auf alle 14 Pflichtjobs.

1. Commit-Wächter (`node scripts/commit-guard.mjs --ci`)
2. Unit-Matrix (acht Paket-Suiten, ohne `npm ci`)
3. Dokumentations-/Workflow-Preflight (aktive Befehle, echte Links, Jobgraph)
4. Gate-Tests (beide Bahnen) plus installierte Codemon-Übergabe
5. Gate-Engine `--full` (alle 26 Plugins, fail-closed)
6. Fixtures gegen den realen Bau
7. Distribution: Packen, isoliert installieren und laden
8. Profilboot
9. Prompter-Tests
10. Schnellpfad (`npm run test:core`) plus DSH-Versionsvertrag, `npm run build` und `npm run zahlen:check`
11. Dependency-Audit direkt aus `package-lock.json`
12. CodeQL für JavaScript/TypeScript
13. Gitleaks über die vollständige Git-Historie

Das frühere separate `static-gate` ist entfernt: `test:core` enthält das
statische Gate bereits. Der CI-Schnellpfad verwendet `test:core`, nicht erneut
`npm test`, damit der lokale Reparatur-Preflight nicht ein zweites Mal läuft.
Der Dependency-Audit installiert keine zweite Kopie der Abhängigkeiten: `npm
audit --omit=dev --audit-level=high` wertet den Lockfile direkt aus. Die
installationspflichtigen Tests nutzen weiterhin lockfile-treues `npm ci`.

Der Finaljob heißt **`Preflight-Abnahme (fail-closed)`**. Er läuft mit
`if: always()` und scheitert bei `failure`, `cancelled`, `skipped`, unbekanntem
Status oder fehlendem Pflichtjob. Jobs, die wegen eines fehlgeschlagenen
Dokumentations-Preflights nicht gestartet wurden, werden als blockiert erklärt,
aber niemals als erfolgreiche Abnahme gezählt.

### Preflight-Vertrag und Fehlercodes

Lokaler Reparatur-First-Einstieg:

```bash
npm test
```

`npm test` führt zuerst `preflight-docs.mjs` mit sicheren Reparaturen aus und
delegiert dann an den bestehenden Kernpfad. Reparatur ohne Tests:
`npm run preflight:docs`. Read-only-Prüfung: `npm run preflight:docs:check`.
Fault-Injection-Tests: `npm run preflight:test` und der Gate-Tests-Job.

`scripts/lib/preflight/policy.mjs` ist die gemeinsame Policy-Quelle für
Pflichtdateien, Pflichtjobs und Diagnosepräfixe. Der Prüfer validiert aktive
YAML-Befehle und Actions, echte relative Linkziele und den tatsächlichen Jobgraphen.
Er prüft außerdem, dass jede deklarierte Prüflinie im finalen Verdict landet und
dass install-/scanintensive Jobs direkt `needs: preflight-docs` haben.
Kommentierte Beispiele, Echo-Strings oder reine Jobnamen erfüllen keinen
Ausführungsvertrag. Absichtliche Mutationen beweisen, dass Dummy-Kommandos und
fehlende Gate-Abhängigkeiten rot werden.

Lokal korrigiert der Preflight nur eindeutige Verdrahtungsfehler. Er erfindet
keine fehlenden Jobs und überschreibt keine fachliche `if`-Bedingung. CI bleibt
schreibgeschützt und bricht vor `npm ci`, Build oder Security-Scan ab.

Die Dokumentationsprüfung liefert beispielsweise `PREFLIGHT_DOC_MISSING`,
`PREFLIGHT_LINK_BROKEN`, `PREFLIGHT_LINK_ESCAPES_REPO`,
`PREFLIGHT_JOB_DEFINITION_MISSING`, `PREFLIGHT_JOB_NOT_GATED_BY_PREFLIGHT`,
`PREFLIGHT_JOB_BYPASSES_PREFLIGHT`, `PREFLIGHT_NEEDS_UNKNOWN_JOB` und
`PREFLIGHT_VERDICT_FAIL_OPEN`. Ausführungsfehler werden jobbezogen gemeldet,
etwa `PREFLIGHT_CODEQL_ACTION_MISSING`,
`PREFLIGHT_DEPENDENCY_AUDIT_COMMAND_MISSING` oder
`PREFLIGHT_SECRET_SCAN_ACTION_MISSING`.

Jeder Lauf erzeugt `preflight-report.json` mit Commit-SHA, Run-ID, Run-Link,
jedem Pflichtjob und Diagnosecodes. Das Artefakt wird auch nach einem
fehlgeschlagenen Urteil hochgeladen; die Zusammenfassung steht in GitHub Actions
unter **Summary**. Nur `verdict: PASS` mit erfolgreichen Pflichtjobs ist
eine Abnahme. Es ist keine automatische Release-Freigabe und kein Beleg für einen
echten Provider-Modellturn.

### `mobile-profile.yml`

Aktuell nur `workflow_dispatch`: Mobile/Android ist zurückgestellt und kein
Pflicht-Gate für Desktop-/Web-PRs. Beim manuellen Lauf prüfen
`mobile-profile-contract-test.mjs` und `shinon-profile-test.mjs --profile mobile`.

### `release.yml` (S5)

Nur Tags `v*`: Tag = `package.json`-Version, `npm ci`,
`profile-links --check`, statisches Gate, `gate:test`, dann ein
**reproduzierbares** `git archive`-Tarball mit SHA-256 (Zweitlauf muss
identisch sein) als Artefakt. **Publiziert nichts** (`contents: read`).

### `package-build.yml`

Bei Push auf `main`, Tag `v*` oder manuellem Start: baut .deb, AppImage und
Windows-ZIP auf passenden Runnern, prueft Inhalte, Installation/Starter und
Pruefsummen und lädt die Ergebnisse als Artefakte hoch. Dies ist ein eigener
Paketbau, nicht der abschliessende PR-Preflight.

### `security.yml` (periodisch)

Woechentlicher und manueller Sicherheitsscan: Production dependency audit,
CodeQL und Gitleaks. Die gleichartigen Security-Prüfungen für PR/Push laufen
verbindlich als Jobs im `commit-guard.yml` und werden in dessen finale
Preflight-Abnahme eingespeist. Die periodische Fassung ist ein zusätzlicher
Sicherheitslauf, kein Ersatz für die PR-Abnahme.

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
