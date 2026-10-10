# PLAN: Shinon Forge Umbau

> **Status:** plan — Umsetzungsplan für den Umbau zum eigenständigen Produkt. **Stand:** 2026-10-11
> (Fortschritt: 1.3, 1.4, 2.1–2.6, 3.1 und 3.11 sind im Arbeitsbaum erledigt — Nachweise je Schritt
> bzw. `docs/audit/UMBAU_2026-10-11.md` §7 und `docs/audit/DSH_SUBSET_3-1.md`)
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

**Stand:** 2026-10-10 · **Basis-Commit:** `91c7e4f` (`main`) · **Arbeitskopie:** `/home/vannon/Dokumente/Projekte/Shinon-forge` ·
**Ersteller:** Auftrag Vannon, Umsetzung im Agent-Lauf · **Scope:** Linux Mint x64 · **Paketmanager:** npm (kein pnpm)

**Abweichung zum Briefing:** Das Briefing nennt `c0e274f` als Basis. Gemessen ist der
Stand `91c7e4f` (drei Commits weiter). Nachweis: `docs/audit/STAND_2026-10-10.md` §1.

**Harte Regeln während der Umsetzung:** keine Commits, keine Pushes, keine
Branch-Löschung; `main` wird nicht beschrieben; Arbeit auf `umbau/<schritt>`;
Änderungen nur in dieser Arbeitskopie; Secrets nur über Umgebungsvariablen; keine
Erfolgsmeldung ohne Exit-Code und Zählung.

---

## Offene Entscheidungen

| ID | Frage | Status | Blockiert |
|---|---|---|---|
| A1 | pnpm entfernen statt lauffähig machen | **ENTSCHIEDEN** — entfernen; genau die sechs getrackten pnpm-Dateien löschen, pnpm-Aufrufe in Skripten durch npm ersetzen | — |
| A2 | DSH-Version | **ENTSCHIEDEN** — `0.2.1-alpha.2` als Basis. Upstream-Diff: `ui-theme` geändert, `ui-brand-official` byte-identisch, `locale` im geprüften Teil unverändert (`docs/audit/UPSTREAM_DIFF.md`) | — |
| A3 | MVP-UI | **ENTSCHIEDEN** — Overlay aus Theme-Tokens, Marken-Slots und `locale-de`; Fork der Web-UI nur bei belegter Lücke | — |
| A4 | Inaktive Pakete | **ENTSCHIEDEN** — `key-router`, `narrative`, `popup` aktivieren; `shinon-forge` bewerten; `openapi` bleibt inaktiv, seine Rolle wandert als Provider-Funktion in `key-router` | — |
| A5 | Gate-Umfang | **ENTSCHIEDEN** — kritische Gates behalten, Ballast erst nach Inventur datenbasiert abbauen | — |
| A6 | Commit-Regel (Vannon-Trailer vs. Agent-Attribution) | **OFFEN** | jede Commit-Aktion — bis dahin wird **nicht** committet |
| A7 | Fertig-Definitionen | **ENTSCHIEDEN** — K1 (Locale aus `locale-de`), K2 (QoL Top 10), K3 (Design aus Token-Datei) | — |
| A8 | Modelle | **ENTSCHIEDEN** — Standard/Baseline `agnes-2.5-flash` über `AGNES_API_KEY`; lokale App-Ausführung genügt, lokale Inferenz ist keine MVP-Pflicht | — |
| A9 | Benchmark-Aufgaben | **ENTSCHIEDEN** — synthetisches Set in `benchmarks/`, keine fremden Repos/Daten | — |
| A10 | Desktop-Strategie | **OFFEN bis Messung** — Electron vs. Tauri vs. TUI; Tauri ist Spike-Kandidat, nicht festgelegt | 5.1–5.3, 8.x |
| A11 | Icons | **ENTSCHIEDEN** — eigene Icons erstellen | — |
| A12 | Copyright-Inhaber | **ENTSCHIEDEN** — `Copyright (c) 2026 Vannon`; DSH-/Drittanbieterhinweise unverändert separat | — |
| A13 | Marker-Vertrag | **ENTSCHIEDEN** — Shinon definiert den Vertrag selbst; Brutalord ist ein anderes Projekt und **nicht** normativ | — |
| B1 | `Docs/` vs. `docs/` | **ENTSCHIEDEN** — ein Ordner `docs/`; Zielliste (52 Pfade) in `docs/audit/STAND_2026-10-10.md` §6.1 | **ausgeführt** (2026-10-10) — `docs/audit/STAND_2026-10-10.md` §9 |
| B2 | `.freebuff/` | **ENTSCHIEDEN** — `.freebuff/settings.json` aus dem Tracking lösen, lokal behalten; `.freebuff/` bleibt ignoriert | — |
| C7 | Defaults | **ENTSCHIEDEN** — sichere Defaults: `workspace-write` / `approval: ask`; Task-Router bis H5 deaktiviert | — |

**Stoppbedingung vor Phase 1:** `.credentials.yaml` liegt außerhalb der Arbeitskopie.
**Erfüllt** (gemessen: `CREDENTIALS_PRESENT=no`, `docs/audit/STAND_2026-10-10.md` §2).
Während der Umsetzung gilt sie fort: taucht ein Schlüssel im Arbeitsbaum auf, wird
gestoppt und gemeldet, nicht repariert.

---

## Schritte

