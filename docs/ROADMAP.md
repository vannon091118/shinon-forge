# Roadmap — wohin das Repo geht

> **Status:** plan — die einzige Liste offener Arbeit: Release-Ziele, Abnahmen, zurückgestellte Punkte. **Stand:** 2026-10-18
> **Einstieg:** `AGENTS.md` · **Zahlen:** `docs/ZAHLEN.md`

Regeln dieser Datei: kein Punkt ohne Abnahme (Befehl oder beobachtbares Ergebnis),
keine Zahl außer Datum und SHA (Bestand und Messungen stehen ausschließlich in
`docs/ZAHLEN.md`), keine erledigte Arbeit (die steht in `docs/TAGEBUCH.md`).
Ein Punkt zählt als erledigt, sobald Befehl, Exit-Code und Ergebnis in einem Beleg
stehen — Code ohne belegten Lauf ist offen. `UNGEPRÜFT` ist kein Pass.

## 1. Versionsordnung (eine Regel, zwei Zeilen)

- **Root** (`package.json`, Lock-Kopf in `package-lock.json` trägt denselben Wert):
  Semver auf der `0.x`-Linie. **Minor** = ein Feature-Batch mit neuen Zusagen und
  neuen Tests. **Patch** = Korrekturen und Doku ohne neue Zusagen. Ein Bump ist ein
  Commit wie jeder andere: mit Trailer, Wächter und grünem CI-Lauf — kein Nebenkanal.
- **Pakete** (`packages/*/package.json`): genau zwei Zeilen, und sie werden
  **nicht** einzeln gebumpt. `1.0.0` für ausgelieferte Pakete, `0.1.0` für
  Vorbereitung (`dsh.inactive` im eigenen Manifest) — entschieden vom Paket
  selbst, geprüft vom `doctor` (`scripts/gate/plugins/doctor.mjs`).

## 1.5 Release-Freeze v0.4.0 (kanonische Entscheidung, 2026-10-17)

**Release-Umfang eingefroren:** Wenn `v0.4.0` freigegeben wird, unterstützt es genau
einen Installationsweg — den **Quellklon** (`git clone`, `npm ci`,
`npm run profile:links`, Profil-Dump, UI-Start und `shinon doctor` read-only).
Der Freeze ist eine Entscheidung, kein Messwert: **kein Feature-Wunsch wird
nachträglich in v0.4.0 gezogen.** `shinon update`, persistentes
`shinon autoupdate`, `.deb`, Live-429-Rotation mit zwei echten Schlüsseln,
Mobile/Android, Desktop-Shell, Rust-/Single-Binary-Port, Vollbenchmark und
QoL-Top-10 sind **kein** v0.4.0-Umfang.

**Werkzeuge im Baum, außerhalb des Urteils:** `scripts/install-user.mjs` (`npm run
install:user`), `npm run verify:install` und `scripts/backup-retention.mjs`
existieren als Bediener-Werkzeuge mit eigenen Gate-Tests — sie sind noch kein
belegter Release-Installationsweg. Namensgrenze: `npm run install:user update`
pflegt ein Nutzer-Installat, `npm run update` prüft den DSH-Upstream —
`shinon update` (Forge-Selbstupdate) bleibt Folgearbeit.

**Reihenfolge:** S0 → S1 → S2 → S3 → S4 → S5 → S6. Kein Slice zieht Arbeit aus
v0.5.0 vor, auch nicht „schnell zwischendurch“.

### Slice-Abnahmen (Pflicht, Abnahme, Beleg, Stand)

| Slice | Pflicht (Abnahme) | Beleg | Stand |
|---|---|---|---|
| S0 Freeze | Freeze dokumentiert; v0.5.0-Liste vollständig | diese Datei (§1.5, §2) | belegt |
| S1 Workspace | Prompter und Project Index beantworten dieselbe Workspace-Frage; fremde Root abgelehnt, `..`/Symlink-Ausbruch gestoppt, Veraltetes entfernt — jede Probe wird bei Mutation rot | `npm run test:prompter`, `npm run gate:test` | belegt |
| S2 Kontext | Eine Quelle je Schritt; Budget vor dem Modellaufruf; Provenienz (Workspace, Quelle, Pfade, Budget) im Datensatz, ohne Prompt-Text und ohne Schlüsselwerte | `npm run test:prompter`, Gate-Naht `context-wiring`, `docs/probes/index-konsolidierung.json` | belegt |
| S3 Quellklon | Frischer Klon ohne globales DSH: nur die dokumentierten Befehle bis zum UI-Start | `docs/TAGEBUCH.md`, 2026-10-17 (`d8999ab`) | belegt |
| S4 Doctor | `shinon doctor` als Laufzeit-Unterbefehl, read-only, stabile Exitcodes, Schlüssel nur als Anwesenheit | `docs/TAGEBUCH.md`, 2026-10-17 (`dd18824`) | belegt |
| S5 Schranke | Alle Gates grün, Version/Tag/Lock konsistent, Quellarchiv + SHA-256 | `docs/TAGEBUCH.md`, 2026-10-17 (`c30112c`) | teils — **offen:** Tag `v0.4.0` + Schranken-Lauf darauf |
| S6 Go/No-Go | Echter Modellturn mit lokalem Schlüssel, Security-/Dependency-Audit, finale Doku, CI-Run-ID | `docs/TAGEBUCH.md`, 2026-10-17 (`4db4006`) | **offen** — Audit grün, CI-Run rot (Ursache offen), Modellturn offen |

