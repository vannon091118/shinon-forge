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
| Was ist abgeschlossen und warum steht es nicht mehr vorn? | [`docs/archive/README.md`](archive/README.md) |

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

**Ein Ort für Abgeschlossenes.** Es gibt genau **einen** History-Ordner:
[`docs/archive/`](archive/README.md). Abgeschlossene Audits, überholte Pläne,
beendete Übergaben und importierter Fremdtext liegen dort, tragen einen
Archiv-Banner und sind `historical` (bzw. `imported`). `docs/audit/` und
`docs/handshakes/` sind die Ablage für **neue, noch laufende** Nachweise; sobald
ein Nachweis abgeschlossen ist, wandert er ins Archiv. Die Umleitungstabelle in
[`docs/archive/README.md`](archive/README.md) §2 nennt jeden alten Pfad.

Wer ein Dokument ersetzt, markiert das alte als `historical` und schreibt den
Nachfolger `current` — es gibt genau eine `current`-Fassung je Thema. Eingefrorene
Belege werden **nicht** umgeschrieben: eine Probe trägt höchstens einen `nachtrag`.

**Nachmessung an einer Probe (`nachtrag`).** Eine Probe wird nicht nachträglich „aktuell"
gemacht, aber eine ihrer Aussagen kann durch eine spätere Messung überholt sein. Dafür
trägt die Probe ein Feld `nachtrag` mit **Datum** (`date`, `YYYY-MM-DD`), **Geltungsbereich**
(`scope`: welche Aussage gilt nicht mehr?) und der **Nachmessung** (`note`). Die Form prüft
das Gate (`scripts/gate/plugins/probe-twin.mjs`), nicht das Auge — ein bloßer Text im Feld
gilt nicht als Nachmessung.

## 3. Alle aktiven Dokumente und ihr Status