### P1 Ist-Stand verifizieren
- **Ziel:** Zustand der Arbeitskopie belegen, auf dem Phase 1 aufsetzt.
- **Schritte:** Branch/HEAD, Arbeitsbaum, Node/npm, `dsh`, `schemastery`, pnpm-Reste, Case-Fold-Bestand messen.
- **Abnahme:** Alle Werte mit ausgeführtem Befehl; Nicht-Gemessenes als UNGEPRÜFT markiert.
- **Nachweis:** `docs/audit/STAND_2026-10-10.md` (Branch `umbau/phase-p`, HEAD `91c7e4f`, Node v18.19.1 im PATH, Node v22.23.3/v24.21.0 lokal, dsh lokal `0.2.1-alpha.1`, schemastery 3.18.4 auflösbar, sechs pnpm-Dateien, 52 + 7 Dokumentpfade).
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** —
- **Status:** **erledigt** (2026-10-10)

### P2 Upstream-Diff an den Andockstellen
- **Ziel:** alpha.1 gegen alpha.2 nur dort vergleichen, wo das Overlay andockt.
- **Schritte:** `ui-theme`, `locale`, `ui-brand-official` je Tag abrufen, `sha`/`size` vergleichen; Slot-Definitionen und die drei offenen Punkte benennen.
- **Abnahme:** Ergebnis als Dateiliste mit Verdikt je Position; die drei offenen Punkte ausdrücklich als OFFEN.
- **Nachweis:** `docs/audit/UPSTREAM_DIFF.md` (`ui-theme/src` geändert: `boot-theme.ts` 2446→3183 B, `index.ts` 1805→2753 B, `theme-settings.ts` 2133→7391 B; `ui-brand-official/src` vollständig geprüft und byte-identisch; `FontFamilyRow.*`/`FontSettingsGroup.*` in alpha.2 neu).
- **Risiko:** mittel / mittel — abgeschnittene Abrufe, deshalb Teilaussagen als UNGEPRÜFT geführt.
- **Abhängig von:** —
- **Status:** **erledigt** (2026-10-10), drei Punkte OFFEN

### P3 PLAN.md
- **Ziel:** dieser Plan nach dem Schema aus Abschnitt 9 des Briefings.
- **Schritte:** Entscheidungen mit Status, Schritte mit Abnahme und Nachweis, Risiken, Restunsicherheit.
- **Abnahme:** jede Entscheidung aus A1–A13/B1/B2/C7 trägt einen Status; kein Schritt ohne Abnahme und Nachweis.
- **Nachweis:** `PLAN.md` (diese Datei).
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** P1, P2
- **Status:** **erledigt** (2026-10-11) — der Plan ist freigegeben und die Schritte 1.4, 2.2–2.6 und 3.11 sind ausgeführt; jeder trägt seinen Status und seinen Nachweis (`docs/audit/UMBAU_2026-10-11.md`)

### 1.1 (B3) Node ≥ 22 für die Läufe
- **Ziel:** Läufe unter Node ≥ 22 ausführen, ohne das System umzubauen.
- **Schritte:** `~/.local/opt/node-v22.23.3-linux-x64/bin/node` bzw. `~/.nvm/versions/node/v24.21.0/bin/node` für die Testläufe verwenden; `scripts/lib/dsh.mjs` löst das bereits über `goodNode()`.
- **Abnahme:** `node -v` im Lauf zeigt v22 oder höher; `node:sqlite`-Import schlägt nicht fehl.
- **Nachweis:** Ausgabe von `node --version` im Laufprotokoll.
- **Risiko:** niedrig / mittel (falsche Fassung misst falsch).
- **Abhängig von:** —
- **Status:** offen

### 1.2 (B4) `schemastery` auflösbar, keine Versionsmischung
- **Ziel:** eine Fassung für Root und Build verwenden.
- **Schritte:** Root-Pin `~3.18.4` gegen den später zu vendorenden Stand `3.18.0` abgleichen; Entscheidung erst mit 3.2, dann ggf. Pin anpassen.
- **Abnahme:** `npm run gate:test` läuft ohne Umgebungsfehler durch.
- **Nachweis:** Exit-Code und Zählung von `npm run gate:test`.
- **Risiko:** mittel / hoch (Versionsmischung bricht zur Laufzeit, nicht im Test).
- **Abhängig von:** 3.2 (Vendor-Stand)
- **Status:** offen — Auflösbarkeit im Root ist bereits belegt (`STAND` §4)

### 1.3 (B1) `Docs/` nach `docs/` migrieren
- **Ziel:** ein Dokumentationsordner; Case-Fold-Kollision beseitigen.
- **Schritte:** die 52 Pfade aus `STAND` §6.1 verschieben; **alle** Dateien mit `Docs/`-Referenz mitziehen (gemessen: 68 Dateien mit inhaltlichem Zug, 34 davon außerhalb der Doku); die nicht auflösbaren Ziele aus `STAND` §6.4 ausdrücklich behandeln — `Docs/WORKFLOW.md` bleibt als Pfad des Quell-Repos großgeschrieben, das `docs/research/`-Zitat wird als fehlendes Ziel markiert statt stillschweigend auf einen toten Pfad umgebogen; die kleingeschriebenen Upstream-Verweise aus `STAND` §6.5 **nicht** anfassen.
- **Abnahme:** Prüfbefehl aus `docs/INDEX.md` §4 meldet `defekt 0`; `find . -maxdepth 1 -type d -iname docs` liefert genau einen Eintrag.
- **Nachweis:** Ausgabe des Prüfbefehls mit `geprüft <n>, defekt 0`.
- **Risiko:** hoch / mittel (Verschieben bricht Tests und Gate-Pfade — siehe `scripts/gate/policy.json`, `scripts/gate/plugins/*`, `packages/*/client.js`).
- **Abhängig von:** P1 (Zielliste)
- **Status:** **erledigt im Arbeitsbaum** (2026-10-10) — Prüfbefehl aus `docs/INDEX.md` §4: `geprüft 388, defekt 0` (Exit 0); genau ein `docs`-Ordner; kein Inhalt umgeschrieben. `gate:full` → **Exit 0**, 18 Gates, 0 rot (der zuvor rote `probe-twin`-Befund ist vertragskonform hergestellt: `result: "UNKLAR"` statt `"OFFEN"`, Vokabular unverändert, `docs/ZAHLEN.md` §3 Nr. 4). Nicht committet (A6 offen), `main` unangetastet.

