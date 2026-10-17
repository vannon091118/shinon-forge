# Dokumentation — Einstieg und Statusregel

> **Status:** current — **einziger Einstieg** in die Dokumentation. **Stand:** 2026-10-17
> **Zahlen:** `docs/ZAHLEN.md` (einziger Eigentümer harter Zahlen)

## 1. Womit man anfängt

| Frage | Datei |
|---|---|
| Was ist das, wie startet man es? | [`README.md`](../README.md) |
| Wie baue ich ein Paket, was darf hinein? | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) |
| Regeln für Agenten in diesem Repo | [`AGENTS.md`](../AGENTS.md) |
| Wie sind Commits aufgebaut? | [`docs/COMMIT-REGELN.md`](COMMIT-REGELN.md) |
| Welche CI-Zweige laufen, welcher Name ist verpflichtend? | [`docs/CI.md`](CI.md) |
| **Wie viele** Pakete, Layer, Tests? | [`docs/ZAHLEN.md`](ZAHLEN.md) |
| Wohin geht es, was kostet ein Release? | [`docs/ROADMAP.md`](ROADMAP.md) |
| Wie werden Mobile-Profil, responsiver Prototyp, Ballastabbau und Android-Shell geplant? | [`docs/MOBILE-PLAN.md`](MOBILE-PLAN.md) |
| Was ist belegt, was nur gemessen-rot? | `docs/probes/`, `docs/contracts/` + `docs/ZAHLEN.md` §2/§3 |

## 2. Die Statusregel (eine Regel, nicht drei)

Jedes Markdown-Dokument dieses Repos trägt direkt unter seiner ersten Überschrift
einen Statusblock:

