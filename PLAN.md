# PLAN: Shinon Forge Umbau

> **Status:** plan — Umsetzungsplan für den Umbau zum eigenständigen Produkt. **Stand:** 2026-10-17
> (Fortschritt: 1.3, 1.4, 2.1–2.6, 3.1, 3.11 und 3.12 sind im Arbeitsbaum erledigt — Nachweise je
> Schritt bzw. `docs/archive/UMBAU_2026-10-11.md` §7 und `docs/archive/DSH_SUBSET_3-1.md`; §3.12 nennt
> die noch ungemessene Live-429-Rotation des Key-Routers; die Release-Abnahme v0.4.0 ist in §9.1 erfasst.)
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

**Stand:** 2026-10-10 · **Basis-Commit:** `91c7e4f` (`main`) · **Arbeitskopie:** `/home/vannon/Dokumente/Projekte/Shinon-forge` ·
**Ersteller:** Auftrag Vannon, Umsetzung im Agent-Lauf · **Scope:** Linux Mint x64 · **Paketmanager:** npm (kein pnpm)

**Abweichung zum Briefing:** Das Briefing nennt `c0e274f` als Basis. Gemessen ist der
Stand `91c7e4f` (drei Commits weiter). Nachweis: `docs/archive/STAND_2026-10-10.md` §1.

**Harte Regeln während der Umsetzung (HISTORISCH, Stand 2026-10-10 — keine aktive Release-Regel):**
> Historisch: „keine Commits, keine Pushes, keine Branch-Löschung; `main` wird
> nicht beschrieben; Arbeit auf `umbau/<schritt>`" galt nur für die Umbau-Phase
> ab Basis `91c7e4f`. Für den v0.4.0-Freeze gilt das Gegenteil: dokumentierte
> Commits mit Trailer + Wächter + grünem CI auf `main` sind der Release-Weg
> (`docs/ROADMAP.md` §1.5, `docs/COMMIT-REGELN.md`). Wer diese Zeile als
> aktuelle Regel liest, blockiert den Release mit einer veralteten Anweisung.
> Zeitlos gültig bleibt: Secrets nur über Umgebungsvariablen; keine
> Erfolgsmeldung ohne Exit-Code und Zählung.

---

## Offene Entscheidungen

| ID | Frage | Status | Blockiert |
|---|---|---|---|
| A1 | pnpm entfernen statt lauffähig machen | **ENTSCHIEDEN** — entfernen; genau die sechs getrackten pnpm-Dateien löschen, pnpm-Aufrufe in Skripten durch npm ersetzen | — |
| A2 | DSH-Version | **ENTSCHIEDEN** — `0.2.1-alpha.2` als Basis. Upstream-Diff: `ui-theme` geändert, `ui-brand-official` byte-identisch, `locale` im geprüften Teil unverändert (`docs/archive/UPSTREAM_DIFF.md`) | — |
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
| B1 | `Docs/` vs. `docs/` | **ENTSCHIEDEN** — ein Ordner `docs/`; Zielliste (52 Pfade) in `docs/archive/STAND_2026-10-10.md` §6.1 | **ausgeführt** (2026-10-10) — `docs/archive/STAND_2026-10-10.md` §9 |
| B2 | `.freebuff/` | **ENTSCHIEDEN** — `.freebuff/settings.json` aus dem Tracking lösen, lokal behalten; `.freebuff/` bleibt ignoriert | — |
| C7 | Defaults | **ENTSCHIEDEN** — sichere Defaults: `workspace-write` / `approval: ask`; Task-Router bis H5 deaktiviert | — |

**Stoppbedingung vor Phase 1:** `.credentials.yaml` liegt außerhalb der Arbeitskopie.
**Erfüllt** (gemessen: `CREDENTIALS_PRESENT=no`, `docs/archive/STAND_2026-10-10.md` §2).
Während der Umsetzung gilt sie fort: taucht ein Schlüssel im Arbeitsbaum auf, wird
gestoppt und gemeldet, nicht repariert.

---

## Schritte

### P1 Ist-Stand verifizieren
- **Ziel:** Zustand der Arbeitskopie belegen, auf dem Phase 1 aufsetzt.
- **Schritte:** Branch/HEAD, Arbeitsbaum, Node/npm, `dsh`, `schemastery`, pnpm-Reste, Case-Fold-Bestand messen.
- **Abnahme:** Alle Werte mit ausgeführtem Befehl; Nicht-Gemessenes als UNGEPRÜFT markiert.
- **Nachweis:** `docs/archive/STAND_2026-10-10.md` (Branch `umbau/phase-p`, HEAD `91c7e4f`, Node v18.19.1 im PATH, Node v22.23.3/v24.21.0 lokal, dsh lokal `0.2.1-alpha.1`, schemastery 3.18.4 auflösbar, sechs pnpm-Dateien, 52 + 7 Dokumentpfade).
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** —
- **Status:** **erledigt** (2026-10-10)

### P2 Upstream-Diff an den Andockstellen
- **Ziel:** alpha.1 gegen alpha.2 nur dort vergleichen, wo das Overlay andockt.
- **Schritte:** `ui-theme`, `locale`, `ui-brand-official` je Tag abrufen, `sha`/`size` vergleichen; Slot-Definitionen und die drei offenen Punkte benennen.
- **Abnahme:** Ergebnis als Dateiliste mit Verdikt je Position; die drei offenen Punkte ausdrücklich als OFFEN.
- **Nachweis:** `docs/archive/UPSTREAM_DIFF.md` (`ui-theme/src` geändert: `boot-theme.ts` 2446→3183 B, `index.ts` 1805→2753 B, `theme-settings.ts` 2133→7391 B; `ui-brand-official/src` vollständig geprüft und byte-identisch; `FontFamilyRow.*`/`FontSettingsGroup.*` in alpha.2 neu).
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
- **Status:** **erledigt** (2026-10-11) — der Plan ist freigegeben und die Schritte 1.4, 2.2–2.6 und 3.11 sind ausgeführt; jeder trägt seinen Status und seinen Nachweis (`docs/archive/UMBAU_2026-10-11.md`)

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
- **Schritte:** Der Root-Pin folgt der Range des gepinnten Harness (`~3.18.5-alpha.1`, heute auf `3.18.5` aufgelöst) — das ist keine freie Wahl: `~3.18.4` und `~3.18.5-alpha.1` sind disjunkt, also darf npm nicht hoisten und legt jeder Direktabhängigkeit eine eigene Kopie bei (gemessen 2026-10-17: 1× `3.18.4` + 113× `3.18.5-alpha.1`, 114 Kopien). Der Abgleich mit dem zu vendorenden Stand bleibt bei 1.5.
- **Abnahme:** `npm run gate:test` läuft ohne Umgebungsfehler durch, und `scripts/gate/tests/schemastery-pin.test.mjs` belegt die eine Fassung (Manifest-Gleichheit, Range des Harness, genau ein Lock-Eintrag).
- **Nachweis:** Exit-Code und Zählung von `npm run gate:test`; `npm ls @deepseek-ai/schemastery --all` sagt überall `deduped`, `find node_modules -type d -name schemastery` nennt genau einen Pfad.
- **Risiko:** mittel / hoch (Versionsmischung bricht zur Laufzeit, nicht im Test).
- **Abhängig von:** 3.2 (Vendor-Stand)
- **Status:** erledigt für „eine Fassung im Baum" (2026-10-17); der Vendor-Abgleich (3.18.0) bleibt offen und hängt an 1.5.

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
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `git ls-files -- .freebuff` ist leer, `ls .freebuff/settings.json` findet die Datei weiter (lokal, ignoriert); Beleg: `docs/archive/UMBAU_2026-10-11.md` §4