### 1.4 (B2) `.freebuff/settings.json` aus dem Tracking lösen
- **Ziel:** lokale Tool-Konfiguration nicht mehr versionieren, lokal behalten.
- **Schritte:** `git rm --cached .freebuff/settings.json`; Datei auf der Platte unverändert lassen; `.gitignore`-Eintrag `.freebuff/` bleibt.
- **Abnahme:** `git ls-files -- .freebuff` ist leer; die Datei existiert lokal weiter.
- **Nachweis:** Ausgabe beider Befehle.
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** —
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `git ls-files -- .freebuff` ist leer, `ls .freebuff/settings.json` findet die Datei weiter (lokal, ignoriert); Beleg: `docs/audit/UMBAU_2026-10-11.md` §4

### 1.5 (B5) Commit `487c559` bewerten
- **Ziel:** die 31 gesicherten Änderungen inhaltlich prüfen („gesichert" ist nicht „geprüft").
- **Schritte:** Diff je Datei lesen, gewollt/ungewollt bewerten, Risiken benennen.
- **Abnahme:** Tabelle mit Datei, Bewertung und Begründung, ohne Datei zu ändern.
- **Nachweis:** `docs/audit/WORKTREE_REVIEW.md` (`git show --stat 487c559` → 43 Dateien, 1890 Einfügungen, 129 Löschungen).
- **Risiko:** mittel / mittel.
- **Abhängig von:** —
- **Status:** offen

### 1.6 (C1) `*.tgz` — entfällt
- **Ziel:** Build-Artefakte aus `packages/` entfernen.
- **Abnahme:** entfällt, weil nicht getrackt.
- **Nachweis:** `git ls-files` enthält keine `.tgz`; die im Audit genannte Datei ist nicht versioniert.
- **Status:** **entfällt**

### 2.1 (C2) Sechs `settings.configure`-Kopien auf eine Quelle
- **Ziel:** ein Verhalten, eine Quelle statt sechs Kopien.
- **Schritte:** Ein gemeinsames Host-Modul, das die Pakete **importieren**, ist technisch ausgeschlossen (gemessen: `pnpm pack` legt nur `package.json`/`index.js`/`client.js`/`cordis.patch.yml`/Ressourcen ins Tarball — 0 Treffer für `scripts/`; eine Client-Hälfte ist ein self-contained Bundle). Stattdessen EINE Quelle `scripts/lib/plugin-idioms.mjs` + markierte Ableitung + Drift-Gate — und die zweite Kopien-Familie aus 1.5 (fünf Locale-Helfer) im selben Zug: Host `core`, `dashboard`, `tooltip`, `better-errors`, `token-usage`, `openapi`; Client `codingmon`, `dashboard`, `markers`, `popup`, `token-usage`.
- **Abnahme:** erfüllt — `npm run gate:full` Exit 0 (18/18, Zahl unverändert), `dsh-test` 99/0, `npm run idioms:check` Exit 0; Code der elf Dateien zeichengenau unverändert (2626 Codezeilen, nur Kommentarzeilen dazu), Registrierung 6/6 vorher = nachher.
- **Nachweis:** [docs/audit/PLUGIN_IDIOME_2-1.md](docs/audit/PLUGIN_IDIOME_2-1.md) — §2 Paketgrenze (Tarball-Liste), §4 Mutationsprobe (verfälschte Zeile → `idioms:check`/`dsh-test`/`gate:full` rot, zurückgespielt → grün), §5 Verhaltensgleichheit, §7 Läufe; Diff der elf Aufrufer; Zahl der Kopien in `docs/ZAHLEN.md` §1 (12 Blöcke / 11 Dateien / 0 handgepflegt).
- **Risiko:** niedrig / mittel.
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-10), nicht committet (A6 offen), `main` unangetastet

### 2.2 (C5) `profiles/web` weg, Altdateien archivieren
- **Ziel:** Altbestand aus dem Ladepfad nehmen, ohne Beweise zu zerstören.
- **Schritte:** die 13 getrackten Profil-Altdateien nach `docs/archive/legacy-profiles/` **verschieben**; nichts löschen außer den sechs pnpm-Dateien (A1).
- **Abnahme:** `profiles/` enthält nur noch `shinon` und `headless` in der Zielstruktur; Archivpfade existieren.
- **Nachweis:** `git status --short` und `ls docs/archive/legacy-profiles/`.
- **Risiko:** mittel / mittel (Ladeordnung der Profilschichten ist laufzeitrelevant).
- **Abhängig von:** 3.6 (Code-Konfiguration), A1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — die vier Dateien des Altprofils liegen unter `docs/archive/legacy-profiles/web/` (nichts gelöscht), `git ls-files profiles` nennt nur noch `shinon` und `headless`, und der einzige wirksame Wert (`welcomeNoticeVersion`, E1) steht im GELADENEN Profil (`--dump-config` Exit 0). A1 (pnpm-Rückbau) bleibt offen und ist damit nicht Teil dieses Schritts. Beleg: `docs/audit/UMBAU_2026-10-11.md` §4