| Dokument | Status | Stand | Zweck |
|---|---|---|---|
| [`README.md`](../README.md) | current | 2026-10-17 | Einstieg, Paketübersicht, Projektstatus |
| [`AGENTS.md`](../AGENTS.md) | current | 2026-10-17 | Arbeitsregeln für Agenten |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | current | 2026-10-17 | Namespace-, Paket- und Profilkonventionen; §5 führt den Lebenszyklus von `.shinon/` |
| [`docs/COMMIT-REGELN.md`](COMMIT-REGELN.md) | current | 2026-10-08 | Commit-Regeln und ihre Durchsetzung |
| [`docs/COMMENT-KANON.md`](COMMENT-KANON.md) | current | 2026-10-17 | Ablage aller Kommentar-Blöcke über 10 LOC, mit Zeiger-Anker je Fundstelle — Ziel der Kürzung, nie Handediting |
| [`docs/audit/CLAIM_MATRIX_2026-10-17.md`](audit/CLAIM_MATRIX_2026-10-17.md) | current | 2026-10-17 | Claim-Matrix: 294 Kommentar-Blöcke und 39 Doku-Statusblöcke gesammelt, Überschneidungen/Dopplungen/Widersprüche geprüft, Kanonisierung belegt |
| [`docs/CI.md`](CI.md) | current | 2026-10-14 | CI als Schranke: Zweige und verpflichtender Statuscheck für `main`, Setz- und Nachkontroll-Befehl — und was davon gebaut, aber noch nicht scharf ist |
| [`docs/ZAHLEN.md`](ZAHLEN.md) | current | 2026-10-17 | alle harten Zahlen + Befehle |
| [`docs/INDEX.md`](INDEX.md) | current | 2026-10-17 | dieser Einstieg und die Statusregel |
| [`docs/ROADMAP.md`](ROADMAP.md) | plan | 2026-10-17 | kanonische Roadmap: Versionsordnung, Historie, Release-Ziele `0.4.0`/`0.5.0`, `1.0.0`-Kriterien und der `0.1.0`-Pfad |
| [`docs/S3-FRESHCLONE-2026-10-17.md`](S3-FRESHCLONE-2026-10-17.md) | current | 2026-10-17 | Release-Beleg S3: Frischklon-Repro bis Boot |
| [`docs/S3-FRESH-2026-10-17.md`](S3-FRESH-2026-10-17.md) | current | 2026-10-17 | Release-Beleg S3: HTTP-200-Nachweis |
| [`docs/S3-FRESH-d8999ab.md`](S3-FRESH-d8999ab.md) | current | 2026-10-17 | Release-Beleg S3 am aktuellen Stand |
| [`docs/S4-DOCTOR-2026-10-17.md`](S4-DOCTOR-2026-10-17.md) | current | 2026-10-17 | Release-Beleg S4: `doctor` als eigener Befehl |
| [`docs/S5-RELEASE-2026-10-17.md`](S5-RELEASE-2026-10-17.md) | current | 2026-10-17 | Release-Beleg S5 (teilweise): Schranke ohne Tag |
| [`docs/S6-MODELLTURN-AUDIT-CI-2026-10-17.md`](S6-MODELLTURN-AUDIT-CI-2026-10-17.md) | current | 2026-10-17 | Release-Beleg S6: zwei benannte Blocker, kein Go |
| [`docs/STARTER-PLAN.md`](STARTER-PLAN.md) | plan | 2026-10-08 | native App/Tauri: Stufe 1 scharf, 2–4 Konzept |
| [`docs/MOBILE-PLAN.md`](MOBILE-PLAN.md) | plan | 2026-10-14 | Mobile-Profil, ballastarmes UI, CI-/Sicherheits-Gates und Android-Runtime-Spike |
| [`docs/SCORING-KONZEPT.md`](SCORING-KONZEPT.md) | plan | 2026-10-11 | Scoring-Konzept: K1–K4 als Ist, K5–K8 als Ziel — implizite Signale, Dauerhaftigkeit über den Ledger, Vorlieben-Trennung, ohne Deckel |
| [`PLAN.md`](../PLAN.md) | plan | 2026-10-17 | laufender Umsetzungsplan des Umbaus (§9.1: Release-Abnahme je Slice) |
| [`IDEA.md`](../IDEA.md) | current | 2026-10-13 | Kurzidee; Roh-Export im Archiv |
| [`docs/archive/README.md`](archive/README.md) | current | 2026-10-17 | der eine History-Ordner: Regel, Umleitungstabelle, Bestand |
| [`shinon-forge-implementierungsplan.md`](../shinon-forge-implementierungsplan.md) | historical | 2026-10-07 | bleibt im Root, weil eingefrorene Proben und `scripts/gate/tests/prompter-contract.test.mjs` ihn wörtlich zitieren |
| [`packages/narrative/README.md`](../packages/narrative/README.md) | current | 2026-10-10 | Paket-Doku Narrative Engine |
| [`packages/shinon-forge/README.md`](../packages/shinon-forge/README.md) | current | 2026-10-10 | Paket-Doku Shinon Forge |
| [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) | current | 2026-10-17 | Fremdhinweise, getrennt vom eigenen Copyright (A12) |
| [`vendor/MODIFICATIONS.md`](../vendor/MODIFICATIONS.md) | current | 2026-10-17 | Änderungslog des vendorten DSH-Anteils: welche Fassung hier liegt und welcher Code sie lädt (A4 der Release-Abnahme) |
| [`LICENSE`](../LICENSE) | current | 2026-10-11 | eigene Lizenz (MIT, `Copyright (c) 2026 Vannon`) — kein Markdown, deshalb ohne Statusblock |
| [`vendor/dsh/`](../vendor/dsh/) (20 Dateien + `MANIFEST.json`) | imported | 2026-10-17 | unverändert übernommenes Fremdpaket `@deepseek-ai/dsh@0.2.1-alpha.1` — dieselbe Fassung wie Root-Pin, Lock und installierte Binary, kein Teil des kanonischen Satzes, Herkunft im Manifest |