### 1.5 (B5) Commit `487c559` bewerten
- **Ziel:** die 31 gesicherten Änderungen inhaltlich prüfen („gesichert" ist nicht „geprüft").
- **Schritte:** Diff je Datei lesen, gewollt/ungewollt bewerten, Risiken benennen.
- **Abnahme:** Tabelle mit Datei, Bewertung und Begründung, ohne Datei zu ändern.
- **Nachweis:** `docs/archive/WORKTREE_REVIEW.md` (`git show --stat 487c559` → 43 Dateien, 1890 Einfügungen, 129 Löschungen).
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
- **Nachweis:** [docs/archive/PLUGIN_IDIOME_2-1.md](docs/archive/PLUGIN_IDIOME_2-1.md) — §2 Paketgrenze (Tarball-Liste), §4 Mutationsprobe (verfälschte Zeile → `idioms:check`/`dsh-test`/`gate:full` rot, zurückgespielt → grün), §5 Verhaltensgleichheit, §7 Läufe; Diff der elf Aufrufer; Zahl der Kopien in `docs/ZAHLEN.md` §1 (12 Blöcke / 11 Dateien / 0 handgepflegt).
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
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — die vier Dateien des Altprofils liegen unter `docs/archive/legacy-profiles/web/` (nichts gelöscht), `git ls-files profiles` nennt nur noch `shinon` und `headless`, und der einzige wirksame Wert (`welcomeNoticeVersion`, E1) steht im GELADENEN Profil (`--dump-config` Exit 0). A1 (pnpm-Rückbau) bleibt offen und ist damit nicht Teil dieses Schritts. Beleg: `docs/archive/UMBAU_2026-10-11.md` §4

### 2.3 (C6) Tote Verdrahtung entscheiden
- **Ziel:** je Befund anschließen oder streichen, nicht beides halb.
- **Schritte:** `markers`-Host-Spiegel, `codingmon`-Client-Absender, `hook`-Trace-Kanal (`TRACE_CHANNEL`), `task-router`-`MICRO_STATE_SERVICE`, `project-index`-Index je einzeln entscheiden.
- **Abnahme:** je Befund eine Entscheidung mit Begründung; Gate nach jeder Änderung grün.
- **Nachweis:** `node scripts/dsh-test.mjs` je Änderung plus Entscheidungsliste.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — vier der fünf Befunde haben einen gemessenen Leser (prompter liest `shinon_index_query`; die Probe `hook-pre-step` liest `TRACE_CHANNEL`; `task-router.test.mjs` liest `shinon_goal_micro_state`; `uebergabe.test.mjs` mountet den codingmon-Beitrag), der fünfte ist GEBAUT statt gestrichen: `markers` schickt seine wirksamen Grenzen über `webserver/index-inject` als `window.__DSH_MARKERS_CONFIG__` in die Seite, der Client liest sie (fremder Vertrag wird verworfen). Belege: Entscheidungsliste und Naht in `docs/archive/UMBAU_2026-10-11.md` §2/§3; `node --test scripts/gate/tests/markers.test.mjs` 27/27; `dsh-test` 99/0; `gate:full` 18/18 (Exit 0)

### 2.4 (C7) Defaults entschärfen
- **Ziel:** keine stillen Vollzugriffe.
- **Schritte:** `permission.defaultPreset` auf `workspace-write` mit `approval: ask`; `task-router` `activate: false` bis H5; die vier `dsh-experimental-*`-Bundles einzeln bewerten.
- **Abnahme:** Profil lädt mit den neuen Defaults; `--dump-config` zeigt sie.
- **Nachweis:** `dsh --profile shinon --dump-config` (mit Node ≥ 22) — derzeit **UNGEPRÜFT**, weil kein `dsh` im PATH (siehe Restunsicherheit).
- **Risiko:** niedrig / hoch (Sicherheitswirkung).
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `DSH_HOME=$PWD dsh --profile shinon --dump-config` (Exit 0, Repo-`dsh` 0.2.1-alpha.1 zuerst im PATH) zeigt `shinon-task-router.activate: false` und `permission.defaultPreset: workspace-write` samt Preset `workspace-write: {sandbox: workspace-write, approval: ask}`; `node scripts/dsh-profile-test.mjs` 3/0 (19 Layer, 14 Repo-Bundles — Stand direkt nach 2.4; der Endstand nach 3.1 steht im Status von 3.1: **18**). Von den vier `dsh-experimental-*`-Bundles wurde **eines** entfernt (`schedule-bundle`: nicht installiert, nicht im Lock, kein `# == `-Kopf im Dump — die Ebene konnte sich nicht auflösen), die drei übrigen bleiben der Entscheidung aus 3.1 überlassen. Beleg: `docs/archive/UMBAU_2026-10-11.md` §4

### 2.5 (C8) `agent-default-model` angleichen
- **Ziel:** Kommentar und Config dürfen sich nicht widersprechen.
- **Schritte:** Kommentarblock (`cordis.patch.yml` 89–93) auf die wirksame Route `agnes/agnes-2.5-flash` ziehen.
- **Abnahme:** Kommentar nennt dieselbe Route wie die Config.
- **Nachweis:** Diff der Datei; `grep -n 'agent-default-model' -A4`.
- **Risiko:** niedrig / niedrig.
- **Abhängig von:** —
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — Kommentar und Config nennen dieselbe Route `agnes/agnes-2.5-flash`; gemessen im Dump: `agent-default-model: provider: agnes, model: agnes-2.5-flash` (`--dump-config`, Exit 0). Beleg: `docs/archive/UMBAU_2026-10-11.md` §4

### 2.6 (F-l/F-m) Locale-Fallback und `ctx[name]`-Zugriff
- **Ziel:** kein werfender Dienstzugriff, keine doppelte Sprachtabelle.
- **Schritte:** die fünf Client-Hälften auf `ctx.get?.('locale')` prüfen; `dashboard/client.js:437` (`ctx[name]`) beseitigen; Gate-Test gegen hartkodierte Texte anlegen.
- **Abnahme:** Gate-Test grün und im Testeinstieg verdrahtet.
- **Nachweis:** Testlauf mit Exit-Code und Zählung.
- **Risiko:** niedrig / mittel (`ctx.locale` ohne `inject` wirft).
- **Abhängig von:** 1.1
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `packages/dashboard/client.js` liest nur noch `ctx.get?.(…)` (der `ctx[name]`-Zweig ist weg), der neue Gate-Test `scripts/gate/tests/client-locale.test.mjs` prüft drei Zusagen (Locale-Zugriff nur bei der Besitzerin, kein `ctx[…]` in Client-Hälften, jeder Fallback-Schlüssel genau einmal im Wörterbuch — E6). Verdrahtet im Glob von `npm run gate:test` und in CI; gemessen: `gate:test` **327/327, Exit 0**. Beleg: `docs/archive/UMBAU_2026-10-11.md` §4