### 2.3 (C6) Tote Verdrahtung entscheiden
- **Ziel:** je Befund anschließen oder streichen, nicht beides halb.
- **Schritte:** `markers`-Host-Spiegel, `codingmon`-Client-Absender, `hook`-Trace-Kanal (`TRACE_CHANNEL`), `task-router`-`MICRO_STATE_SERVICE`, `project-index`-Index je einzeln entscheiden.
- **Abnahme:** je Befund eine Entscheidung mit Begründung; Gate nach jeder Änderung grün.
- **Nachweis:** `node scripts/dsh-test.mjs` je Änderung plus Entscheidungsliste.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — vier der fünf Befunde haben einen gemessenen Leser (prompter liest `shinon_index_query`; die Probe `hook-pre-step` liest `TRACE_CHANNEL`; `task-router.test.mjs` liest `shinon_goal_micro_state`; `uebergabe.test.mjs` mountet den codingmon-Beitrag), der fünfte ist GEBAUT statt gestrichen: `markers` schickt seine wirksamen Grenzen über `webserver/index-inject` als `window.__DSH_MARKERS_CONFIG__` in die Seite, der Client liest sie (fremder Vertrag wird verworfen). Belege: Entscheidungsliste und Naht in `docs/audit/UMBAU_2026-10-11.md` §2/§3; `node --test scripts/gate/tests/markers.test.mjs` 27/27; `dsh-test` 99/0; `gate:full` 18/18 (Exit 0)

### 2.4 (C7) Defaults entschärfen
- **Ziel:** keine stillen Vollzugriffe.
- **Schritte:** `permission.defaultPreset` auf `workspace-write` mit `approval: ask`; `task-router` `activate: false` bis H5; die vier `dsh-experimental-*`-Bundles einzeln bewerten.
- **Abnahme:** Profil lädt mit den neuen Defaults; `--dump-config` zeigt sie.
- **Nachweis:** `dsh --profile shinon --dump-config` (mit Node ≥ 22) — derzeit **UNGEPRÜFT**, weil kein `dsh` im PATH (siehe Restunsicherheit).
- **Risiko:** niedrig / hoch (Sicherheitswirkung).
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `DSH_HOME=$PWD dsh --profile shinon --dump-config` (Exit 0, Repo-`dsh` 0.2.1-alpha.1 zuerst im PATH) zeigt `shinon-task-router.activate: false` und `permission.defaultPreset: workspace-write` samt Preset `workspace-write: {sandbox: workspace-write, approval: ask}`; `node scripts/dsh-profile-test.mjs` 3/0 (19 Layer, 14 Repo-Bundles — Stand direkt nach 2.4; der Endstand nach 3.1 steht im Status von 3.1: **18**). Von den vier `dsh-experimental-*`-Bundles wurde **eines** entfernt (`schedule-bundle`: nicht installiert, nicht im Lock, kein `# == `-Kopf im Dump — die Ebene konnte sich nicht auflösen), die drei übrigen bleiben der Entscheidung aus 3.1 überlassen. Beleg: `docs/audit/UMBAU_2026-10-11.md` §4

### 2.5 (C8) `agent-default-model` angleichen
- **Ziel:** Kommentar und Config dürfen sich nicht widersprechen.
- **Schritte:** Kommentarblock (`cordis.patch.yml` 89–93) auf die wirksame Route `agnes/agnes-2.5-flash` ziehen.
- **Abnahme:** Kommentar nennt dieselbe Route wie die Config.
- **Nachweis:** Diff der Datei; `grep -n 'agent-default-model' -A4`.
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** —
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — Kommentar und Config nennen dieselbe Route `agnes/agnes-2.5-flash`; gemessen im Dump: `agent-default-model: provider: agnes, model: agnes-2.5-flash` (`--dump-config`, Exit 0). Beleg: `docs/audit/UMBAU_2026-10-11.md` §4

### 2.6 (F-l/F-m) Locale-Fallback und `ctx[name]`-Zugriff
- **Ziel:** kein werfender Dienstzugriff, keine doppelte Sprachtabelle.
- **Schritte:** die fünf Client-Hälften auf `ctx.get?.('locale')` prüfen; `dashboard/client.js:437` (`ctx[name]`) beseitigen; Gate-Test gegen hartkodierte Texte anlegen.
- **Abnahme:** Gate-Test grün und im Testeinstieg verdrahtet.
- **Nachweis:** Testlauf mit Exit-Code und Zählung.
- **Risiko:** niedrig / mittel (`ctx.locale` ohne `inject` wirft).
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `packages/dashboard/client.js` liest nur noch `ctx.get?.(…)` (der `ctx[name]`-Zweig ist weg), der neue Gate-Test `scripts/gate/tests/client-locale.test.mjs` prüft drei Zusagen (Locale-Zugriff nur bei der Besitzerin, kein `ctx[…]` in Client-Hälften, jeder Fallback-Schlüssel genau einmal im Wörterbuch — E6). Verdrahtet im Glob von `npm run gate:test` und in CI; gemessen: `gate:test` **327/327, Exit 0**. Beleg: `docs/audit/UMBAU_2026-10-11.md` §4