**Archiv (der eine Ort für Abgeschlossenes):** alle abgeschlossenen Audits,
überholten Pläne, beendeten Handshakes und importierten Texte liegen unter
[`docs/archive/`](archive/README.md). Sie sind **keine** Quelle für den heutigen
Baum; die vollständige Liste und jede Umleitung steht in
[`docs/archive/README.md`](archive/README.md).

**Neue Nachweise** (noch nicht abgeschlossen) liegen unter `docs/audit/`;
`docs/handshakes/` existiert derzeit nicht — beendete Handshakes liegen im Archiv.
Derzeit liegt unter `docs/audit/` der transiente Review
[`docs/audit/DOC_REVIEW_2026-10-17.md`](audit/DOC_REVIEW_2026-10-17.md); nach
Einarbeitung seiner Korrekturen wandert er ins Archiv. Belege `docs/contracts/` und `docs/probes/`
sind JSON-Dateien mit eigenem Statusfeld; sie sind Proben **mit Datum** und
werden nicht nachträglich „aktuell“ gemacht, sondern neu gemessen.

## 4. Pfad-Konvention (damit Verweise auflösbar bleiben)

- Ein Pfad in Backticks oder als Markdown-Link ist **repo-relativ** und muss existieren.
  Er beginnt mit `packages/`, `profiles/`, `scripts/`, `docs/`, `assets/`, `vendor/` oder
  `starter/`.
- Aussagen über **fremde** Repos tragen den Repo-Namen als Präfix und sind damit
  erkennbar kein Pfad in diesem Baum: `` `Feed-the-Floor-Bleed/scripts/shinon/` ``.
- Geplante, noch nicht existierende Dateien werden **nicht** als Pfad geschrieben,
  sondern als Text („geplant: …“) mit dem heutigen Ziel daneben.
- Verweise **in** archivierten Dokumenten bleiben historisch: sie zeigen auf den
  Stand ihres Messzeitpunkts. Wer heute darauf verweist, nennt den Archivpfad.

Prüfbefehl (erwartet `defekt 0` im **kanonischen Satz**). Nicht geprüft werden:

- `docs/archive/` — dort stehen eingefrorene Nachweise (sie nennen absichtlich
  Pfade ihres Messzeitpunkts, z. B. das gelöschte Profil web);
- `docs/audit/` — dort stehen transiente Reviews mit eingefrorenen Zitaten (sie
  wandern nach Abschluss ins Archiv und werden nicht als live-Referenzen gelesen);
- Verweise auf Verzeichnisse (mit `/` am Ende) — sie sind Konvention, keine Datei;
- historische Namen, die in dieser Datei nur als Text stehen (dsh-test.mjs,
  dsh-profile-test.mjs, das pnpm-Verzeichnis) — eingefrorene Belege, keine
  live-Referenzen.

```bash
node --input-type=module -e '
import fs from "node:fs"; import path from "node:path";
const files = ["README.md","AGENTS.md","IDEA.md","shinon-forge-implementierungsplan.md","THIRD_PARTY_NOTICES.md"];
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e => { const p = d+"/"+e.name; return e.isDirectory() ? walk(p) : (e.name.endsWith(".md") ? [p] : []); });
const active = (d) => walk(d).filter((f) => !f.startsWith("docs/archive/") && !f.startsWith("docs/audit/"));
files.push(...active("docs"), ...active("packages"), ...active("vendor"));
const pat = /`((?:packages|profiles|scripts|docs|assets|vendor|starter)\/[A-Za-z0-9._\/-]+)`|\[[^\]]*\]\(((?:packages|profiles|scripts|docs|assets|vendor|starter)\/[^)\s]+)\)/g;
let checked = 0, broken = 0;
for (const f of files) for (const m of fs.readFileSync(f,"utf8").matchAll(pat)) {
  const ref = (m[1] || m[2]).split("#")[0];
  if (ref.endsWith("/")) continue;
  checked++;
  if (!fs.existsSync(path.resolve(ref))) { broken++; console.log("✗ " + f + " -> " + ref); }
}
console.log("geprüft " + checked + ", defekt " + broken);
'
```