### 3.1 (D1) DSH-Subset bestimmen
- **Ziel:** wissen, welche `@deepseek-ai/dsh-*` der Boot wirklich braucht.
- **Schritte:** Ausgangspunkt `profiles/shinon/package.json` — beim Beginn gemessen: 20 Bundles, davon 14 `@shinon/*` und 6 fremde (`dsh-base`, `dsh-web-app`, 4× `dsh-experimental-*`); je Paket Begründung.
- **Abnahme:** Liste mit Begründung je Paket im Repo.
- **Nachweis:** Liste plus `node -p`-Ausgabe der Bundle-Liste.
- **Risiko:** mittel / mittel.
- **Abhängig von:** A2
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — die Liste steht in [docs/archive/DSH_SUBSET_3-1.md](docs/archive/DSH_SUBSET_3-1.md): je Bundle ein Verdikt mit Begründung, gemessen wurden **19** Bundles (14 eigene, 5 fremde), 55 Layer-Köpfe und 207 Einträge im Dump. **Endstand dieser Zeile ist nicht mehr 18:** ein zweiter Schreiber hat am selben Tag `@deepseek-ai/dsh-experimental-inspector-profile` hinzugefügt (gemessen 01:26: 19 Bundles (14 eigene, 5 fremde), 55 Layer-Köpfe, 205 Einträge, Profiltest 3/0 mit 19 Layern; Verdikt offen, §7 des Nachweises). `dsh-base` (28 Köpfe) und `dsh-web-app` (4 Köpfe) sind nötig, die 14 eigenen getragen; die **drei** `dsh-experimental-*` (auto-review, agent-team-profile, voice-input-bundle) liest in diesem Baum **niemand** (3 Treffer, alle im Profil) → Kandidaten mit Empfehlung. **Entschieden und umgesetzt (A4/C7):** `voice-input-bundle` ist entfernt (einziger First-Use-Download, Manifest: „downloads its runtime on first use“), auto-review und agent-team-profile bleiben bewusst. Ein viertes experimental-Bundle (`schedule-bundle`) war nicht installiert und ist seit 2.4 entfernt. Endstand nach beiden Verkürzungen, gegen das Repo-`dsh@0.2.1-alpha.1` gemessen: **18** Bundles (14 eigene, 4 fremde), **54** Layer-Köpfe, **203** Einträge, Profiltest 3/0 mit 18 Layern. Die Zählung der Einträge hängt an der dsh-Fassung: das globale `0.2.0-rc.2` liefert bei denselben 54 Köpfen **201** Einträge

### 3.2 (D2) Vendoring nach `vendor/dsh/`
- **Ziel:** DSH im Repo, nachvollziehbar gepflegt.
- **Schritte:** aus dem alpha.2-Stand vendoren; Manifest mit Tag und Commit; `vendor/MODIFICATIONS.md` anlegen; `LICENSE` und `THIRD_PARTY_NOTICES.md` unverändert übernehmen.
- **Abnahme:** Copyright-Hinweis im Repo; Dateivergleich gegen den Tag ohne unerklärte Abweichung.
- **Nachweis:** Manifest, Änderungslog, Diff-Liste.
- **Risiko:** hoch / hoch (Umfang, Lizenzpflichten, Umfang der Kopie).
- **Abhängig von:** A2; **stoppt** bei abweichenden Copyleft-/Attributionspflichten
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `vendor/dsh/` trägt das veröffentlichte CLI-Paket **`@deepseek-ai/dsh@0.2.1-alpha.2`**, 20 Dateien, jede **byte-identisch** zum Registry-Tarball (`sha256` je Datei in [vendor/dsh/MANIFEST.json](vendor/dsh/MANIFEST.json); Dateivergleich 20/20, **0** Abweichungen → leere Diff-Liste). Der Ökosystem-Baum (260 Pakete, ~273 MiB) ist **nicht** vendort und bleibt npm-Abhängigkeit. Zwei Abweichungen vom Wortlaut, beide belegt statt geraten: (1) **kein Commit-Hash** — die Registry veröffentlicht für diese Fassung kein `gitHead` (`npm view … gitHead` → leer), das Manifest sagt deshalb `null` mit Begründung statt eines erfundenen Hashs; (2) **kein `THIRD_PARTY_NOTICES.md` im Paket** (20 Dateien, keine mit dem Namen) — übernommen ist die `LICENSE` unverändert, der Befund steht in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Die Stoppbedingung ist **nicht** ausgelöst: MIT, kein Copyleft, Copyright- und Lizenzhinweis bleiben unverändert. Nachweis: Änderungslog [vendor/MODIFICATIONS.md](vendor/MODIFICATIONS.md), Copyright-Hinweis im Repo-Root ([LICENSE](LICENSE), `Copyright (c) 2026 Vannon`), Fassungsmischung belegt (alpha.1 installiert vs. alpha.2 vendort unterscheiden sich in genau zwei Dateien: `lib/bin.js`, `package.json`); `dsh-test` 99/0, `gate:test` 327/0 unverändert grün. **Nachtrag 2026-10-17 (A4 der Release-Abnahme):** die vendorte Fassung ist auf den Root-Pin gezogen — `vendor/dsh` trägt jetzt `0.2.1-alpha.1`, byte-identisch zum Registry-Tarball (Integrität und `sha256` je Datei im Manifest). Welcher Code `vendor/` lädt (gemessen: keiner) und was ein Umzug auf eine andere Fassung kosten würde, steht in [vendor/MODIFICATIONS.md](vendor/MODIFICATIONS.md); die wörtlichen Befehlsausgaben in [docs/archive/A4_DSH_FASSUNG_2026-10-17.md](docs/archive/A4_DSH_FASSUNG_2026-10-17.md)

### 3.3 (D3) Spike: Boot ohne benanntes Profil
- **Ziel:** Produktprofil ohne `$DSH_HOME/profiles/<name>` als Produktkonzept.
- **Schritte:** `RunProfileOptions.resolvedProfile` nutzen; `profile.dir` schreibbar halten (`cordis.yml` wird dort geschrieben); `installAnchor` als absoluten `package.json`-Pfad setzen.
- **Abnahme:** zwei bis drei Bundles starten; Logausgabe ohne Schlüsselwert.
- **Nachweis:** Logausgabe des Spikes.
- **Risiko:** hoch / hoch (Bootpfad hängt an Upstream-API; in diesem Thread **nicht** lokal verifiziert).
- **Abhängig von:** 3.2
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — die Frage ist **beantwortet: ja.** Der Spike [`scripts/spike-resolved-profile.mjs`](scripts/spike-resolved-profile.mjs) lädt das Profil über **`loadProfileDirectory(dir, installAnchor)`** und übergibt es als **`resolvedProfile: { profile, installAnchor }`** an `runProfile`; `$DSH_HOME/profiles/<name>` kommt nicht vor. Gemessen: **Exit 0**, **11/11** Zusagen — 3 Bündel gelöst, keines übersprungen, Baum aktiv (`fiber.state === 2`, Loader vorhanden), `profileContext.dir` = Spike-Verzeichnis, `installAnchor` = `<Repo>/node_modules/@deepseek-ai/dsh/package.json`, und jedes der drei Bündel hat sich im `apply()` gemeldet — `[shinon-events] 9 Signale + Carrier gebunden (shinon.event-spine/v1, authority NONE)`, also die ganze Kette Profil → Patch → Plugin → eigenes `assets/`. Der Lauf bleibt schlüsselfrei (leerer Umgebungs-Snapshot, zusätzlich geprüft gegen alle `*KEY*`/`*TOKEN*`/`*SECRET*`-Werte des Prozesses). Nachweis mit wörtlichem Log, Zusagentabelle und **vier Befunden für 3.6**: [docs/archive/SPIKE_3-3.md](docs/archive/SPIKE_3-3.md). Berührt wurden nur `<Repo>/dist/.spike-3-3` (gitignoriert) und der Spike-Prozess — der fremde Boot auf denselben `profiles/` blieb unangetastet.

### 3.5–3.7 — Stand (2026-10-11)

**Der harte Befund gilt für 3.5:** der Schritt verlangt „`workspace:*` → semver-Range
(19 Stellen)" **und** das Entfernen des `workspaces`-Felds. Gemessen (npm 10.9.9) ist
diese Kombination nicht ausführbar:

