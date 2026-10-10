# VERIFICATION_MATRIX — Phase A (nur was LIEF, mit Exit-Code)

> **Status:** current — Phase-A-Audit, gemessen am 2026-10-10 in DIESER Umgebung (Node v18, kein dsh). **Stand:** 2026-10-10
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

| Aussage | Kommando (tatsächlich ausgeführt) | Ergebnis | Status |
|---|---|---|---|
| Namensvertrag/Manifest/Syntax/Legacy/Zwillinge/Profil-Struktur | `node scripts/dsh-test.mjs` | 98 bestanden, 0 fehlgeschlagen, Exit 0 | BESTÄTIGT |
| Regel-Fixtures (jede Regel macht Gate+Build rot) | `node scripts/validate-test.mjs` | 9/0, Exit 0 | BESTÄTIGT |
| Codemon-Kern (ohne DSH-Bausteine) | `npm run test:codingmon` | 29 pass, 0 fail, 3 SKIP (sichtbar: `Cannot find package '@deepseek-ai/schemastery'`) | TEILWEISE BESTÄTIGT (Kern ja, Store/Übergabe nein) |
| Gate-Logik gesamt | `npm run gate:test` (Exit echt 1, via Logdatei — Pipe nach `tail` schluckt ihn) | 150 pass, **7 Dateien rot**, 5 skipped, 162 total | WIDERLEGT (grün): rot sind `context-resolver`, `context-wiring`, `hook-pre-step`, `message-ingress`, `project-index`, `prompter-contract`, `task-router` — Ursache: fehlendes `schemastery` + `dsh muss im PATH liegen (dshRoot() ist null)` |
| Profil-Boot / Dump-Config | `node scripts/dsh-profile-test.mjs` | nicht lauffähig ohne `dsh` | BLOCKIERT |
| Distribution (`pnpm pack`→Isolat→Load) | `node scripts/pack-test.mjs` | nicht lauffähig (pnpm braucht Node ≥22, hier v18) | BLOCKIERT |
| Volle Kette `npm test` | — | bricht konstruktionsbedingt bei fehlendem dsh/pnpm | BLOCKIERT (in dieser Umgebung) |
| Build (`dist/`) | `node scripts/build.mjs` (durch Nutzer ausgeführt, 2026-10-10) | 19 Pakete, 96 Dateien, **907012 Bytes**, Exit 0 — 1718 Bytes mehr als `docs/ZAHLEN.md` §2 (905294), konsistent mit den 31 uncommittierten Worktree-Änderungen | BESTÄTIGT (Artefakt, nicht Regression) |
| Updater | `node scripts/dsh-update.mjs` (durch Nutzer ausgeführt) | meldet `0.2.0-rc.2`, „Keine Updates verfügbar" — aber `checkForUpdates` vergleicht gegen KEINE Quelle (`latest: current` hartcodiert, `scripts/dsh-update.mjs:36`); die Versionsnummer stammt aus hartcodiertem Fremdpfad (`~/.local/opt/node-v22.23.3-…`, ebd. Zeile 17). Die „kein Update"-Aussage ist daher KEIN Beleg | WIDERLEGT (als Update-Prüfung); TEILWEISE BESTÄTIGT (installierte Fassung 0.2.0-rc.2 ablesbar) |
| Starter/Boot (alt) | `node scripts/open.mjs` (durch Nutzer ausgeführt) | `dsh nicht im PATH`, Exit 1 — `open.mjs` sucht nur im PATH | BESTÄTIGT (Negativbefund, gilt nur für `open.mjs`) |
| Startdatei `--check` | `node scripts/start.mjs --check` (System-Node v18 → Selbstheilung auf v22.23.3) | startfähig, Exit 0: Node v22.23.3, dsh 0.2.0-rc.2 (via `node <shim>`, Shebang-Node v18 umgangen), Profil shinon, DSH_HOME=Repo-Root | BESTÄTIGT |
| Startkette echt | `node scripts/start.mjs --dump-config` | Config-Dump des `shinon`-Profils, Exit 0 | BESTÄTIGT |
| Profiltest | `node scripts/dsh-profile-test.mjs` (mit dsh-Verzeichnis im PATH) | 3 bestanden, 0 fehlgeschlagen (20 Layer, 14 Repo-Bundles), Exit 0 | BESTÄTIGT |
| Lebender Boot / Browser / Modellaufruf | `dsh --profile shinon`, Panel-Check, `SHINON_API_KEY`-Lauf | kein `dsh` im PATH (per `open.mjs`-Lauf erneut belegt), kein Chromium-Nachweis hier, kein Key | UNGEPRÜFT |
| Lokalisierung/QoL/Design-Vollständigkeit | Inventur sichtbarer Texte, Feature-Status, Designsystem | nicht systematisch erhoben (nur Stichproben: `{en,de}`-Diffs im Arbeitsbaum, `locale-de`-Paket existent) | UNGEPRÜFT |
| `docs/ZAHLEN.md`-Zusagen (§2: 76/0 pack, 300 gate, Panel 7/7 …) | — | stammen aus anderem Durchlauf (voller Install + dsh + Browser); hier NICHT reproduziert | UNGEPRÜFT (nicht widerlegt — andere Umgebung) |

Test-Forensik (Beweis statt Vertrauen): `dsh-test` prüft echte Produktionsdateien (kein Mock); `validate-test` beweist Guards per Mutation (kaputte Fixtures müssen rot werden); `codingmon`-Skips sind sichtbar benannt (kein stilles Grün); `client-activation.test.mjs` (untracked) adressiert genau die dokumentierte Loader-Falle (`ctx.locale` ohne `inject` → Proxy wirft), ist aber in KEINER Suite verdrahtet — seine 6 Zusagen gelten hier als UNGEPRÜFT. `gate:test`-Rot ist Umgebungs-Rot (fehlende Deps), kein Code-Rot — unterscheidbar, weil dieselben Dateien laut `docs/ZAHLEN.md` mit Install grün waren und `git diff` sie als unverändert zeigt.