### 3.1 (D1) DSH-Subset bestimmen
- **Ziel:** wissen, welche `@deepseek-ai/dsh-*` der Boot wirklich braucht.
- **Schritte:** Ausgangspunkt `profiles/shinon/package.json` — beim Beginn gemessen: 20 Bundles, davon 14 `@shinon/*` und 6 fremde (`dsh-base`, `dsh-web-app`, 4× `dsh-experimental-*`); je Paket Begründung.
- **Abnahme:** Liste mit Begründung je Paket im Repo.
- **Nachweis:** Liste plus `node -p`-Ausgabe der Bundle-Liste.
- **Risiko:** mittel / mittel.
- **Abhängig von:** A2
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — die Liste steht in [docs/audit/DSH_SUBSET_3-1.md](docs/audit/DSH_SUBSET_3-1.md): je Bundle ein Verdikt mit Begründung, gemessen wurden **19** Bundles (14 eigene, 5 fremde), 55 Layer-Köpfe und 207 Einträge im Dump. `dsh-base` (28 Köpfe) und `dsh-web-app` (4 Köpfe) sind nötig, die 14 eigenen getragen; die **drei** `dsh-experimental-*` (auto-review, agent-team-profile, voice-input-bundle) liest in diesem Baum **niemand** (3 Treffer, alle im Profil) → Kandidaten mit Empfehlung. **Entschieden und umgesetzt (A4/C7):** `voice-input-bundle` ist entfernt (einziger First-Use-Download, Manifest: „downloads its runtime on first use“), auto-review und agent-team-profile bleiben bewusst. Ein viertes experimental-Bundle (`schedule-bundle`) war nicht installiert und ist seit 2.4 entfernt. Endstand nach beiden Verkürzungen, gegen das Repo-`dsh@0.2.1-alpha.1` gemessen: **18** Bundles (14 eigene, 4 fremde), **54** Layer-Köpfe, **203** Einträge, Profiltest 3/0 mit 18 Layern. Die Zählung der Einträge hängt an der dsh-Fassung: das globale `0.2.0-rc.2` liefert bei denselben 54 Köpfen **201** Einträge

### 3.2 (D2) Vendoring nach `vendor/dsh/`
- **Ziel:** DSH im Repo, nachvollziehbar gepflegt.
- **Schritte:** aus dem alpha.2-Stand vendoren; Manifest mit Tag und Commit; `vendor/MODIFICATIONS.md` anlegen; `LICENSE` und `THIRD_PARTY_NOTICES.md` unverändert übernehmen.
- **Abnahme:** Copyright-Hinweis im Repo; Dateivergleich gegen den Tag ohne unerklärte Abweichung.
- **Nachweis:** Manifest, Änderungslog, Diff-Liste.
- **Risiko:** hoch / hoch (Umfang, Lizenzpflichten, Umfang der Kopie).
- **Abhängig von:** A2; **stoppt** bei abweichenden Copyleft-/Attributionspflichten
- **Status:** offen

### 3.3 (D3) Spike: Boot ohne benanntes Profil
- **Ziel:** Produktprofil ohne `$DSH_HOME/profiles/<name>` als Produktkonzept.
- **Schritte:** `RunProfileOptions.resolvedProfile` nutzen; `profile.dir` schreibbar halten (`cordis.yml` wird dort geschrieben); `installAnchor` als absoluten `package.json`-Pfad setzen.
- **Abnahme:** zwei bis drei Bundles starten; Logausgabe ohne Schlüsselwert.
- **Nachweis:** Logausgabe des Spikes.
- **Risiko:** hoch / hoch (Bootpfad hängt an Upstream-API; in diesem Thread **nicht** lokal verifiziert).
- **Abhängig von:** 3.2
- **Status:** offen

### 3.4 (D4) `bin`-Feld und echter Einstieg
- **Ziel:** ein Einstieg, keine Voraussetzung im PATH.
- **Schritte:** `bin/shinon.mjs` neu anlegen, `bin`-Feld im Root-Manifest; `scripts/start.mjs` (vorhanden, mit Node-Heilung und `dshBinary()`) als Basis.
- **Abnahme:** auf frischem Klon `npm install && npm start`, ohne globales `dsh`.
- **Nachweis:** Protokoll des Laufs mit Exit-Code.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 3.3, 3.5
- **Status:** offen

### 3.5 (D5) pnpm-Reste entfernen
- **Ziel:** npm ist die einzige Quelle.
- **Schritte:** die sechs getrackten pnpm-Dateien löschen (`STAND` §5); `packageManager` und `workspaces` aus dem Root-Manifest; die zwei echten pnpm-Aufrufe in `dsh-profile-test.mjs` und `pack-test.mjs` auf npm umstellen; npm-Lockfile als Quelle; `workspace:*` → semver-Range (19 Stellen).
- **Abnahme:** kein pnpm-Aufruf und keine pnpm-Datei mehr in Root oder Profil.
- **Nachweis:** `git grep -n '\bpnpm\b'` in Skripten/Manifesten; `git ls-files | grep -c pnpm` → 0.
- **Risiko:** hoch / hoch (Lockfile-Churn; `npm install` nötig, hier bisher nicht ausgeführt).
- **Abhängig von:** A1
- **Status:** offen

### 3.6 (D6) `profiles/` durch Code-Konfiguration ersetzen
- **Ziel:** Profilkonfiguration ist Produktquelle, nicht Ordnerkonvention.
- **Schritte:** die wirksamen Werte aus `profiles/shinon/cordis.patch.yml` (Modellroute, Permission, Task-Router, Index, UI-Schicht) in Code/Config überführen, danach 2.2.
- **Abnahme:** gleiche wirksame Konfiguration; Altdateien archiviert.
- **Nachweis:** Konfigurationsvergleich vor/nach.
- **Risiko:** hoch / hoch (Ladeordnung).
- **Abhängig von:** 3.3
- **Status:** offen