## 2. Offene Punkte (vollständig — alles andere ist Folgearbeit oder zurückgestellt)

### 2.1 v0.4.0-Rest (Release-pflichtig)

- **S5-Schluss:** Tag `v0.4.0` setzen, Schranken-Lauf darauf (Workflow, Tag, Archiv) — erst dann ist S5 belegt.
- **S6-Schluss:** echter Modellturn mit lokalem Schlüssel (Boot, Urteil, Widerruf, Host-Ende, Neustart, ohne Schlüsselwert im Text; Protokoll unter `docs/probes/`), finale Doku, CI-Run-ID des Release-Bumps.

### 2.2 v0.5.0-Kandidaten (keine Versprechen — was landet, entscheidet der Betreiber)

- Live-429-Rotation gegen den echten Anbieter mit echten Schlüsseln (Kette bis zum Loopback-Draht ist belegt).
- Mobile-first-Prototyp: eigenes schlankes Mobile-Profil, responsive Client-Schicht, Profil-/UI-/Security-CI-Gates, validierte Android-Runtime-Strategie (Details aus dem gefalteten Mobile-Plan: zuerst Profil + Web-UI im Repo, App-Shell erst nach reproduzierbarem Android-Proof; kein globaler Paket-Cut vor Messung; Fremdvergleich `dsh-io/dsh-mobile` als Spike prüfen).
- `LAST_VERIFIED_FACT` (§19): Loop Guard / Progress Evaluator als alleiniger Produzent, Gate pinnt Ereignis, Produzent, Herkunft und fail-closed-Fälle.
- Codingmon-Folge: Ereignis-Adapter an echten Lauf-Ereignissen (6.1/6.2-Rest), Kampfende am Agent-Ende (6.4).
- Bedienung ohne Doku (7.1), Lokalisierung ohne Fallback-Tabellen (7.2), QoL-Liste mit Status je Punkt (7.3, wartet auf die Nutzerliste), Design aus Token-Datei (7.4).
- Scoring-Folge: K8 Fakten-Store (Konsolidierung, hartes Limit; Ablage liegt bereit), K7b taktische Skill-Erzeugung (Schreibweg bricht K4 — braucht Entscheidung; Ablage `generated-skills/` steht).
- `profiles/`-Umbau auf Code-Konfiguration (3.6) — nur wenn ein fremder Boot daraus liest/schreibt; derzeit angehalten.
- Overlay-MVP (3.8) — blockiert, bis die drei Upstream-Punkte entschieden sind (Slot-Definition, Launcher-only-Patch, Remote-Listen-Extensibilität).
- Onboarding (Eignerentscheidung): keine fest verdrahteten Modell-/Provider-Defaults — der Nutzer entscheidet beim Einstieg, ob der Prompter dasselbe Modell und denselben Schlüssel nutzt oder eigene; Anker ist die DSH-seitige API-Key-Abfrage beim First-Start.
- Persona-Einstieg teilen (Voraussetzung, nicht der Schnitt): `packages/persona/index.js`
  hält 1526 Zeilen und 18 `let`-Bindungen in EINEM `apply`-Closure — der Prompter-Schnitt
  (2026-10-20) ging, weil dort schon ein `runtime`-Objekt der alleinige Zustand war. Hier
  steht zuerst der Zustands-Eigentümer auf dem Programm; erst danach dieselbe Teilung.
- Architektur-Folge aus dem Audit: Workspace-Twin zusammenlegen (C3), Prompt-Schichten zu einem Assembler (C4), `preset shinon` statt `cordis`, Katalog-Snapshot statt Einzelprüfungen (P2).
- Vendor-Baum zu Hash-Manifest verdichten (B5); `.session-eval/`-Zweck klären (B7-Rest; K5-Offenpunkte aus dem Report: Scope-Erkennung, Fehler-Turn-Signal, K7a-Kopplung — siehe Archiv).

### 2.3 Zurückgestellt (gated — wird erst bei erfüllter Bedingung gebaut)

- Benchmarks und Metriken (4.1–4.6): Aufgaben-Set, DSH-Baseline, Shinon-Messung, Feature-Entscheidung mit Messwert.
- Desktop (5.1–5.3, A10): Tauri-Shell, Shell-Protokoll, Single-Binary — Stufe 1 (`npm run open`) ist scharf; der Rest wartet auf die Engine-Messung und die A10-Entscheidung (Electron vs. Tauri vs. TUI).
- Engine-Port (8.1–8.4): nur bei positivem 4.1-Befund und eingefrorenen Verträgen.
- Commit `487c559`-Bewertung: gegenstandslos — der Stand ist committet und gemessen (siehe `docs/TAGEBUCH.md`, 2026-10-10); ein Verdikt über einen Arbeitsbaum von 2026-10-10 baut nichts mehr.

## 3. `1.0.0`-Kriterien

`1.0.0` heißt: jedes Profil-Paket ist ausgeliefert (kein `dsh.inactive` ohne
begründetes Verdikt), der Task-Router ist per H5 entschieden, die
Live-Verifikation 3.9 ist grün belegt, und die Branch-Regel im Wächter
(`scripts/commit-guard.mjs`) ist scharf — nicht nur gebaut.

## 4. Was kein Release ist

Kein einzelner Commit, keine grüne Momentaufnahme ohne Run-ID, keine Doku ohne
Messbefehl. Wer eine Fassung behauptet, nennt Commit-SHA, CI-Run-ID und den
lokalen Gate-Exit — alles andere ist ein Wunsch mit Versionsnummer.