| Manifest-Lage | `npm install --dry-run` | Beleg |
|---|---|---|
| `workspaces` vorhanden, `"@shinon/core": "workspace:*"` | **Exit 0**, „add @shinon/core 1.0.0“ (lokales Paket) | Scratch-Reproduktion außerhalb des Repos |
| kein `workspaces`, `"@shinon/core": "workspace:*"` | **Exit 1**, `EUNSUPPORTEDPROTOCOL — Unsupported URL Type "workspace:"` | dieselbe |
| kein Registry-Paket als Rückfall | `npm view @shinon/core` → **E404** (ebenso `events`, `locale-de`, `codingmon`, `key-router`) | Registry-Abfrage |
| **echter frischer Klon dieses Repos** (Manifest unverändert) | **Exit 0**, 731 Pakete in 24 s | `/tmp/fresh-clone`, `npm install` |

Das Protokoll lebt also **vom** `workspaces`-Feld: nimmt man beides wie im Plan
verlangt weg, gibt es für die 19 lokalen Pakete weder Workspace-Verknüpfung noch
Registry-Rückfall. **Der Ist-Stand installiert heute schon mit npm** — was 3.5 wirklich
zu tun bleibt, ist damit kleiner, als der Plan annimmt: die sechs pnpm-Dateien, das
`packageManager`-Feld und die zwei pnpm-Aufrufe. Ob das `workspace:*`-Protokoll bleiben
darf (es läuft gemessen mit npm 10) oder auf `*`/`file:` weichen soll, gehört dem
Auftraggeber — der Plan verlangt die Entfernung, die Messung verlangt sie **nicht**.

**Erledigt ist davon der protokollfreie Teil (2026-10-11):** die sechs getrackten
pnpm-Dateien, das `packageManager`-Feld und die zwei echten pnpm-Aufrufe sind weg, der
npm-Lockfile ist nachgezogen und als Quelle belegt (Nachweis:
[docs/archive/PAKETQUELLE_NPM_3-5.md](docs/archive/PAKETQUELLE_NPM_3-5.md)). Abnahme in einer
Arbeitsbaum-Kopie außerhalb des Repos unter einem PATH **ohne `dsh` und ohne `pnpm`**:
`npm install` **Exit 0** (731 Pakete), `npm start -- --check` **Exit 0** (Herkunft
`Repo-Installat`, Version `0.2.1-alpha.1`). Offen bleibt allein die Bindungsfrage —
`workspaces` und die 19 `workspace:*`-Stellen sind unangetastet, weil jede Antwort
darauf eine andere Änderung verlangt.

**Für 3.6 gilt der Fortsetzungshemmer:** 3.6 schreibt `profiles/` um, während
dort ein **laufender fremder Boot** (PID 126619) liest und schreibt
(`profiles/shinon/cordis.yml` wird bei jedem Start neu geschrieben). Dazu die
Stoppbedingung 1: eine `.credentials.yaml` liegt **im** Arbeitsbaum (nicht gelesen,
nicht gelöscht, nur gemeldet). Der Teil von 3.7, der **ohne** die Bindungsentscheidung
auskommt, ist dagegen gemessen (siehe 3.7 unten).

### 3.4 (D4) `bin`-Feld und echter Einstieg
- **Ziel:** ein Einstieg, keine Voraussetzung im PATH.
- **Schritte:** `bin/shinon.mjs` neu anlegen, `bin`-Feld im Root-Manifest; `scripts/start.mjs` (vorhanden, mit Node-Heilung und `dshBinary()`) als Basis.
- **Abnahme:** auf frischem Klon `npm install && npm start`, ohne globales `dsh`.
- **Nachweis:** Protokoll des Laufs mit Exit-Code.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 3.3, 3.5
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — `bin/shinon.mjs` ist ein **echter** Einstieg (Audit-Befund A-INV-03 war: „verwaist: nur Logs, kein `bin`-Feld, kein Script verweist darauf“): Node-Heilung auf ≥ 22, **eine** dsh-Auflösung über `dshBinary()`, `--check` mit Angabe der **Herkunft** (`dshSource()` in [scripts/lib/dsh.mjs](scripts/lib/dsh.mjs)), Start mit `--profile <aktiv>` und `DSH_HOME=<Repo>`. `scripts/start.mjs` ist nur noch ein Kompatibilitäts-Einstieg, der dieselbe Umsetzung importiert (eine Quelle, kein zweiter Startpfad). Root-Manifest trägt jetzt `"bin": { "shinon": "bin/shinon.mjs" }`, `npm start` zeigt dorthin. Gemessen: `env -i … bin/shinon.mjs --check` **Exit 0** ohne `dsh` im PATH (Herkunft: `Repo-Installat`), `npm start -- --check` **Exit 0**, der Kompatibilitätspfad **Exit 0**, und unter System-Node v18 heilt sich der Einstieg selbst auf v22.23.3 (**Exit 0**). **Die frische-Klon-Hälfte der Abnahme ist gemessen**, in einer Arbeitsbaum-Kopie außerhalb des Repos (`/tmp/fresh-clone`, ohne `node_modules`/`dist`/`logs`/`sessions`/`storages`): `npm install` **Exit 0** (731 Pakete, 24 s. npm 10.9.9, Node v22.23.3) und `npm start` **Exit 0** — mit einem PATH, auf dem `command -v dsh` **NEIN** sagt (nur `node`/`npm`/`npx`), Herkunft im Protokoll: `Repo-Installat — /tmp/fresh-clone/node_modules/@deepseek-ai/dsh`, Version `0.2.1-alpha.1` (nicht das globale `0.2.0-rc.2`). Auch `npm start -- --version` (echter Startpfad, endet sofort) und der Direktaufruf `node bin/shinon.mjs --check` sind **Exit 0**. Protokoll: [docs/archive/EINSTIEG_3-4.md](docs/archive/EINSTIEG_3-4.md).