### 3.7 (D7) Build- und Gate-Ballast
- **Ziel:** genau ein Testeinstieg, ohne pnpm.
- **Schritte:** nach A5 kritische Gates behalten; `build.mjs`, `pack-test`, `validate-test`, `commit-guard`, Githooks, `dist/` inventarisieren und bewerten.
- **Abnahme:** ein dokumentierter Testeinstieg, der ohne pnpm läuft.
- **Nachweis:** Befehl plus Exit-Code.
- **Risiko:** mittel / mittel.
- **Abhängig von:** A5, 3.5
- **Status:** offen

### 3.8 (Overlay) MVP-UI
- **Ziel:** Shinon-Oberfläche ohne Fork der Web-UI.
- **Schritte:** Token-Overrides für `--dsw-*`/`--dsh-*` gegen den **alpha.2**-Theme-Stand (geändert, `UPSTREAM_DIFF` §2); Marke über `sidebar.brand.mark` + `conversation.hero.brand.mark` (bereits besetzt, `UPSTREAM_DIFF` §5.1); `ui-brand-official` deaktiviert; Deutsch ausschließlich aus `locale-de`; eigene Icons (A11).
- **Abnahme:** Slots besetzt, Tokens wirken, alle sichtbaren Texte deutsch; Screenshots vorher/nachher.
- **Nachweis:** Screenshots plus `node --test scripts/gate/tests/client-activation.test.mjs` mit Zählung.
- **Risiko:** mittel / mittel — **vorher** sind die Upstream-Slot-Definitionen zu lesen (`UPSTREAM_DIFF` §5.2 Punkt 1) und die Launcher-Patch-Frage zu klären (Punkt 2).
- **Abhängig von:** 3.3, 3.6, `UPSTREAM_DIFF` §5.2
- **Status:** offen — durch die drei offenen Punkte **blockiert**, bis sie geklärt sind

### 3.9 (D8) Live-Verifikation
- **Ziel:** Boot, Panel und Modellaufruf wirklich sehen.
- **Schritte:** Boot mit gesetzten Umgebungsvariablen; Browser-Panel prüfen; einen Modellaufruf über Agnes ausführen.
- **Abnahme:** Protokoll ohne Schlüsselwert.
- **Nachweis:** `docs/audit/LIVE.md`.
- **Risiko:** mittel / mittel — braucht `AGNES_API_KEY` in der Umgebung.
- **Abhängig von:** 3.4, 3.8
- **Status:** offen

### 3.10 (D9) Docs reduzieren
- **Ziel:** README, ARCHITECTURE, SETUP als Kern; Rest archivieren.
- **Schritte:** nach 1.3 und 3.7; `docs/archive/` neu anlegen; nichts löschen, nur verschieben.
- **Abnahme:** Verweise lösen alle auf (Prüfbefehl `defekt 0`).
- **Nachweis:** Prüfbefehl mit Zählung.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 1.3
- **Status:** offen

### 3.11 Marken-Check
- **Ziel:** kein Vollname im Produktnamen, in der UI und in Menüs.
- **Schritte:** `grep -ri "deepseek harness"` im Produktcode; Treffer außer Lizenz und Attribution entfernen; Desktop-Menü gesondert, falls Desktop-Code übernommen wird.
- **Abnahme:** leere Ausgabe oder begründete Restliste.
- **Nachweis:** Grep-Ausgabe.
- **Risiko:** niedrig / mittel (Markenrecht).
- **Abhängig von:** —
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — der Vollname ist aus Produktcode und UI-Texten: Kopfzeile `packages/core/index.js`, `meta.description` in `packages/core/package.json` und `packages/locale-de/package.json`. Übrige Treffer sind begründet (Fork-Aussage in `README.md`/`AGENTS.md`, Upstream-Doku-Links, Audit-Dokumente); `grep -rn -i 'DeepSeek Harness' packages/ profiles/ scripts/` → 0 Treffer. Beleg: `docs/audit/UMBAU_2026-10-11.md` §4

### 3.12 (A4) `key-router`, `narrative`, `popup` aktivieren
- **Ziel:** die drei Pakete tun im Profil etwas Nützliches, nicht nur „aktiviert" sein.
- **Schritte:** `key-router` um ausgehende Provider-Konfiguration erweitern (OpenAI-kompatibler `baseURL` je Anbieter, Protokoll `openai-completions`/`openai-responses`, `/models`-Abfrage, Verbindungstest); `narrative` ins Profil aufnehmen; `popup` mit einem echten, übersetzten Fortschritts-Overlay versehen (der Client rendert heute nichts); `shinon-forge` bewerten (fremde Tool-Spawns).
- **Abnahme:** die drei Pakete laden im Profil und leisten ihre Funktion; `shinon-forge` ist bewertet, nicht still aktiviert.
- **Nachweis:** Profillauf plus Testläufe je Paket.
- **Risiko:** hoch / mittel (`popup` war nie ein Renderer; `key-router` speichert Key-Material im Prozessspeicher).
- **Abhängig von:** 1.1, 3.6
- **Status:** offen

### 4.1 (F1) Messung unter Linux
- **Ziel:** entscheiden, ob der Browser der Engpass ist (Tor zu Phase 8).
- **Schritte:** RSS der Engine im Leerlauf und während einer Agent-Runde (`ps -o rss= -p <PID>`); Chromium-Tab gegen Upstream-Electron und ggf. Tauri.
- **Abnahme:** Tabelle mit Befehlen und Rohwerten.
- **Nachweis:** `docs/audit/MESSUNG.md`.
- **Risiko:** niedrig / mittel (ändert keinen Code, braucht aber einen Lauf).
- **Abhängig von:** 3.9
- **Status:** offen