```md
> **Status:** <wert> — <ein Satz> · **Stand:** YYYY-MM-DD
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`
```

| Wert | Bedeutung | Pflicht |
|---|---|---|
| `current` | beschreibt den heutigen Baum | wird bei jeder Änderung mitgezogen |
| `historical` | abgeschlossener/überholter Stand, bleibt als Nachweis | **keine** Quelle für aktuelle Zahlen |
| `plan` | Absicht für noch nicht Gebautes | jeder Abschnitt trägt seinen eigenen Stand |
| `evidence` | Belegdatei unter `docs/contracts/` oder `docs/probes/` | Status im Datenfeld, kein Kopfblock |
| `imported` | unverändert übernommener Fremdtext | nicht Teil des kanonischen Satzes |

Archivierte oder ersetzte Dokumente werden nicht gelöscht, sondern über ihren
Status als `historical`/`imported` markiert und in der Tabelle unten geführt.
Aktuelle Pfade in Quellcode und Tests dürfen beim Verschieben nicht brechen; der
Prüfbefehl in §4 ist die Abnahme. Wer ein Dokument ersetzt, markiert das alte als
`historical` und schreibt den Nachfolger `current` — es gibt genau eine
`current`-Fassung je Thema.

**Nachmessung an einer Probe (`nachtrag`).** Eine Probe wird nicht nachträglich „aktuell"
gemacht, aber eine ihrer Aussagen kann durch eine spätere Messung überholt sein. Dafür
trägt die Probe ein Feld `nachtrag` mit **Datum** (`date`, `YYYY-MM-DD`), **Geltungsbereich**
(`scope`: welche Aussage gilt nicht mehr?) und der **Nachmessung** (`note`). Die Form prüft
das Gate (`scripts/gate/plugins/probe-twin.mjs`), nicht das Auge — ein bloßer Text im Feld
gilt nicht als Nachmessung.

## 3. Alle Dokumente und ihr Status

| Dokument | Status | Stand | Zweck |
|---|---|---|---|
| [`README.md`](../README.md) | current | 2026-10-13 | Einstieg, Paketübersicht, Projektstatus |
| [`AGENTS.md`](../AGENTS.md) | current | 2026-10-17 | Arbeitsregeln für Agenten |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | current | 2026-10-17 | Namespace-, Paket- und Profilkonventionen; §5 führt den Lebenszyklus von `.shinon/` |
| [`docs/COMMIT-REGELN.md`](COMMIT-REGELN.md) | current | 2026-10-08 | Commit-Regeln und ihre Durchsetzung |
| [`docs/CI.md`](CI.md) | current | 2026-10-13 | CI als Schranke: Zweige und verpflichtender Statuscheck für `main`, Setz- und Nachkontroll-Befehl — und was davon gebaut, aber noch nicht scharf ist |
| [`docs/ZAHLEN.md`](ZAHLEN.md) | current | 2026-10-17 | alle harten Zahlen + Befehle |
| [`docs/ROADMAP.md`](ROADMAP.md) | plan | 2026-10-13 | kanonische Roadmap: Versionsordnung, Historie, Release-Ziele `0.4.0`/`0.5.0`, `1.0.0`-Kriterien und der `0.1.0`-Pfad |
| [`docs/STARTER-PLAN.md`](STARTER-PLAN.md) | plan | 2026-10-08 | native App/Tauri: Stufe 1 scharf, 2–4 Konzept |
| [`docs/MOBILE-PLAN.md`](MOBILE-PLAN.md) | plan | 2026-10-14 | Mobile-Profil, ballastarmes UI, CI-/Sicherheits-Gates und Android-Runtime-Spike |
| [`IDEA.md`](../IDEA.md) | current | 2026-10-13 | Kurzidee; Roh-Export archiviert (Pfad in IDEA.md) |
| geplant: starter/README.md (noch nicht existierend, deshalb kein Pfad) | plan | 2026-10-08 | Tauri-Shell (Stufe 2) — gebaut wird nach [`docs/STARTER-PLAN.md`](STARTER-PLAN.md) |
| [`docs/FOUNDATION-PLAN.md`](FOUNDATION-PLAN.md) | historical | 2026-10-07 | Fundament-Plan, Wellen 0/2/3 |
| [`docs/PLAN.md`](PLAN.md) | historical | 2026-10-07 | erster DSH-Mod-Plan (`@shinon/*`, heute) |
| [`docs/REPO-ANALYSIS.md`](REPO-ANALYSIS.md) | historical | 2026-10-07 | Inventur der Schwester-Repos |
| [`docs/SYSTEM-ANALYSIS.md`](SYSTEM-ANALYSIS.md) | historical | 2026-10-07 | Tiefenanalyse der Schwester-Systeme |
| [`shinon-forge-implementierungsplan.md`](../shinon-forge-implementierungsplan.md) | historical | 2026-10-07 | verifizierbarer Implementierungsplan |
| [`prompts/README.md`](../prompts/README.md) | historical | 2026-10-07 | Prompt-Ablage |
| [`docs/legacy-goose-prompts/`](legacy-goose-prompts/) | imported | — | übernommene Goose-Prompts |
| [`packages/narrative/README.md`](../packages/narrative/README.md) | current | 2026-10-10 | Paket-Doku Narrative Engine |
| [`packages/shinon-forge/README.md`](../packages/shinon-forge/README.md) | current | 2026-10-10 | Paket-Doku Shinon Forge |
| [`PLAN.md`](../PLAN.md) | plan | 2026-10-17 | Umsetzungsplan des Umbaus (jeder Schritt trägt seinen eigenen Status; §3.12 trägt den Nachtrag zur Aktivierung von `popup` und `key-router` und den einen offenen Faden, §3.12.1 das Verdikt zu `shinon-forge`) |
| [`docs/SCORING-KONZEPT.md`](SCORING-KONZEPT.md) | plan | 2026-10-11 | Scoring-Konzept: K1–K4 als Ist, K5–K8 als Ziel — implizite Signale (Zug 1: native interne Quellen aus dem DSH-Verlauf, kein Browser), Dauerhaftigkeit über die SQLite des Projekt-Index (Zug 2, §2.5), Vorlieben-Trennung, taktische/Master Skills, ohne Deckel |
| [`LICENSE`](../LICENSE) | current | 2026-10-11 | eigene Lizenz (MIT, `Copyright (c) 2026 Vannon`) — kein Markdown, deshalb ohne Statusblock |
| [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) | current | 2026-10-17 | Fremdhinweise, getrennt vom eigenen Copyright (A12) |
| [`vendor/MODIFICATIONS.md`](../vendor/MODIFICATIONS.md) | current | 2026-10-17 | Änderungslog des vendorten DSH-Anteils: welche Fassung hier liegt und welcher Code sie lädt (A4 der Release-Abnahme) |
| [`vendor/dsh/`](../vendor/dsh/) (20 Dateien + `MANIFEST.json`) | imported | 2026-10-17 | unverändert übernommenes Fremdpaket `@deepseek-ai/dsh@0.2.1-alpha.1` — dieselbe Fassung wie Root-Pin, Lock und installierte Binary, kein Teil des kanonischen Satzes, Herkunft im Manifest |
| [`docs/audit/`](audit/) | current | je Dokument (Statusblock) | Audit, Reparatur- und Umsetzungs-Nachweise; jeder nennt Messbefehl und Messzeitpunkt |

Nicht in dieser Tabelle: [`docs/archive/legacy-profiles/`](archive/legacy-profiles/) (archivierte
Profil-Altdateien — kein Markdown, deshalb kein Statusblock) sowie `docs/contracts/` und
`docs/probes/` (Belege mit eigenem Datenfeld, siehe unten).

Belege: `docs/contracts/` (Verträge) und `docs/probes/` (Falsifikations-Proben).
Beide sind JSON-Dateien mit eigenem Statusfeld; sie sind Proben **mit Datum** und
werden nicht nachträglich „aktuell“ gemacht, sondern neu gemessen.

## 4. Pfad-Konvention (damit Verweise auflösbar bleiben)

- Ein Pfad in Backticks oder als Markdown-Link ist **repo-relativ** und muss existieren.
  Er beginnt mit `packages/`, `profiles/`, `scripts/`, `docs/`, `assets/`, `prompts/`,
  `vendor/` oder `starter/`.
- Aussagen über **fremde** Repos tragen den Repo-Namen als Präfix und sind damit
  erkennbar kein Pfad in diesem Baum: `` `Feed-the-Floor-Bleed/scripts/shinon/` ``.
- Geplante, noch nicht existierende Dateien werden **nicht** als Pfad geschrieben,
  sondern als Text („geplant: …“) mit dem heutigen Ziel daneben.

Prüfbefehl (erwartet `defekt 0`):

```bash
node --input-type=module -e '
import fs from "node:fs"; import path from "node:path";
const files = ["README.md","AGENTS.md","IDEA.md","shinon-forge-implementierungsplan.md","THIRD_PARTY_NOTICES.md","prompts/README.md"];
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e => { const p = d+"/"+e.name; return e.isDirectory() ? walk(p) : (e.name.endsWith(".md") ? [p] : []); });
files.push(...walk("docs"), ...walk("packages"), ...walk("vendor"));
const pat = /`((?:packages|profiles|scripts|docs|assets|prompts|vendor|starter)\/[A-Za-z0-9._\/-]+)`|\[[^\]]*\]\(((?:packages|profiles|scripts|docs|assets|prompts|vendor|starter)\/[^)\s]+)\)/g;
let checked = 0, broken = 0;
for (const f of files) for (const m of fs.readFileSync(f,"utf8").matchAll(pat)) {
  const ref = (m[1] || m[2]).split("#")[0]; checked++;
  if (!fs.existsSync(path.resolve(ref))) { broken++; console.log("✗ " + f + " -> " + ref); }
}
console.log("geprüft " + checked + ", defekt " + broken);
'
```