### 3.5 (D5) pnpm-Reste entfernen
- **Ziel:** npm ist die einzige Quelle.
- **Schritte:** die sechs getrackten pnpm-Dateien löschen (`STAND` §5); `packageManager` und `workspaces` aus dem Root-Manifest; die zwei echten pnpm-Aufrufe in `dsh-profile-test.mjs` und `pack-test.mjs` auf npm umstellen; npm-Lockfile als Quelle; `workspace:*` → semver-Range (19 Stellen).
- **Abnahme:** kein pnpm-Aufruf und keine pnpm-Datei mehr in Root oder Profil.
- **Nachweis:** `git grep -n '\bpnpm\b'` in Skripten/Manifesten; `git ls-files | grep -c pnpm` → 0.
- **Risiko:** hoch / hoch (Lockfile-Churn; `npm install` nötig, hier bisher nicht ausgeführt).
- **Abhängig von:** A1
- **Status:** **protokollfreier Teil erledigt im Arbeitsbaum** (2026-10-11) — die sechs getrackten pnpm-Dateien sind gelöscht (das Root-`pnpm-workspace.yaml`, die vier unter `profiles/{shinon,headless}/` und das `pnpm-workspace.yaml` des archivierten `web`-Profils), das `packageManager: pnpm@11.7.0` ist aus dem Root-Manifest raus, die zwei echten Aufrufe sind auf npm umgestellt (`npm pack`/`npm install` in [scripts/pack-test.mjs](scripts/pack-test.mjs); der Auto-Install per `pnpm install` in [scripts/dsh-profile-test.mjs](scripts/dsh-profile-test.mjs) ist **weg** — er ersetzt ihn durch eine sichtbare Warnung, weil die Profil-Dependencies `link:` nutzen und npm dieses Protokoll ablehnt, gemessen: `EUNSUPPORTEDPROTOCOL`), und der npm-Lockfile ist nachgezogen (Root-devDeps 16 → 19, 815 Einträge, 19 Workspace-Links, Pin `0.2.1-alpha.1` unverändert). **Abnahme gemessen** (`git ls-files | grep -ci pnpm` → **0**; echte pnpm-Aufrufe in `scripts/` → **0**) in einem frischen Klon außerhalb des Repos ohne `dsh` und ohne `pnpm` im PATH: `npm install` **Exit 0** (731 Pakete, 19 s), `npm start -- --check` **Exit 0**, Lockfile nach dem Install byteidentisch. **Durchsetzend geprüft:** die Invariante hat seit dem 2026-10-11 einen Eigentümer — `pnpmIssues()` in [scripts/lib/repo.mjs](scripts/lib/repo.mjs), geprüft vom Gate (Prüfung „pnpm-Reste", 99 → **100** Prüfungen) und vom Build, mit präzisen Mustern statt `grep pnpm` (Artefaktnamen, Prozess-/Script-Aufruf, Manifest-Script) und drei Negativproben ([§8.2](docs/archive/PAKETQUELLE_NPM_3-5.md)). Nachweis: [docs/archive/PAKETQUELLE_NPM_3-5.md](docs/archive/PAKETQUELLE_NPM_3-5.md). **Offen bleibt die Bindungsfrage** (`workspaces` + 19× `workspace:*`, siehe Block oben) — sie ist der einzige Teil des Schritts, der eine Entscheidung des Auftraggebers braucht.

### 3.6 (D6) `profiles/` durch Code-Konfiguration ersetzen
- **Ziel:** Profilkonfiguration ist Produktquelle, nicht Ordnerkonvention.
- **Schritte:** die wirksamen Werte aus `profiles/shinon/cordis.patch.yml` (Modellroute, Permission, Task-Router, Index, UI-Schicht) in Code/Config überführen, danach 2.2.
- **Abnahme:** gleiche wirksame Konfiguration; Altdateien archiviert.
- **Nachweis:** Konfigurationsvergleich vor/nach.
- **Risiko:** hoch / hoch (Ladeordnung).
- **Abhängig von:** 3.3
- **Status:** **angehalten** — hängt an 3.3 und würde `profiles/` genau dann umbauen, wenn ein fremder Boot daraus liest und schreibt.

### 3.7 (D7) Build- und Gate-Ballast
- **Ziel:** genau ein Testeinstieg, ohne pnpm.
- **Schritte:** nach A5 kritische Gates behalten; `build.mjs`, `pack-test`, `validate-test`, `commit-guard`, Githooks, `dist/` inventarisieren und bewerten.
- **Abnahme:** ein dokumentierter Testeinstieg, der ohne pnpm läuft.
- **Nachweis:** Befehl plus Exit-Code.
- **Risiko:** mittel / mittel.
- **Abhängig von:** A5, 3.5
- **Status:** **der messbare Teil ist erledigt** (2026-10-11) — der eine dokumentierte Testeinstieg existiert und läuft **ohne pnpm**: `npm test` unter `env -i` mit einem PATH **ohne `pnpm` und ohne globales `dsh`** (Node v22.23.3, npm 10.9.9) → Codingmon **32/32** → Gate **100/0** → Fixtures **9/0** → Distribution **76/0** → Profiltest **3/0**, **Exit 0** (dasselbe unter Node v18 bleibt Umgebungs-Rot an der Codingmon-Naht, siehe `docs/ZAHLEN.md` §2). Bestandsaufnahme für A5 mitgemessen: fünf Läufe in der Kette, daneben `gate`/`gate:full` (18 Gates), `gate:test` (327), `build`, `branding`, `commit:guard`. **Die Bewertung** (welche Gates bleiben) hängt an A5 und ist hier nicht entschieden. Nachweis: [docs/archive/PAKETQUELLE_NPM_3-5.md](docs/archive/PAKETQUELLE_NPM_3-5.md) §6.

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
- **Nachweis:** geplant: `docs/audit/LIVE.md`.
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
- **Status:** **erledigt im Arbeitsbaum** (2026-10-11) — der Vollname ist aus Produktcode und UI-Texten: Kopfzeile `packages/core/index.js`, `meta.description` in `packages/core/package.json` und `packages/locale-de/package.json`. Übrige Treffer sind begründet (Fork-Aussage in `README.md`/`AGENTS.md`, Upstream-Doku-Links, Audit-Dokumente); `grep -rn -i 'DeepSeek Harness' packages/ profiles/ scripts/` → 0 Treffer. Beleg: `docs/archive/UMBAU_2026-10-11.md` §4

### 3.12 (A4) `key-router`, `narrative`, `popup` aktivieren
- **Ziel:** die drei Pakete tun im Profil etwas Nützliches, nicht nur „aktiviert" sein.
- **Schritte:** `key-router` um ausgehende Provider-Konfiguration erweitern (OpenAI-kompatibler `baseURL` je Anbieter, Protokoll `openai-completions`/`openai-responses`, `/models`-Abfrage, Verbindungstest); `narrative` ins Profil aufnehmen; `popup` mit einem echten, übersetzten Fortschritts-Overlay versehen (der Client rendert heute nichts); `shinon-forge` bewerten (fremde Tool-Spawns).
- **Abnahme:** die drei Pakete laden im Profil und leisten ihre Funktion; `shinon-forge` ist bewertet, nicht still aktiviert.
- **Nachweis:** Profillauf plus Testläufe je Paket.
- **Risiko:** hoch / mittel (`popup` war nie ein Renderer; `key-router` speichert Key-Material im Prozessspeicher).
- **Abhängig von:** 1.1, 3.6
- **Status:** **teilweise erledigt (2026-10-13).** `narrative` war seit Zug 5 im Profil, hatte aber **keinen Abnehmer** — der Composite ging ins Leere. Das ist geschlossen: die Persona hört auf `shinon/narrative/state` und rendert `shinon:narrative-arc` (der eigene `mood` bleibt maßgeblich, der Composite wird nicht hineingemischt); Kanal- und Vertragsname sind als Zwillinge in `scripts/lib/repo.mjs` gepinnt, das Gate `narrative` und `scripts/gate/tests/narrative.test.mjs` prüfen die Verdrahtung. `shinon-forge` ist **bewertet** (§3.12.1). **Nachtrag (2026-10-13, zweiter Durchgang): beide Punkte sind gebaut, und der Rest ist benannt.**

**`popup` rendert jetzt.** Der Befund war schlimmer als „nicht aktiviert": der Client sagte in
seinem eigenen Kopf, dass er nichts rendert, und malte einen `<style>`-Block für Klassen, die
niemand benutzt. Gebaut ist ein echtes Overlay im Slot `conversation.composer.dock`:
`packages/popup/assets/trajectory-core.js` faltet das Ereignisfenster der SITZUNG (der Client kann
keinen Host-Endpunkt registrieren — `uiSession` → `sessions.binding(id)` → `eventSource`, derselbe
Weg wie `@shinon/token-usage`), die Client-Hälfte trägt dieselbe Faltung als **bytegleiche Region**
(Zwilling in `scripts/lib/repo.mjs`), den Text liefert `@shinon/locale-de` (`popup.running`, Zahlen
als Platzhalter), und `scripts/gate/tests/popup-overlay.test.mjs` prüft die Naht (Profil-Slot =
Client-Literal = Host-Default), das Wörterbuch und das gerenderte Ergebnis.

**`key-router` hat jetzt einen Sicherheitsvertrag.** Gemessen am alten Stand: drei Werkzeuge gaben
`key.slice(0, 8) + '…'` zurück und jede Log-Zeile trug ein Präfix — was ein Werkzeug zurückgibt,
landet im Kontext des Modells. Jetzt: das Schema hat **kein** Schlüsselfeld (Namen aus der Umgebung,
nie Werte; die Profildatei ist versioniert), nach außen geht nur der Poolplatz (`key#1`), jeder
Log-Aufruf läuft durch `redact`, die Werkzeuge hängen an `ctx.inject(['tools'], …)` — ohne das wirft
der Cordis-Proxy und die Aktivierung stirbt —, und der Verbindungstest setzt den Schlüssel
ausschließlich in die Kopfzeilen. Belegt von `packages/key-router/test/pool-core.test.mjs` (11) und
`scripts/gate/tests/key-router-security.test.mjs` (6, inklusive Kanarienvogel-Schlüssel durch das
ausgelieferte Paket).

**ERLEDIGT (2026-10-13):** der Provider-**OVERRIDE** des Key-Routers ist gebaut — `createResolveOverlay` in `packages/key-router/assets/pool-core.js` bedient die verwalteten `envNames`-Referenzen aus dem Pool (`{ value, source: 'pool' }`), alles andere erreicht das Original; `agent/request-error` deckelt nach `RATE_LIMIT` den bedienten Platz, `llm-retry` behält die Wiederholungs-Entscheidung. Belegt von `packages/key-router/test/pool-core.test.mjs` (17) und `scripts/gate/tests/key-router-override.test.mjs` (3, inklusive Kanarienvogel-Schlüssel durch das ausgelieferte Paket). Was dabei NICHT gemessen ist: eine echte 429-Rotation gegen die laufende Route (zwei echte Schlüssel, erzwungener 429) — benannt in `docs/ZAHLEN.md` §4, nicht behauptet. Gemessen ist dagegen die Rotation auf dem Draht: `scripts/gate/tests/key-router-wire.test.mjs` fährt echtes `fetch` gegen einen Loopback-Stub und beweist, dass der Request mit dem gewählten Schlüssel läuft und nach 429 mit dem anderen (Mutationsprobe inklusive). `baseUrl` im Profil bleibt **gespiegelt** (Gate-Test vergleicht sie mit dem `agnes`-Anbieter der Route), damit der Verbindungstest denselben Host fragt wie der Lauf.

#### 3.12.1 Verdikt `shinon-forge` (A4: „bewerten", 2026-10-13)

**Ergebnis: `shinon-forge` bleibt `inactive`. Das ist ab jetzt ein Verdikt, kein Versehen.**

Gemessen an `packages/shinon-forge/index.js` (580 Zeilen):

- Es ist das **einzige** Paket dieses Repos, das `node:child_process` importiert (`grep -rln child_process packages/*/index.js` → genau 1 Treffer).
- Es führt eine Engine-Tabelle mit **neun fremden CLIs** (`claude`, `codex`, `agy`, `muse`, `hermes`, `pi`, `cline`, `grok`, `freebuff-app`) und startet sie per `execFile`.
- Es registriert **fünf Werkzeuge** (`ctx.tools.register`, Zeilen 546–550) und einen **Intervall-Daemon** (`startRunner`/`stopRunner`, `setInterval` in Zeile 274).
- Es liest und schreibt außerhalb des Repos (`~/.agents/notion-agent/memory-sync.mjs`, dazu eine Heartbeat-Datei).

Der Kern: **es ist kein DSH-Plugin, sondern eine Bedienerschicht (Operator).** Jede Zusage, die dieses Repo für seine Profil-Plugins pinnt — beobachten statt handeln, keine Uhr, kein fremder Spawn, keine Tool-Registrierung — verletzt es **absichtlich**, weil genau darin sein Zweck liegt. Ein Aktivieren wäre deshalb kein Konfigurationsschritt, sondern eine Umwidmung mit eigenem Sicherheitsvertrag (welche Kommandos, welches `cwd`, welche `env`, wer sieht die Ausgabe, was passiert bei Abbruch) — dieselbe Aufwandsklasse wie der Provider-Teil von `key-router`.

**Damit ist der Passus aus 3.12 („`shinon-forge` ist bewertet, nicht still aktiviert") erfüllt.** `dsh.inactive: true` bleibt die ehrliche Aussage, bis dieser Vertrag steht.

### 4.1 (F1) Messung unter Linux
- **Ziel:** entscheiden, ob der Browser der Engpass ist (Tor zu Phase 8).
- **Schritte:** RSS der Engine im Leerlauf und während einer Agent-Runde (`ps -o rss= -p <PID>`); Chromium-Tab gegen Upstream-Electron und ggf. Tauri.
- **Abnahme:** Tabelle mit Befehlen und Rohwerten.
- **Nachweis:** geplant: `docs/audit/MESSUNG.md`.
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
- **Nachweis:** geplant: `docs/audit/BENCHMARK_DSH.md`.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 4.2, A8
- **Status:** offen

### 4.5 (H4) Shinon-Konfiguration messen
- **Ziel:** dasselbe Set gegen die Shinon-Konfiguration.
- **Abnahme:** Rohdaten je Aufgabe.
- **Nachweis:** geplant: `docs/audit/BENCHMARK_SHINON.md`.
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
- **Schritte:** XP an neue, vom Host bestätigte `turn/end`-Ereignisse mit `reason=completed` koppeln; `agent/status`-Wechsel und Tokenzähler sind keine Erfolgsquelle. `xpPerToken` ist entfernt, weil Tokenmenge Kosten/Usage und nicht erfolgreiche Arbeit misst.
- **Abnahme:** der Host zählt nur `turn/end` mit `reason=completed`; Codingmon-Tests beweisen: Status/Token allein geben 0 XP, ein neuer erfolgreicher Abschluss gibt genau 1 XP, Abbruch/Fehler geben 0.
- **Nachweis:** `packages/codingmon/test/durchstich.test.mjs` und `packages/codingmon/test/uebergabe.test.mjs`.
- **Risiko:** mittel / mittel.
- **Abhängig von:** 6.2
- **Status:** **erledigt im Arbeitsbaum** (2026-10-13) — `npm run test:codingmon` 46/46, Exit 0; DOM-Token-Quelle und `xpPerToken` entfernt. Der Host zählt nur `turn/end` mit `reason=completed`; `running → idle`, Token-only, Abbruch und Fehler geben kein XP, eine neue Completion genau 1 XP.

### 6.5 (J5) §19 `LAST_VERIFIED_FACT` auswertbar machen
- **Ziel:** der Feldwert benennt einen belegten, zuletzt verifizierten Fortschritt statt leer zu bleiben oder aus Modelltext geraten zu werden.
- **Schritte:** Der **Loop Guard / Progress Evaluator** ist der alleinige Produzent des Feldes. Er wird durch `turn/end` aufgerufen, wertet nur einen erfolgreich abgeschlossenen Turn aus und übernimmt `LAST_VERIFIED_FACT` ausschließlich aus der vom Evaluator geprüften, herkunftsgebundenen Evidenz (z. B. verifizierter Gate- oder Workspace-Befund); Modelltext ist nie Quelle. Bei fehlender oder widersprüchlicher Evidenz bleibt das Feld leer.
- **Abnahme:** Gate-Test pinnt den Produzenten `Loop Guard / Progress Evaluator`, das Ereignis `turn/end` mit `reason=completed`, den Evidenz-Quellnachweis und die Herkunftsbindung; ohne Ereignis, bei Abbruch/Fehler, fehlender oder widersprüchlicher Quelle oder Mutation auf Modelltext darf kein Fakt erscheinen.
- **Nachweis:** neuer §19-Gate-Test plus Tests der Loop-Guard-Projektion; Implementierung ist v0.5.0-Arbeit.
- **Risiko:** hoch / mittel — unbelegte Selbstbehauptung würde als verifizierter Fakt ausgegeben.
- **Abhängig von:** Task-Router §18 und §19 Loop Guard im Implementierungsplan.
- **Status:** geplant für v0.5.0

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

## 9. Abnahme je offener Funktion (vorab festgehalten, 2026-10-13)

**Warum diese Tabelle existiert:** eine Abnahme, die erst nach dem Bauen formuliert
wird, beschreibt hinterher immer, was gebaut wurde. Die folgenden Zeilen stehen
**vor** der Arbeit fest — je Funktion ein Satz, der entweder wahr oder falsch ist,
mit dem Ding, an dem man es sieht. Wer eine Zeile ändert, ändert sie hier (und
nennt den Grund), nicht in einem Bericht.

Ebenfalls festgehalten: **welche Funktionen NICHT offen sind.** `key-router` und
`popup` sind gebaut, gepinnt und aktiv (§3.12); ihre Kernfunktionen, Sicherheits-
verträge und Tests sind am 2026-10-13 gemessen (29 Paket-Tests + 15 Gate-Tests,
grün) — die Forderung „erst aktivieren, wenn Kernfunktion, Sicherheitsvertrag und
Tests VOLLSTÄNDIG sind" ist damit erfüllt und keine Absichtserklärung mehr.

| # | Funktion | Abnahme (prüfbar) | Wo man es sieht |
|---|---|---|---|
| 1.1 | Node ≥ 22 für die Läufe | `engines` erlaubt die laufende Fassung, und die ganze Kette (`npm test`) läuft mit Node 22 auf **Exit 0** | `node -p "JSON.stringify(require('./package.json').engines)"` + `npm test` |
| 1.2 | `schemastery` auflösbar, keine Versionsmischung | `require.resolve` aus dem Root gelingt **und** die aufgelöste Fassung ist semver-gleich der deklarierten | `node -p "require('./package.json').dependencies['@deepseek-ai/schemastery']"` gegen `require.resolve` |
| 1.5 | Commit `487c559` bewerten | ein geschriebenes Verdikt mit Inhaltsdiff: was er ändert, ob es hier noch gilt, ob er übernommen/verworfen wird | neues Nachweis-Dokument unter `docs/audit/` |
| 3.6 | `profiles/` durch Code-Konfiguration ersetzen | der Boot mit `resolvedProfile` liefert **dieselben** Layer-Köpfe und Einträge wie der Profil-Boot (Vergleich beider Zählungen, nicht ein grüner Exit) | `--dump-config` gegen den Spike aus §3.3 |
| 3.8 | Overlay-MVP | die drei offenen Punkte aus `UPSTREAM_DIFF` §5.2 sind **entschieden** (je einer: Slot-Definition, Launcher-only-Patch, Remote-Listen-Extensibilität), und die UI zeigt die Marke im genannten Slot | Entscheidungstabelle + ein Lauf mit `npm run dev` |
| 3.9 | Live-Verifikation | **ein** echter Modell-Turn gegen die Route `agnes/agnes-3.0-flash` mit Protokoll (Boot, Urteil, Widerruf, Host-Ende, Neustart) und ohne Schlüsselwert im Text | Protokoll unter `docs/probes/` |
| 3.10 | Docs reduzieren | eine benannte Zielliste mit der Zählung **vorher/nachher** und je gestrichenem Dokument der Grund; keine Zahl ohne Befehl | `docs/ZAHLEN.md` §1 |
| 4.1 | Messung unter Linux | RSS-Tabelle der Engine im Leerlauf **und** während einer Runde, plus Browser-Vergleich (Chromium gegen Electron), je mit Befehl und Rohwert | geplant: `docs/audit/MESSUNG.md` |
| 4.2 | Aufgabenset | 20–30 Aufgaben, jede mit Ausgangszustand und **maschinell prüfbarem** Ergebnis | `benchmarks/` + Aufgabenliste |
| 4.3 | Metriken | Erfolgsquote, Erfolg je Token, Zeit und Fehlversuche sind **aus einem Lauf berechenbar** (ein Auswertungsskript liegt vor und rechnet sie) | Metrikdokument + Skript |
| 4.4 | DSH-Baseline | Rohdaten **je Aufgabe** mit demselben Modell auf demselben Set | geplant: `docs/audit/BENCHMARK_DSH.md` |
| 4.5 | Shinon-Konfiguration messen | dieselbe Form, dieselben Aufgaben — Rohdaten je Aufgabe | geplant: `docs/audit/BENCHMARK_SHINON.md` |
| 4.6 | Feature-Entscheidung | je Feature (Prompt-Enhancer, Task-Router, Index) eine Entscheidung mit dem Messwert, der sie trägt; „behalten" ohne Zahl gilt nicht | Entscheidungstabelle in `docs/audit/` |
| 6.1 | Persistenz zuerst | ein geschriebener Stand **überlebt einen Neustart** (Test, der wirklich neu startet — nicht nur neu liest) | Testlauf mit Exit-Code |
| 6.2 | Ereignis-Adapter | der Adapter hängt an `agent/status`, `llm/response`, `llm/error` und **zählt** echte Ereignisse aus einem Lauf; die Aktivierung aus §3.12 ist Voraussetzung und liegt vor | Testlauf mit Zählung |
| 6.3 | Balancing an erfolgreichen Schritten | XP kommen aus neu bestätigten `turn/end`-Ereignissen mit `reason=completed`; Tokens, Statuswechsel, Abbruch und Fehler geben kein Completion-XP | `packages/codingmon/test/` |
| 6.5 | §19 `LAST_VERIFIED_FACT` | Loop Guard / Progress Evaluator erzeugt das Feld nur nach erfolgreicher Evidenzbewertung eines abgeschlossenen Turns; Gate pinnt Ereignis, Produzent, Herkunft und fail-closed-Fälle | v0.5.0: neuer §19-Gate-Test |
| 6.4 | Kampf abbrechbar | ein Spielende beendet den Kampf; der Test belegt das Ende (nicht nur den Abbruch) | Testlauf |
| 7.1 | Bedienung | drei Standardaufgaben ohne Doku erledigt; jede Fehlermeldung nennt den nächsten Schritt; die internen Begriffe (Profil, Gate, Slice, Stub) stehen nicht mehr in der UI | Protokoll des Erstlaufs |
| 7.2 | Lokalisierung | kein sichtbarer Text kommt aus einer Fallback-Tabelle; ein Gate-Test wird bei einem hartkodierten Text **rot** (Negativprobe, sonst beweist er nichts) | Gate-Test mit Zählung |
| 7.3 | QoL | eine Liste mit Status je Punkt im Repo; jeder Punkt ist gelöst oder **bewusst verworfen**, keiner offen ohne Grund | `docs/quality/QOL.md` (neu) |
| 7.4 | Design aus Tokens | keine festen Farbwerte in Shinon-Flächen — belegt durch einen Grep, der bei einem eingebauten Farbwert rot wird, plus Screenshots vorher/nachher | Screenshots + Grep |
| 5.1–5.3 | Desktop-Spike, Shell-Protokoll, Single-Binary | **gegated durch 4.1/A10** — solange die Messung den Browser nicht als Engpass belegt, wird hier nichts gebaut; die Abnahme bleibt der Wortlaut oben | `PLAN.md` §4.1 |
| 8.1–8.4 | Engine-Port | **gegated durch 4.1** (positiv) und E1–E3 (Verträge eingefroren): identisches Ergebnis je Kern gegen die Replay-Fixtures | Fixture-Läufe alt/neu |

---

## 9.1 Release-Freeze v0.4.0 — Slice-Abnahme (2026-10-17)

**Die Entscheidung** steht in [docs/ROADMAP.md](docs/ROADMAP.md) §1.5 (kanonisch):
v0.4.0 unterstützt genau den **Quellklon** (`git clone`, `npm ci`,
`npm run profile:links`, Profil-Dump, UI-Start, `shinon doctor` read-only).
`shinon update`, persistentes `shinon autoupdate`, `.deb`, Live-429-Rotation mit
zwei echten Schlüsseln, Mobile/Android, Desktop-Shell, Rust-/Single-Binary-Port,
Vollbenchmark und QoL Top 10 sind **kein** v0.4.0-Umfang; sie stehen als
Folgearbeit in derselben Roadmap. Ein Feature-Wunsch erweitert den Freeze nicht.

Ein Punkt zählt erst als erledigt, wenn **Befehl, Exit-Code und Ergebnis**
dokumentiert sind; die gemessenen Zahlen stehen in `docs/ZAHLEN.md` §2, nicht
hier. Code, der die Zusage erfüllt, aber keinen belegten Lauf hat, ist offen.

| Slice | Pflicht (Abnahme) | Beleg |
|---|---|---|
| S0 Freeze | Freeze in Roadmap + dieser Tabelle; historische Arbeitsbaum-Regeln oben als HISTORISCH markiert; v0.5.0-Liste nennt Selbstupdate, Autoupdate, `.deb` | diese Datei + `docs/ROADMAP.md` §1.5/§3 |
| S1 Workspace | Prompter und Project Index beantworten dieselbe Workspace-Frage; fremde Root wird abgelehnt, `..`/Symlink-Ausbruch gestoppt, Veraltetes entfernt — und jede dieser Proben wird bei einer Mutation rot | `npm run test:prompter`, `npm run gate:test` (Mutationsprobe im Commit-Text) |
| S2 Kontext | Eine Quelle je Schritt; Budget vor dem Modellaufruf; Provenienz (Workspace, Quelle, Pfade, Budget) im Entscheidungsdatensatz, ohne Prompt-Text und ohne Schlüsselwerte | `npm run test:prompter` + Gate-Tests |
| S3 Quellklon | Frischer Klon ohne globales DSH: `npm ci` → `npm run profile:links` → Profil-Dump → UI-Start, nur mit den dokumentierten Befehlen | **Belegt 2026-10-17:** Klon von Branch `freebuff/f12cb7d008d4b72f5ee5f65c` @ `dd18824` nach `/tmp`: `npm ci` Exit 0, 29 Links Exit 0, Dump 60/210 Exit 0, UI-Start bis `dsh web:` (Exit 124 = Timeout nach Boot), doctor ok Exit 0, gate 544/544, statisch 117/117 — siehe `docs/S3-FRESHCLONE-2026-10-17.md`. HTTP-200-Nachweis auf `main` @ `c30112c` (Klon, Build, UI mit 41 314 Bytes HTML, Gates 544/544) — siehe `docs/S3-FRESH-2026-10-17.md`; wiederholt auf aktuellem Stand `d8999ab` (Build 185 Dateien, UI HTTP 200, Gates 546/546) — siehe `docs/S3-FRESH-d8999ab.md`. |
| S4 Doctor | `shinon doctor` ist als Laufzeit-Unterbefehl implementiert und read-only (Filesystem-Snapshot vor/nach gleich), stabile Exitcodes, Presence-only für Schlüssel | **Belegt 2026-10-17:** eigener Unterbefehl in `bin/shinon.mjs` (Route auf `scripts/doctor.mjs`, nie an DSH durchgereicht); read-only bezeugt (`git status --porcelain` vorher/nachher gleich, kein Schreibaufruf in der Quelle); Exit 0/1/2 stabil; Schlüssel presence-only. Test `scripts/gate/tests/doctor-cli.test.mjs` 6/6, `npm run gate:test` 546/546, Probelauf `node bin/shinon.mjs doctor` Exit 0/status ok; Hilfe (Exit 0) und zwei Fehlerpfade (Exit 2, fail-closed) live belegt — siehe `docs/S4-DOCTOR-2026-10-17.md`. |
| S5 Schranke | Alle Gates grün, Version/Tag/Lock konsistent, Quellarchiv + SHA-256, idempotent, minimale Publish-Rechte | **Teils belegt 2026-10-17:** Workflow `.github/workflows/release.yml` (Tag `v*`, nur `contents: read`, kein Publish), Lockfile konsistent, Archiv 2× byte-identisch (SHA-256 `e6cb6e0c…`, 572 Dateien) — siehe `docs/S5-RELEASE-2026-10-17.md`. Offen: Tag `v0.4.0` + Schranken-Lauf darauf (Release-Akt, S6-Freigabe). |
| S6 Go/No-Go | Echter Modellturn mit lokalem Schlüssel (3.9), Security-/Dependency-Audit, finale Doku, CI-Run-ID | `docs/probes/`, Release-Notes |

**Ist-Stand:** S0–S3 sind belegt (S3: Frischklon @ `d8999ab` mit HTTP-200-Beleg, `docs/S3-FRESH-d8999ab.md`); S4 ist belegt (`shinon doctor`-Laufzeit-Unterbefehl, Test 6/6, Probelauf Exit 0, Hilfe + Fehlerpfade). S5/S6 sind nicht als
Release-Abnahme belegt. Der Paketwert `0.4.0` und ein Freeze-Dokument ersetzen diese
Abnahme nicht.

**Reihenfolge:** S0 → S1 → S2 → S3 → S4 → S5 → S6. Kein Slice zieht Arbeit aus
v0.5.0 vor, auch nicht „schnell zwischendurch“.

---

## Risiken gesamt

| Risiko | W. | Wirkung | Umgang |
|---|---|---|---|
| `docs/`-Migration bricht Gate- und Testpfade | hoch | mittel | Zielliste aus `STAND` §6.1, Referenzliste §6.3, Prüfbefehl `defekt 0` |
| npm-Umstellung: `workspace:*` und Lockfile | hoch | hoch | semver-Ranges, Lockfile neu erzeugen, isolierter Install testen |
| alpha.2-Theme-Erweiterung bricht das Overlay | mittel | mittel | `UPSTREAM_DIFF` §2; am Quelltext lesen, nicht aus Bytes schließen |
| Downgrade/Upgrade der DSH-Fassung (lokal alpha.1, Ziel alpha.2) | mittel | hoch | erst 3.2, dann Pin anpassen; keine Versionsmischung |
| `popup` hat keinen Renderer | hoch | niedrig | **erledigt (2026-10-13):** echtes Overlay + Zwillings-Region + Gate-Test (§3.12) |
| `key-router` hält Key-Material im Prozessspeicher | mittel | hoch | **erledigt (2026-10-17):** Vertrag steht — kein Schlüsselfeld im Schema, nur Poolplätze nach außen, jeder Log durch `redact`, Kanarienvogel-Test; der Provider-Override ist bis zum Loopback-Draht belegt. Offen bleibt nur die Live-429-Rotation gegen den echten Anbieter mit echten Schlüsseln (`docs/ZAHLEN.md` §4). |
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