### 4.2 (H1) Aufgabenset
- **Ziel:** 20–30 synthetische Aufgaben mit prüfbarem Ergebnis.
- **Schritte:** Aufgaben samt Ausgangszustand, Erwartung und Bewertungsweg anlegen.
- **Abnahme:** jede Aufgabe hat ein maschinell prüfbares oder klar bewertbares Ergebnis.
- **Nachweis:** `benchmarks/` plus Aufgabenliste.
- **Risiko:** mittel / mittel.
- **Abhängig von:** A9
- **Status:** offen

### 4.3 (H2) Metriken
- **Ziel:** vergleichbare Zahlen statt Eindrücke.
- **Schritte:** Erfolgsquote je Versuch, Erfolg je Token, Zeit, Fehlversuche.
- **Abnahme:** Metriken sind definiert und aus dem Lauf berechenbar.
- **Nachweis:** Metrikdokument plus Auswertungsskript.
- **Risiko:** niedrig / mittel.
- **Abhängig von:** 4.2
- **Status:** offen

### 4.4 (H3) DSH-Baseline
- **Ziel:** Vergleichsbasis mit demselben Modell.
- **Schritte:** DSH pur mit `agnes-2.5-flash` über dasselbe Aufgabenset.
- **Abnahme:** Rohdaten je Aufgabe.
- **Nachweis:** `docs/audit/BENCHMARK_DSH.md`.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 4.2, A8
- **Status:** offen

### 4.5 (H4) Shinon-Konfiguration messen
- **Ziel:** dasselbe Set gegen die Shinon-Konfiguration.
- **Abnahme:** Rohdaten je Aufgabe.
- **Nachweis:** `docs/audit/BENCHMARK_SHINON.md`.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 3.9, 4.4
- **Status:** offen

### 4.6 (H5) Feature-Entscheidung
- **Ziel:** nur behalten, was messbar hilft.
- **Schritte:** Prompt-Enhancer, Task-Router und Index je einzeln bewerten; Task-Router bleibt bis hierher aus (C7).
- **Abnahme:** Tabelle mit Ergebnis je Feature und Entscheidung.
- **Nachweis:** Entscheidungstabelle in `docs/audit/`.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 4.5
- **Status:** offen

### 5.1 (F2) Desktop-Spike
- **Ziel:** Browser-Overhead nach Messung senken.
- **Schritte:** nur nach A10-Entscheidung aus 4.1; Tauri-Shell mit Node-Sidecar und der Web-UI in der Webview.
- **Abnahme:** Fenster startet auf Mint; WebKitGTK-Fassung dokumentiert.
- **Nachweis:** Startprotokoll plus Version.
- **Risiko:** hoch / mittel.
- **Abhängig von:** 4.1, A10
- **Status:** zurückgestellt (A10 offen)

### 5.2 (F3) Protokoll Shell ↔ Engine
- **Ziel:** ein festgelegtes Protokoll statt Improvisation.
- **Schritte:** ACP gegen SDK prüfen, entscheiden, Roundtrip belegen.
- **Abnahme:** dokumentierte Entscheidung plus funktionierender Roundtrip.
- **Nachweis:** Protokolldokument plus Testlauf.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 5.1
- **Status:** zurückgestellt

### 5.3 (F4) Single-Binary
- **Ziel:** Engine ohne installiertes Node lauffähig.
- **Schritte:** z. B. `bun build --compile`.
- **Abnahme:** läuft auf Mint ohne Node im PATH.
- **Nachweis:** Laufprotokoll.
- **Risiko:** hoch / mittel (Tauglichkeit für die Abhängigkeiten ungeprüft).
- **Abhängig von:** 5.1
- **Status:** zurückgestellt

### 6.1 (J2) Persistenz zuerst
- **Ziel:** Spielfortschritt überlebt einen Neustart.
- **Schritte:** Client-Absender mounten (hängt an 2.3 und an der Remote-Listen-Frage, `UPSTREAM_DIFF` §5.2 Punkt 3); **zuvor** messen, ob ein Host-`ctx.emit` den Browser erreicht, statt die Repo-Notiz zu übernehmen.
- **Abnahme:** Test, dass ein geschriebener Stand einen Neustart überlebt.
- **Nachweis:** Testlauf mit Exit-Code.
- **Risiko:** hoch / mittel.
- **Abhängig von:** 2.3, `UPSTREAM_DIFF` §5.2 Punkt 3
- **Status:** offen

### 6.2 (J1) Ereignis-Adapter
- **Ziel:** Wartezeit wird genutzt, Fortschritt kommt aus echter Arbeit.
- **Schritte:** Adapter auf `agent/status`, `llm/response`, `llm/error`; setzt die Aktivierung aus 3.12 voraus.
- **Abnahme:** Testlauf mit echten Ereignissen.
- **Nachweis:** Testlauf mit Zählung.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 3.12, 6.1
- **Status:** offen

### 6.3 (J3) Balancing an erfolgreichen Schritten
- **Ziel:** kein Bonus für Token-Verschwendung.
- **Schritte:** Fortschritt an erfolgreiche Schritte koppeln, nicht an die Tokenmenge (heute `xpPerToken`).
- **Abnahme:** Tests weisen die Kopplung nach.
- **Nachweis:** erweiterte Tests in `packages/codingmon/test/`.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 6.2
- **Status:** offen

### 6.4 (J4) Kampf abbrechbar
- **Ziel:** kein Spiel, das auf etwas Vorbei wartet.
- **Schritte:** Spielende an das Agent-Ende koppeln.
- **Abnahme:** Test belegt das Ende.
- **Nachweis:** Testlauf.
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** 6.3
- **Status:** offen

