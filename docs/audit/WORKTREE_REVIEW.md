# WORKTREE_REVIEW — die Pfade des Commits `487c559`, inhaltlich bewertet

> **Status:** current — Phase-P-Nachweis (P3/„B5"), Auftrag aus `PLAN.md` Schritt 1.5. **Stand:** 2026-10-10
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

**Zweck:** `487c559` hat fremde Arbeitsbaum-Änderungen „gesichert". Gesichert ist nicht
geprüft. Dieses Dokument bewertet **jeden Pfad dieses Commits** inhaltlich, belegt jedes
Urteil und benennt die Folgen für die Phase-2-Schritte 2.1–2.4 (C2, C5, C6, C7) und 2.6.
Es ist die Inventur, auf der A5 („Ballast erst nach Inventur datenbasiert abbauen") aufsetzt.

**Regel dieses Durchgangs: lesend.** Keine Korrektur, kein Aufräumen, kein Revert; die
einzige angefasste Datei ist dieses Dokument. Gefundene ungewollte oder fragliche Änderungen
stehen als **Kandidaten** in §5, nicht als Reparatur. Jede Verhaltensaussage trägt einen
gemessenen Beleg oder heißt **UNGEPRÜFT**.

---

## 1. Der Commit und die Zahl „31"

| Größe | Wert | Befehl |
|---|---|---|
| Pfade im Commit | **43** | `git show --name-only --format='' 487c559 \| grep -c .` |
| davon geändert / neu / gelöscht | **32 / 10 / 1** | `git show --name-status --format='' 487c559` |
| Zeilen | **1890 Einfügungen, 129 Löschungen** | `git show --shortstat --format='' 487c559` |
| Betreff | „Arbeitsbaum sichern: Branding-Wachen, {en,de}-Meta, Startdatei" | `git show --no-patch --format=%s 487c559` |
| Lage | Vorfahre von `HEAD`, kein Merge | `git merge-base --is-ancestor 487c559 HEAD` |

**Warum „31" und „43" beide auftauchen:** Die 31 ist die Zahl, die der Audit **im
Arbeitsbaum** gezählt hat (`31 modifizierte Dateien + 2 untracked`, Selbstauskunft in
`docs/audit/REPOSITORY_INVENTORY.md` Zeile 10). Der Commit enthält **mehr** als diesen
Stand: die 7 neuen Audit-Dokumente, die 3 neuen Skripte (davon `scripts/start.mjs`
nachweislich **später** entstanden — das Inventar erwähnt es an keiner Stelle:
`git show 487c559:docs/audit/REPOSITORY_INVENTORY.md | grep -c start.mjs` → **0**), die
Löschung von `.freebuff/project-id` und eine Modifikation mehr als die Inventar-Zeile
nennt (32 statt 31). Das Inventar ist sich selbst gegenüber ungenau: es schreibt „6×
`packages/*/package.json`" und listet **8** Namen, „12× `packages/*/client.js`" gegen
**15** im Commit. Für alles Folgende gilt deshalb die **gegen den Commit gezählte** Zahl
**43**; die Plan-Zeile unter 1.5 nennt sie im `Nachweis` bereits richtig
(`PLAN.md`, Schritt 1.5).

**Aufteilung nach Rolle** (Summe **43**):

| Familie | Zahl | Pfade |
|---|---|---|
| Doku und Belege | 9 | `Docs/ZAHLEN.md`, `Docs/probes/brand-render.json`, 7× `docs/audit/*.md` |
| Projektdateien im Root | 2 | `README.md`, `package.json` |
| Client-Hälften (Bundles) | 15 | `packages/*/client.js` |
| Host-Hälften (`Config`-Beschreibungen) | 4 | `packages/{codingmon,core,markers,tooltip}/index.js` |
| Paket-Manifeste (`{en,de}`-Meta) | 8 | `packages/*/package.json` |
| Profilschicht | 1 | `profiles/web/…` (am 2026-10-11 archiviert nach `docs/archive/legacy-profiles/web/`) |
| Neue Skripte | 3 | `scripts/branding-check.mjs`, `scripts/gate/tests/client-activation.test.mjs`, `scripts/start.mjs` |
| Fremd-Werkzeug | 1 | `.freebuff/project-id` (gelöscht) |

## 2. Bewertungsmaßstab

- **gewollt** — beabsichtigt, belegt wirksam oder folgenlos, und keinem dokumentierten
  Planziel widersprechend.
- **fraglich** — beabsichtigt, aber mit offener Frage: Inkonsistenz, fehlende Verdrahtung,
  unbelegte Wirkung oder Schema-Drift. Kandidat in §5, Entscheidung in §6.
- **ungewollt** — widerspricht einem dokumentierten Ziel oder bricht etwas Messbares.
  In diesem Commit gibt es **keinen** solchen Fall (siehe §5, K1 ist der Grenzfall).
- **Beleg** — Datei mit Zeile oder ein im Durchgang ausgeführter Befehl. Ohne Beleg steht
  **UNGEPRÜFT**.

## 3. Alle 43 Pfade

Reihenfolge wie im Commit (alphabetisch). „Nur Kommentar" heißt gemessen: die einzige
hinzugefügte Zeile ist eine Kommentarzeile.

| # | Pfad | Was sich fachlich ändert | Urteil | Beleg |
|---|---|---|---|---|
| 1 | `.freebuff/project-id` | Die getrackte Freebuff-Projekt-ID (`49fcb88e-…`) verlässt die Versionierung | **gewollt** | Diff (`-49fcb88e-7b8e-412c-854d-4d4f1a25659b`); `.gitignore` ignoriert `.freebuff/` (fremde, nicht in diesem Commit enthaltene Änderung); `git ls-files .freebuff` → nur `settings.json` bleibt getrackt, Schritt 1.4 (B2) bleibt also nötig |
| 2 | `Docs/ZAHLEN.md` | Nachmessung in einem Baum **ohne** Install: Distribution 75/1 rot, Gate-Tests 150/7 rot, volle Kette bricht ab; neue Zeile `Build (dist/)`; §2.1/§3 wachsen um die Branding-Belege | **gewollt** | Diff; der neue Text nennt den Grund selbst („Testdateien byte-identisch mit HEAD"); heutiger Stand derselben Datei: 306/0, 76/0, `gate:full` 18/18 — die Zahlen dieses Commits sind **überholt**, die Aussage „Umgebungs-Rot, kein Code-Rot" bleibt richtig |
| 3 | `Docs/probes/brand-render.json` | Neues Feld `nachtrag`: das Zeichen ist neu gezeichnet, die Geometrie des Belegs gilt nicht mehr, `result` bleibt `BESTAETIGT` | **fraglich** | Diff; `grep -rl nachtrag docs/probes` → **1** Datei (kein Standardfeld); `docs/INDEX.md` §2 („Proben … werden nicht nachträglich aktuell gemacht, sondern neu gemessen"); `gate:full` grün (probe-twin duldet unbekannte Felder) |
| 4 | `README.md` | Eine Zeile für `npm start` in der Skript-Tabelle | **gewollt** | Diff; `package.json` `scripts.start` (§3 Nr. 12) |
| 5 | `docs/audit/ARCHITECTURE_MAP.md` | Neu: Architekturkarte des Bestands | **gewollt** | Datei; als Beleg zitiert in `docs/audit/REPAIR_PLAN.md` |
| 6 | `docs/audit/CHANGELOG.md` | Neu: Chronik des Audits | **gewollt** | Datei |
| 7 | `docs/audit/DEPENDENCY_FINDINGS.md` | Neu: Abhängigkeitsbefunde | **gewollt** | Datei |
| 8 | `docs/audit/REPAIR_PLAN.md` | Neu: priorisierter Reparaturplan; §P0 schützt die 31+2 und stellt **drei Eigentümer-Fragen** (`{en,de}`-Meta behalten? `profiles/web`-Diff Absicht? untracked Skripte verdrahten?), P2-D3 fordert die Verdrahtung der Client-Wachen | **gewollt** — und die Quelle dieses Reviews | Datei §P0, §P2-D3 |
| 9 | `docs/audit/REPOSITORY_INVENTORY.md` | Neu: Inventar; enthält die Zahl „31 + 2" und die (unpräzise) Aufzählung | **gewollt**, mit Zahlenschwäche | Datei Zeile 10; `grep -c start.mjs` → 0 (Skript fehlt in seiner Liste) |
| 10 | `docs/audit/SHINON_MIGRATION_MAP.md` | Neu: Referenzgraph | **gewollt** | Datei |
| 11 | `docs/audit/VERIFICATION_MATRIX.md` | Neu: was lief, mit Exit-Code | **gewollt** | Datei |
| 12 | `package.json` | `"start": "node scripts/start.mjs"` | **gewollt**, gemessen wirksam | Diff; `node scripts/start.mjs --check` → Exit 0 (§3 Nr. 43) |
| 13 | `packages/better-errors/client.js` | Registry-Label `Better Errors` → `Fehler besser` | **fraglich** | Diff; derselbe sichtbare Text steht **doppelt** (`packages/dashboard/client.js:71` und hier); die Manifest-Form lautet drittens `… - Bessere Fehler` → drei Schreibweisen, kein Gate prüft sie |
| 14 | `packages/better-errors/package.json` | `meta.title`/`meta.description`: String → `{en,de}` | **gewollt**, upstream-belegt | Formprüfung aller 8 Manifeste: `string/string → {en,de}/{en,de}`; `dsh-client-locale/lib/client.js` (`resolveText`: „Plain strings stay verbatim; maps do not consult registered dictionaries", Karte mit **`en`**-Schlüssel); `dsh-client-ui-plugin-manager/lib/client.js` (`packageText`/`rowText` rufen `resolveText(pkg.meta.title)`) |
| 15 | `packages/codingmon/client.js` | Besetzt **keinen** Marken-Slot mehr (behebt den Single-Slot-Konflikt), gibt `window.__codingmon.PetMark` weiter heraus, neuer Locale-Helfer + `t('menu.codingmon')` | **gewollt** (Slot), **fraglich** (Helfer-Kopie) | Diff; `node --test scripts/gate/tests/client-activation.test.mjs` → 6/6; `grep -rn PetMark` → nur diese Datei (kein Leser mehr im Baum → §5 K2) |
| 16 | `packages/codingmon/index.js` | Vier `Config`-Felder bekommen `.description(…)`; Defaults unverändert | **gewollt** | Diff (nur `.description` eingefügt); `gate:full` ✅ manifest/host-half |
| 17 | `packages/core/client.js` | Neue Marken-Geometrie (Ring + Funke + zwei Flügel), Alpha-Maske aus **demselben** `MARK`, Laufanzeige ersetzt DSHs Wal, Marken-Fallback wird ausgeblendet, Hintergrund wandert nach `shell.overlay`, `pointer-events`-Regel, `MarkGlyph` → `ForgeSigil` | **gewollt** | Diff; die drei Regressionen sind mit Browser-Messung in `docs/ZAHLEN.md` §2.1 belegt (Commit-Zeitpunkt); Alt-Namen `shinon-mark__body/__hair/__visor/__core` und `MarkGlyph` je **0** Treffer; statisch heute: Test 6/6. Wirkung im Browser in **diesem** Durchgang nicht nachgefahren (§7) |
| 18 | `packages/core/index.js` | Vier `Config`-Felder mit `.description(…)` | **gewollt** | Diff; Defaults unverändert; gehörte zu den sechs `settings.configure`-Aufrufern (2.1), Aufruf selbst unberührt |
| 19 | `packages/core/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 20 | `packages/dashboard/client.js` | Zwei Labels deutsch; Locale-Helfer + `t('menu.dashboard')` | **fraglich** | Diff; Labels **doppelt** gepflegt (dieses Array + `registry.set` der beiden Hälften); Helfer-Kopie (§5 K4). `ctx.get(name) : ctx[name]` in Zeile 437 blieb **unberührt** (Plan 2.6 will es weg) |
| 21 | `packages/events/client.js` | Eine Kommentarzeile (Label bewusst englisch) | **gewollt** | Diff; Nur-Kommentar-Messung: 1 Zeile, keine Codeänderung |
| 22 | `packages/events/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 23 | `packages/hook/client.js` | Kommentarzeile | **gewollt** | wie Nr. 21 |
| 24 | `packages/locale-de/client.js` | Wörterbuch ersetzt: 6 Schlüssel entfernt, 5 hinzugefügt | **gewollt**, mit Vorbehalt | Diff; jeder **entfernte** Schlüssel hat **0** Leser im Baum, jeder **neue** genau **einen** (die fünf Client-Hälften) — die Kommentarbehauptung ist damit messbar; aber die `en`- und die `de`-Hälfte sind **identisch** (gemessen) → die Tabelle trägt keine Übersetzung (§5 K6) |
| 25 | `packages/markers/client.js` | Locale-Helfer + `t('menu.markers')` | **fraglich** | Helfer-Kopie 2 von 5 (§5 K4); Diff |
| 26 | `packages/markers/index.js` | Sechs `Config`-Felder mit `.description(…)` | **gewollt** | Diff; Defaults unverändert |
| 27 | `packages/openapi/client.js` | Kommentarzeile | **gewollt** | wie Nr. 21 |
| 28 | `packages/persona/client.js` | Kommentarzeile | **gewollt** | wie Nr. 21 |
| 29 | `packages/popup/client.js` | Locale-Helfer + `t('menu.popup')`; `LABEL` bleibt Kennung für `announce()` | **fraglich** | Helfer-Kopie 3 von 5; Diff — zwei Quellen für dasselbe Label im **selben** File (§5 K4) |
| 30 | `packages/project-index/client.js` | Kommentarzeile | **gewollt** | wie Nr. 21 |
| 31 | `packages/project-index/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 32 | `packages/prompter/client.js` | Kommentarzeile | **gewollt** | wie Nr. 21 |
| 33 | `packages/prompter/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 34 | `packages/task-router/client.js` | Kommentarzeile | **gewollt** | wie Nr. 21 |
| 35 | `packages/task-router/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 36 | `packages/token-usage/client.js` | Locale-Helfer (`TOKEN_DE`), Fallback-Texte aus der Registry, Label `Token Usage` → `Token-Nutzung` | **fraglich** | Helfer-Kopie 4 von 5 (5 Dateien mit `ctx.get?.('locale')`, 4 mit `const MENU_DE`); Label doppelt (Nr. 20 + hier) |
| 37 | `packages/token-usage/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 38 | `packages/tooltip/index.js` | `tooltipDelay` mit `.description(…)` | **gewollt** | Diff; Default `300` unverändert |
| 39 | `packages/tooltip/package.json` | `{en,de}`-Meta | **gewollt** | wie Nr. 14 |
| 40 | `profiles/web/…cordis.patch.yml` (am 2026-10-11 nach `docs/archive/legacy-profiles/web/` archiviert) | `[]` → Insert `ui-settings-general` mit `config.welcomeNoticeVersion: 2026-09-28.1` | **gewollt** — der Wert ist übernommen, das Profil ist archiviert (E1, 2026-10-11) | Diff; **kein** Skript, Hook oder Workflow startet `profiles/web` (`dev:web` nutzt `--profile shinon`; `scripts/dsh-update.mjs` sagt ausdrücklich „nicht web"); Plan 2.2 (C5) will `profiles/web` **entfernen** → der Wert steht seit 2026-10-11 im GELADENEN Profil (`profiles/shinon/cordis.patch.yml`, Insert `ui-settings-general`), die vier Dateien des Altprofils liegen unter `docs/archive/legacy-profiles/web/`; Feldtyp laut DSH `z.string().volatile()` (`dsh-client-ui-settings-general/lib/index.js`); die YAML-Lesart von `2026-09-28.1` war in diesem Durchgang **UNGEPRÜFT** (§7) und ist seit 2026-10-11 im Dump gemessen (String, schemafest) |
| 41 | `scripts/branding-check.mjs` | Neu, 660 Zeilen: Chromium-Messharness der Branding-**Wirkung** (Spezifität, Sichtbarkeit, Click-through, Paintbarkeit) | **fraglich — unverdrahtet** | `grep -rn branding-check` → nur die Datei selbst und die Audit-Doku; **nicht ausgeführt** (dieser Durchgang ist lesend, das Skript legt `dist/.branding-check/` an) → Wirkung **UNGEPRÜFT**; Voraussetzung wäre erfüllt: `/usr/bin/google-chrome` und Playwright-Cache vorhanden |
| 42 | `scripts/gate/tests/client-activation.test.mjs` | Neu, 582 Zeilen: Aktivierungs- und Marken-Wache (statischer Scan ohne Abhängigkeiten + dynamischer Lauf im vm) | **gewollt**, gemessen wirksam | `node --test scripts/gate/tests/client-activation.test.mjs` → **6/6, Exit 0**; Verdrahtung: im Glob von `npm run gate:test` (`scripts/gate/tests/*.test.mjs`, 19 Dateien) und in `.github/workflows/commit-guard.yml` (`node --test scripts/gate/tests/*.test.mjs`), **nicht** in `scripts/gate/policy.json` (0 Treffer) und **nicht** in `npm test` → die Commit-Aussage „noch in keine Suite verdrahtet" ist damit **unpräzise** |
| 43 | `scripts/start.mjs` | Neu, 146 Zeilen: Startdatei mit Node-Heilung (≥ 22), **einer** dsh-Auflösung aus `scripts/lib/dsh.mjs`, `--check`-Modus | **gewollt**, gemessen wirksam | `node scripts/start.mjs --check` → **Exit 0**, findet `dsh 0.2.1-alpha.1` aus `node_modules` (ohne PATH-Eintrag) und Profil `shinon`; `package.json` `start`; README-Zeile |

**Summenprobe:** 9 + 2 + 15 + 4 + 8 + 1 + 3 + 1 = **43** (§1). Jede Zeile hat einen Beleg
oder trägt ausdrücklich **UNGEPRÜFT**.

## 4. Folgen je Phase-2-Schritt

### 2.1 (C2) Sechs `settings.configure`-Kopien auf eine Quelle
Der Commit ändert **keine** der sechs Kopien (7 Aufrufe in 6 Dateien, unverändert) — aber er
schafft eine **zweite Kopien-Familie**: denselben Locale-Helfer fünfmal in Client-Hälften
(`ctx.get?.('locale')` in `packages/{codingmon,dashboard,markers,popup,token-usage}/client.js`,
davon 4× wörtlich als `MENU_DE`). **Wichtig für die Planung:** 2.1 sieht ein gemeinsames
**Host**-Modul in `scripts/lib/` vor; das erreicht die Client-Hälften **nicht** — Client-Bundles
sind self-contained und ziehen React per `require`, nicht per `import`. Eine Deduplizierung
dort braucht eine andere Form (Fenster-Konvention wie `window.__mk`, Build-Zeit-Inline oder
die bewusste Entscheidung, die Kopien zu behalten). → **Entscheidung E4**.

### 2.2 (C5) `profiles/web` weg, Altdateien archivieren
Der Commit schreibt eine Konfiguration **genau in das Profil, das 2.2 entfernen will**
(Nr. 40). Das ist der einzige echte Zielkonflikt dieses Commits. Vor dem Archivieren ist zu
decidieren, ob der Wert `welcomeNoticeVersion: 2026-09-28.1` übernommen (dann gehört er in
ein **geladenes** Profil, also `profiles/shinon`) oder mit dem Archiv fallen gelassen wird.
→ **Entscheidung E1**.

**ERLEDIGT (2026-10-11):** Option (a) umgesetzt — der Wert steht als Insert
`ui-settings-general` in [profiles/shinon/cordis.patch.yml](../../profiles/shinon/cordis.patch.yml),
die vier Dateien des Altprofils liegen unter `docs/archive/legacy-profiles/web/`
(nicht gelöscht), `profiles/` führt nur noch `shinon` und `headless`.
Nachweis: [UMBAU_2026-10-11.md](UMBAU_2026-10-11.md) §4. Kein Bezug zu
denen aus 2.4: der Insert enthält keine `permission`- oder `approval`-Angabe.

### 2.3 (C6) Tote Verdrahtung entscheiden
Zwei neue Berührungspunkte, beide bewusst offen gelassen:
1. `window.__codingmon.PetMark` hat nach diesem Commit **keinen Leser** im Baum mehr — der
   Kommentar erklärt die Naht für Fremd-Nutzer, das ist eine Zusage ohne Abnehmer.
   → **Entscheidung E2**.
2. `scripts/branding-check.mjs` ist der **einzige** Wirkungs-Messer für die
   Browser-Fragen der Overlay-Arbeit und hängt an keiner Suite (Nr. 41). Der Reparaturplan
   schlägt den nicht-blockierenden Nachtjob vor (`docs/audit/REPAIR_PLAN.md` §P2-D3).
   → **Entscheidung E3**.

### 2.4 (C7) Defaults entschärfen
Der Commit berührt **keine** Defaults und keine Sicherheitskonfiguration. Gemessen:
`git show --format='' 487c559 | grep -ciE 'permission|approval|dsh-experimental'` → **1**,
und der Treffer steht in `docs/audit/ARCHITECTURE_MAP.md` als Beschreibungstext
(„4× `dsh-experimental-*`"), nicht in einer Config. 2.4 bleibt unberührt und unerledigt;
`permission.defaultPreset` und `task-router activate` sind unverändert. Der einzige
default-artige Wert des Commits liegt in einem **nicht geladenen** Profil (Nr. 40).

### 2.6 (F-l/F-m) Locale-Fallback und `ctx[name]`-Zugriff
Der Commit **nimmt 2.6 zum größten Teil vorweg**: fünf Hälften lesen jetzt
`ctx.get?.('locale')` — genau die Prüfung, die 2.6 verlangt —, und
`scripts/gate/tests/client-activation.test.mjs` ist der geforderte Gate-Test. Offen bleiben:
1. 2.6 verlangt „im Testeinstieg verdrahtet"; der Test läuft nur über den Glob von
   `gate:test` und in CI, **nicht** in `scripts/gate/policy.json` und **nicht** in `npm test`
   (Nr. 42).
2. `ctx.get(name) : ctx[name]` in `packages/dashboard/client.js:437` ist unberührt (der
   `ctx[name]`-Zweig liegt in einem `try/catch`, wirft also nicht nach außen).
3. „Keine doppelte Sprachtabelle" ist **nicht** erreicht: die `en`- und die `de`-Hälfte des
   Wörterbuchs sind identisch (Nr. 24) → **Entscheidung E6**.

### Randfolgen
- **3.7 (D7, Build-/Gate-Ballast):** `branding-check.mjs` gehört in die Inventur; ein
  Verwerfen wäre der Verlust des einzigen Wirkungs-Messers (Nr. 41).
- **3.2 / 3.5 (Vendor, pnpm-Reste):** nicht berührt.
- **Dokumentationsordnung:** dieses Dokument ist **nicht** in `docs/INDEX.md` eingetragen —
  in diesem Durchgang darf keine weitere Datei angefasst werden. Die Registrierung ist ein
  eigener Schritt (Entscheidung E7).

## 5. Kandidaten (nicht behoben — Auswahl für spätere Schritte)

| Kennung | Kandidat | Belege | Wohin |
|---|---|---|---|
| K1 | `profiles/web`-Insert: Konfiguration in einem Profil, das niemand startet und das 2.2 entfernen will | Nr. 40 | 2.2 (E1) — **behoben 2026-10-11**: Wert nach `profiles/shinon` übernommen, Altprofil archiviert |
| K2 | `window.__codingmon.PetMark`: öffentliche Naht ohne Leser | Nr. 15 | 2.3 (E2) — **behoben 2026-10-11**: gestrichen |
| K3 | `branding-check.mjs` unverdrahtet | Nr. 41 | 2.3/3.7 (E3) — **behoben 2026-10-11**: `npm run branding` + `gate --full --branding`, erster Lauf 28/0 grün |
| K4 | Fünf Kopien desselben Locale-Helfers (+ 4× `MENU_DE`), zwei davon mit zweiter Label-Quelle im selben File | Nr. 15, 20, 25, 29, 36 | 2.1 erweitern (E4) |
| K5 | Anzeigename dreifach: `registry.set` der Hälfte, `dashboard`-Array, Manifest-`meta` | Nr. 13, 20, 36 | 2.6/E4 |
| K6 | `en`- und `de`-Wörterbuch identisch — der Sprachenwechsel zeigt keine Wirkung | Nr. 24 | 2.6 (E6) — **behoben 2026-10-11**: EINE Tabelle, die beide Slots bekommt |
| K7 | Probe um ein Nicht-Standardfeld `nachtrag` ergänzt statt neu gemessen | Nr. 3 | A5/3.7 (E5) — **behoben 2026-10-11**: Feld standardisiert (`{date, scope, note}`), vom Gate geprüft |
| K8 | Audit-Inventar zählt „31 + 2", „6×"-Manifeste und „12×"-Hälften gegen 32/8/15 im Commit | §1 | Plan-Text 1.5 (erledigt im `Nachweis`) |

**Kein Pfad wurde als „ungewollt" eingestuft** — der Zielkonflikt K1 ist der Grenzfall, er
verletzt kein bestehendes Verhalten, sondern eine spätere Planabsicht.

## 6. Entscheidungen — **alle am 2026-10-11 entschieden**

**Alle sieben Fragen sind entschieden** (Umsetzung und Belege:
[UMBAU_2026-10-11.md](UMBAU_2026-10-11.md) §4). Die letzte Spalte nennt die getroffene
Wahl; die Optionen bleiben als Beschreibung der Frage stehen.

| Kennung | Frage | Optionen | Entschieden |
|---|---|---|---|
| E1 | `profiles/web/…` (heute `docs/archive/legacy-profiles/web/cordis.patch.yml`): Wert `welcomeNoticeVersion` übernehmen oder mit dem Profil fallen lassen? | (a) beim Archivieren in `profiles/shinon` übernehmen, (b) fallen lassen, (c) bis 2.2 unverändert stehen lassen | **(a)** — übernommen, Altprofil archiviert |
| E2 | `window.__codingmon.PetMark`: Naht anschließen oder streichen? | (a) anschließen (eine sichtbare Fläche benennt sie), (b) streichen, (c) als dokumentierte Fremd-Schnittstelle behalten | **(b)** — gestrichen (kein Leser im Baum) |
| E3 | `scripts/branding-check.mjs`: verdrahten oder verwerfen? | (a) als nicht-blockierender Nachtjob, (b) in `gate:full` hinter ein Flag, (c) verwerfen (Verlust des Wirkungs-Messers) | **(b)** — `--branding`-Stufe plus `npm run branding`, sonst sichtbarer Skip; erster Lauf 28/0 grün |
| E4 | Deduplizierung der **Client**-Kopien: welche Form? | (a) Fenster-Konvention wie `window.__mk`, (b) Build-Zeit-Inline über `scripts/`, (c) Kopien bewusst behalten und im Gate gegen Drift prüfen — **umgesetzt in Schritt 2.1 (2026-10-10)**: eine Quelle in `scripts/lib/plugin-idioms.mjs` + generierte Blöcke + Drift-Gate, also (c) mit einer Ableitung statt Handpflege; (a) und (b) erwiesen sich als nicht nötig, (b) zusätzlich als unnötig (gemessen: das Tarball enthält kein `scripts/`). Nachweis: `docs/audit/PLUGIN_IDIOME_2-1.md` | **(c)** — eine Quelle plus generierte Blöcke (2.1, 2026-10-10) |
| E5 | Probe: `nachtrag` als Feld zulassen oder die Probe neu messen? | (a) Feld standardisieren (Datum + Geltungsbereich), (b) Probe nach `docs/probes/` neu schreiben, (c) Feld entfernen und die Geometrie-Aussage streichen | **(a)** — `{date, scope, note}`, vom Gate geprüft |
| E6 | `en`/`de`-Wörterbuch: dürfen die Hälften identisch sein? | (a) `de` mit echter Übersetzung füllen, (b) auf eine Sprachentabelle reduzieren, (c) so lassen (Menünamen sind Eigennamen) | **(b)** — eine Tabelle für beide Slots (die Schlüssel sind Eigennamen) |
| E7 | Dieses Dokument in `docs/INDEX.md` registrieren? | (a) ja, im nächsten Schreib-Schritt, (b) nein, bis der Doku-Schnitt (3.10/D9) läuft | **(a)** — registriert; die elf `docs/audit/`-Dokumente und `PLAN.md` ebenfalls |

## 7. UNGEPRÜFT in diesem Durchgang

- **Wirkung von `packages/core/client.js` im Browser** (Nr. 17): belegt ist die statische
  Wache (6/6) und die Messung **zum Commit-Zeitpunkt** in `docs/ZAHLEN.md` §2.1; in diesem
  Durchgang lief kein Browser.
- **`scripts/branding-check.mjs` wurde nicht ausgeführt** (Nr. 41) — dieser Durchgang ist
  lesend, das Skript legt `dist/.branding-check/` an. Seine Zusagen (Spezifitätsduell,
  Click-through, Paintbarkeit) sind damit **nicht** nachgemessen.
  **Nachgetragen 2026-10-11 (E3):** es ist verdrahtet und läuft — erster Lauf überhaupt:
  **28 bestanden, 0 fehlgeschlagen**, Exit 0, echtes Chromium am ausgelieferten Bundle
  (`npm run branding`, `node scripts/gate/engine.mjs --full --branding`).
- **`profiles/web` lädt nicht**: es lief kein `dsh --profile web` (kein `dsh` im PATH). Ob
  DSH den Insert überhaupt akzeptiert und ob YAML `2026-09-28.1` als String ankommt
  (`z.string().volatile()`), ist **offen**.
  **Nachgetragen 2026-10-11 (E1):** im GELADENEN Profil gemessen —
  `DSH_HOME=$PWD dsh --profile shinon --dump-config` (Exit 0) führt
  `ui-settings-general: welcomeNoticeVersion: 2026-09-28.1`; der Wert kommt als String an,
  das Schema akzeptiert ihn. `profiles/web` selbst bleibt ungeladen (archiviert). Der Repo-eigene Patch-Slice (`gate:full`
  `✅ patch`) prüft die Datei nur gegen die Repo-Regeln.
- **Distributionstest und Profiltest** (`pack-test`, `dsh-profile-test`) wurden in diesem
  Zuschnitt nicht gefahren; ihre Zahlen stammen aus `docs/ZAHLEN.md` §2 (anderer Durchgang).
- **`meta`-Objekte**: die Form ist upstream-belegt (Nr. 14); nicht gemessen ist, ob
  `resolveText` einen **fehlenden** `en`-Schlüssel strangfrei behandelt — alle 8 Manifeste
  tragen `en`, die Frage stellt sich hier also nicht, der Vertrag verlangt ihn aber.
- Ob `--dump-config` die neu hinzugefügten `Config`-Beschreibungen (Nr. 16, 18, 26, 38)
  ausgibt, ist **nicht** gemessen.
- **Zähl-Nebenwirkung dieses Dokuments:** der Prüfbefehl aus `docs/INDEX.md` §4 zählt die
  Verweise aller Markdown-Dateien; dieses Dokument liegt selbst unter `docs/` und erhöht die
  Zahl. Die Zeile „Verweise in Markdown, die nicht auflösen" in `docs/ZAHLEN.md` §1 nennt
  `388` (Stand **vor** diesem Dokument), derselbe Befehl meldet mit ihm **465**, `defekt 0`.
  Die Zahl wurde hier **nicht** nachgezogen: dieser Durchgang darf keine zweite Datei
  ändern; sie gehört in den nächsten Schreib-Schritt (Entscheidung E7).

## 8. Belege (Befehle dieses Durchgangs)

```bash
# Zahl und Zuschnitt
git show --name-status --format='' 487c559 | awk '{print $1}' | sort | uniq -c
git show --shortstat --format='' 487c559
git show --numstat --format='' 487c559 | sort -k1 -rn

# Wo die „31" herkommt
git show 487c559:docs/audit/REPOSITORY_INVENTORY.md | sed -n '10,16p'
git show 487c559:docs/audit/REPOSITORY_INVENTORY.md | grep -c 'start\.mjs'

# Leser der Locale-Schlüssel
for k in brand.title brand.tagline settings.brandName settings.primaryColor \
         settings.sidebarCompact banner.active; do
  grep -rn --exclude-dir=node_modules --exclude-dir=dist -F "$k" . | wc -l      # je 0
done

# Manifest-Form aller 8 Manifeste des Commits: vorher string, nachher {en,de}
git show --name-only --format='' 487c559 | grep -E '^packages/.*/package.json$' | while read -r f; do
  printf '%s ' "$f"
  git show "487c559^:$f" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).meta;process.stdout.write("vorher="+[typeof m.title,typeof m.description].join("/")+" ")})'
  git show "487c559:$f"  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).meta;console.log("nachher="+[Object.keys(m.title).join(","),Object.keys(m.description).join(",")].join("/"))})'
  done
# dsh-client-locale/lib/client.js  resolveText(text): "Plain strings stay verbatim;
#                                    maps do not consult registered dictionaries."
# dsh-client-ui-plugin-manager/lib/client.js  packageText()/rowText() -> resolveText(pkg.meta.title)

# Tote Verdrahtung
grep -rn --exclude-dir=node_modules --exclude-dir=dist 'branding-check' .
grep -c 'client-activation' scripts/gate/policy.json          # 0
ls scripts/gate/tests/*.test.mjs | wc -l                      # 19 (Glob von gate:test)
sed -n '30,60p' .github/workflows/commit-guard.yml            # CI fährt den Glob

# Gemessene Wirkung
node scripts/start.mjs --check                                # Exit 0
node --test scripts/gate/tests/client-activation.test.mjs     # 6/6, Exit 0

# Keine Sicherheits-Defaults berührt
git show --format='' 487c559 | grep -ciE 'permission|approval|dsh-experimental'   # 1 (Doku)
```

**Abnahme dieses Nachweises:** die Tabelle in §3 deckt **jeden** der 43 Pfade des Commits
(eine Zeile je Pfad, Summenprobe gegen §1), jede Einstufung trägt eine Begründung, die
ungemessenen Punkte stehen in §7, und die offenen Fragen sind in §6 ausdrücklich als
Entscheidung des Users geführt. Kein Pfad außer diesem Dokument wurde in diesem Durchgang
verändert; kein Commit, kein Push, `main` unangetastet.
