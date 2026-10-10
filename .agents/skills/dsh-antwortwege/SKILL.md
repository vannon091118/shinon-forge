---
name: dsh-antwortwege
description: Wo Antworten zu DSH/Cordis schnell herkommen - Doku-Karte mit Pfaden, Introspektion des installierten DSH (dump-config, cordis_inspect, .d.ts), Terminologie-Glossar, Version-Wahrheit. Nutzen bevor eine DSH-Frage neu erforscht oder geraten wird.
---

# Antwortwege: raten ist langsam, nachschlagen ist schnell

Die DSH-Doku ist öffentlich und nach **Frage-Typ** sortiert. Erst die passende
Quelle wählen, dann lesen — und was gelesen wurde, mit Fundstelle festhalten
(Skill `dsh-beweis-tempo`).

## Doku-Karte (`deepseek-ai/deepseek-harness`, `docs/`)

| Frage | Quelle |
|---|---|
| Wie funktioniert Cordis überhaupt? | `docs/cordis-primer.md` (5 Ideen, Dispatch-Modi) |
| Was kann `ctx.*` exakt? | `docs/cordis-api/{context,service,events,fiber,registry,inherited}.md` (generiert aus dem Quellcode) |
| Welches Event hat welchen Modus, wer emittiert/hört? | `docs/event-producer-consumer.md` (Tabelle Event → Producer → Consumer) |
| Turn-/Step-/Request-Semantik, „model-visible means logged" | `docs/architecture.md` |
| Ein Service/Subsystem: Namen, Typen, Events | `docs/subsystems/<name>.md` (core, goal, slots, skills, storage, …) |
| Wer injiziert was (Seams) | `docs/capability-seams.md` |
| Typ-Vokabular (scope, seam, goal round, lineage) | `docs/glossary.md` — **ein Begriff pro Konzept** |
| Bug-Klasse / Vorfall | `docs/postmortem/0001–0004` + `docs/defensive-patterns.md` |
| Wie teste ich? | `docs/testing.md` (Tier-Modell) |
| Wie baue ich Pakete/Tools/Adapters? | `docs/cookbook/*` (extension-cookbook, adding-a-package, …) |
| API-Gateway/Remote-Verträge | `docs/api-gateway.md` |

Quellen-Abruf ohne API-Limit:
`https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/<pfad>.md`
(Die GitHub-Contents-API ist unauthentiziert ratenbegrenzt; die Website
`https://deepseek-harness.github.io/deepseek-harness/` hat die vollständige
Seitenliste in der Sidebar.)

## Introspektion des INSTALLIERTEN DSH (Ground Truth)

Die Doku folgt `master`; das Repo pinnt eine Version. **Was zählt, steht in der
installierten Fassung** — Probe-Muster `docs/probes/goal-integration.json`:
„gelesen in DSH 0.2.0-rc.2, nicht geraten".

- `dsh --version` — welche Fassung überhaupt.
- `dsh --profile shinon --dump-config` — welche Bundles/Layer/Config-Werte
  wirklich gelten (auch der einzige Beleg für `!!js`-Werte).
- `dsh --profile <name> --dump-config-schema` — das Patch-Schema der Loader.
- `cordis_inspect what:"client"` (im laufenden System) — live Slot-Baum:
  Kardinalität/Scope je Key, bevor man einen Slot-Eintrag plant.
- `.d.ts` der installierten Pakete (`lib/types/…`) — exakte Methodensignaturen,
  Events, Fehlertypen; DSH-API-Referenzen im Katalog zitieren genau diese
  Stellen mit `Source`-Link.
- Upstream-Glossar nutzen: wer „scope", „seam", „goal round" korrekt schreibt,
  findet Treffer; Synonyme kosten nur Zeit.

## Repo-interne Wege (schneller als Forschung)

| Frage | Ort |
|---|---|
| Konvention/Vertrag des Repos | `AGENTS.md`, `docs/ARCHITECTURE.md` |
| Ist diese Bug-Klasse bekannt? | `.agents/skills/dsh-bug-muster` (Katalog B1–B14) |
| Wie nutze ich Cordis hier maximal? | `.agents/skills/cordis-architektur` |
| Welcher Check wann? | `.agents/skills/dsh-dev-workflow`, `.agents/skills/dsh-test-tempo` |
| Was wurde schon RECHERCHIERT? | `docs/research/2026-10-09-cordis-dsh-recherche.md` (Quellen + Belege) — **Ziel fehlt in diesem Baum** (offener Posten, STAND §6.4) |
| Was wurde schon BEWIESEN? | `docs/probes/*.json` (Claim/Evidence je Behauptung) |
| Welche Zahlen/Verträge gelten? | `scripts/lib/repo.mjs` (eine Quelle), `docs/contracts/` |

## Recherche-Disziplin (Tempo-Regeln)

1. **Erst lokal, dann online**: Proben und `docs/research/` enthalten oft schon
   die Antwort mit Beleg — doppelte Recherche ist verschenkte Zeit.
2. **Version-Wahrheit**: Doku ≠ installiert. Für API-Namen/Signaturen gilt die
   installierte Fassung; die Doku ist die Landkarte, `.d.ts`/`--dump-config` der
   Beweis. Abweichungen im Bericht nennen.
3. **Funde mit Fundstelle ablegen** (Datei + Zeile/URL), nicht mit „irgendwo
   gelesen" — ein Fund ohne Fundstelle muss später nochmal gefunden werden.
4. **Begriffe aus dem Glossar** übernehmen statt Synonyme zu erfinden; Bug-
   Muster aus `postmortem/`/`dsh-bug-muster` zitieren statt neu zu beschreiben.
5. Bekannte Sackgassen: `cordis.js.org` leitet nur um (echte Doku ist das
   DSH-Primer); `docs/framework/*`- und `docs/practice/*`-Rohpfade 404en (über
   die Website navigieren); nicht-authentizierte GitHub-API ist ratenbegrenzt.