### 7.1 (I1–I3) Bedienung
- **Ziel:** Erstlauf ohne Doku möglich; Fehlermeldungen führen weiter.
- **Schritte:** Erstlauf ohne README durchspielen und Zeitlimit setzen; Fehlermeldungen prüfen (z. B. fehlender Schlüssel, heute `MISSING_CREDENTIAL`); interne Begriffe (Profil, Gate, Slice, Stub) aus der UI entfernen.
- **Abnahme:** drei Standardaufgaben ohne Doku erledigt.
- **Nachweis:** Protokoll des Erstlaufs.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 3.9
- **Status:** offen

### 7.2 (K1) Lokalisierung
- **Ziel:** jeder sichtbare Text kommt aus `locale-de`.
- **Schritte:** Fallback-Tabellen in den Client-Hälften entfernen; Gate-Test auf Hartkodierungen.
- **Abnahme:** Gate-Test grün.
- **Nachweis:** Testlauf mit Zählung.
- **Risiko:** niedrig / mittel.
- **Abhängig von:** 2.6
- **Status:** offen

### 7.3 (K2) QoL
- **Ziel:** Reibungspunkte sind benannt und adressiert.
- **Schritte:** Liste aus zwei Wochen Eigennutzung; Top 10 lösen oder bewusst verwerfen.
- **Abnahme:** Liste mit Status im Repo.
- **Nachweis:** `docs/quality/QOL.md` (neu).
- **Risiko:** niedrig / niedrig — hängt an der Nutzungsdauer.
- **Abhängig von:** —
- **Status:** offen (wartet auf die Liste des Nutzers)

### 7.4 (K3) Design aus Tokens
- **Ziel:** Shinon-Flächen beziehen Farben, Abstände und Schrift aus einer Token-Datei.
- **Schritte:** Tokens zentralisieren; DSHs eigene UI zählt nicht dazu.
- **Abnahme:** keine festen Farbwerte in Shinon-Flächen; Screenshots vorher/nachher.
- **Nachweis:** Screenshots plus Grep auf feste Farbwerte.
- **Risiko:** niedrig / mittel.
- **Abhängig von:** 3.8
- **Status:** offen

### 8.1–8.4 Engine-Port
- **Ziel:** Engine portieren — **nur** wenn 4.1 sie als Engpass belegt.
- **Schritte:** reine Kerne zuerst nach Rust gegen die Replay-Fixtures; danach Host-Hälften; zuletzt Agent-Loop, Sessions und Provider.
- **Abnahme:** je Kern identisches Ergebnis gegen die Fixtures.
- **Nachweis:** Fixture-Läufe alt/neu.
- **Risiko:** hoch / hoch.
- **Abhängig von:** 4.1 (positiv), E1–E3 (Verträge eingefroren)
- **Status:** zurückgestellt — Gate nicht erfüllt

---

## Risiken gesamt

| Risiko | W. | Wirkung | Umgang |
|---|---|---|---|
| `docs/`-Migration bricht Gate- und Testpfade | hoch | mittel | Zielliste aus `STAND` §6.1, Referenzliste §6.3, Prüfbefehl `defekt 0` |
| npm-Umstellung: `workspace:*` und Lockfile | hoch | hoch | semver-Ranges, Lockfile neu erzeugen, isolierter Install testen |
| alpha.2-Theme-Erweiterung bricht das Overlay | mittel | mittel | `UPSTREAM_DIFF` §2; am Quelltext lesen, nicht aus Bytes schließen |
| Downgrade/Upgrade der DSH-Fassung (lokal alpha.1, Ziel alpha.2) | mittel | hoch | erst 3.2, dann Pin anpassen; keine Versionsmischung |
| `popup` hat keinen Renderer | hoch | niedrig | Renderer als eigene Aufgabe, nicht „aktivieren" nennen |
| `key-router` hält Key-Material im Prozessspeicher | mittel | hoch | vor Aktivierung Sicherheitsvertrag festlegen (kein Repo, keine Logs) |
| `shinon-forge` startet fremde Engines (Subprozesse) | mittel | hoch | vor Aktivierung bewerten; Defaults restriktiv |
| Remote-Beitrag im Client nicht mountbar | mittel | mittel | `UPSTREAM_DIFF` §5.2 Punkt 3 vor 6.1 klären |
| Kein `dsh` im PATH für Abnahmen | hoch | mittel | lokales `node_modules/@deepseek-ai/dsh` nutzen, Node ≥ 22 |
| Commit-Regel offen (A6) | hoch | niedrig | keine Commits; Arbeitsbaum bleibt nachvollziehbar |

## Was ungeprüft bleibt

- **Kein einziger Testlauf** in Phase P: Gate, `gate:test`, `gate:full`, `npm test`,
  `pack-test`, `profile-test` sind **nicht** ausgeführt (`STAND` §7).
- **Keine Installation**, kein `npm install`, kein DSH-Upgrade, kein Vendor-Baum.
- **Kein Boot, kein Browser, kein Modellaufruf.**
- Die drei OFFEN-Punkte aus `UPSTREAM_DIFF` §5.2 (Slot-Definition
  `conversation.hero.brand.mark`, Launcher-only-Patch, Remote-Listen-Extensibilität).
- Abgeschnittene Upstream-Abrufe (`UPSTREAM_DIFF` §7).
- Ob npm `workspace:*` in dieser Umgebung tatsächlich ablehnt (Dokumentationsaussage,
  kein eigener Install ausgeführt).
- Alles zu Windows — außerhalb des Scope.
- Kein Commit, kein Push; `main` unverändert auf `91c7e4f`.
