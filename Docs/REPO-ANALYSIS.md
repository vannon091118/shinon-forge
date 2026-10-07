# Repo-Analyse — alle 31 Repos unter `vannon091118`

> Verifiziert 2026-10-07 gegen die echten Git-Bäume (nicht gegen Beschreibungen).
> Zweck: Entscheidungsgrundlage für den Fundament-Plan. Kein Code, kein Urteil aus zweiter Hand.

## Inventur (alle 31, inkl. privat)

| Repo | Sicht | Dateien | Tech | Rolle im Fundament | Verdict |
|---|---|---|---|---|---|
| **Shinon_Agent** | pub | 8466 | node+py | **Convergence-Schicht (Contracts + Control Plane)** | ⭐ **Kern-Fund** |
| Feed-the-Floor-Bleed | pub | 537 | node | **Gate-Engine** (`scripts/shinon/`) | ⭐ **sofort ziehen** |
| Shinon_Agent/interface-specs | – | 11 | json | 6 Contracts + WIRING + Schemas | ⭐ **kanonisch** |
| karma | pub | 136 | py | FalsificationGate, Evidence, Reward | ⭐ echt (Python) |
| limen | priv | 84 | py | Provider-Plane, Key-Pool, 429 | ⭐ echt (Python) |
| propsa | pub | 309 | node+rust | 7-Punkt-Vertragsform, 4 Zustände | ⭐ Form/Disziplin |
| Falsify_Me | pub | 264 | node | Probe/Twin/Verdict | ⭐ Prinzip + Code |
| DOKI | pub | 48 | node | Provenance/Identity | ⭐ Prinzip |
| Syx_Bridge-Auto-Translate-Mods | pub | 298 | node | Fehler-Taxonomie, Scoring, HTTP, Doctor | ◐ Konzept (domänengebunden) |
| LLM_Core_V1 | pub | 113 | node | deterministische Kernel-Primitive + 30 Gate-Skripte | ◐ später |
| SnipWar | pub | 1600 | node+godot | Chain-Controller (**GDScript**) | ◐ Konzept only |
| godot-acp | pub | 208 | node | MCP/JSON-RPC-Control-Layer | ○ später (Env-Adapter) |
| LifeSeedLab | pub | 444 | node | Clock/RNG/Determinismus | ○ später (Replay) |
| brutalord-the-feral-cycle | pub | 622 | node | Cloudflare Worker + verify-Skripte | ○ später (Control Plane) |
| Promtguard | priv | 83 | py | Prompt-Layer: `.promtset`, `promptgen`, Claims | ⭐ Contract+Impl (`0/36 verified`) |
| SyxEconomyMod | pub | 320 | java | Minecraft-Mod (pom.xml) | ✗ nicht relevant |
| Rimconemy | pub | 569 | dotnet | C#-Port (ArcEngine/RngEngine) | ○ Referenz |
| PRISM | pub | 59 | py | Multi-Agent-Parsers + Dashboard | ◐ Konzept (DSH loggt selbst) |
| SyxCode-LLM-Framework | pub | 33 | node | Introspection (graph/inventory/matrix) | ○ später |
| syxcraft-commit-layer | priv | 111 | node | Commit-Layer + Narrativ-Generator (`author_system.js`) | ○ prüfen |
| SyxCraft-old | priv | 97 | node | Alt-Stand | ✗ Archiv |
| Grow_Empery | priv | 204 | node | Web-Game (playwright) | ✗ nicht Kern |
| LifeGameLab | pub | 84 | node | Sim-Ideen | ✗ (Fork, schwächer als LifeSeedLab) |
| plugin.video.kodi-crew-germany | priv | 217 | ? | Domänenabstand zu groß | ✗ |
| snip-warfare | pub | 887 | godot | Prototyp | ✗ |
| League-of-lit | priv | 71 | ? | ? | ○ sichten |
| isaac-rl | priv | 89 | node+py+rust | RL-Sim | ✗ |
| LLM_Safe_BioLab_Sim | priv | 26 | ? | Sim | ✗ |
| Lhytaria_Agent_mobile | pub | 2 | ? | leer | ✗ |
| Pipelie_Run | priv | 2 | ? | leer | ✗ |
| sim | priv | 0 | – | leer | ✗ |
| shinon-forge | pub | – | node | **Ziel-Repo** | – |

Legende: ⭐ Kern · ◐ Konzept/teilweise · ○ später · ✗ nicht relevant

## Der Kern-Fund: `Shinon_Agent/interface-specs/`

Der Report will eine „Convergence-Schicht bauen". **Sie existiert bereits** — als
Contract-Suite mit ehrlichem Status. Inhalt:

| Datei | Inhalt |
|---|---|
| `shinon.contract.json` | Character-Layer (Position 0): Attitude -10..+10, Two-Tier-Memory, Contract/Replay-Gates |
| `promtguard.contract.json` | Prompt-Layer (Position 1): Claims, Context-Tokens, Decision-Journal |
| `karma.contract.json` | Cognition-Layer (Position 2): FalsificationGate, Experience Store, Reward, KG |
| `goal-chain.contract.json` | Orchestrierung (2b): Tool Belt, Skill-Chains, TIDs |
| `limen.contract.json` | Infrastruktur (3): Key-Pool, Capability-Routing, 429-Klassifikation, Retry-Budget |
| `WIRING.md` | Handoff-Sequenz HOFF-0001…0008, Ownership, Persistenz-Architektur |
| `pipeline-state.schema.sql` + `audit-trail.schema.json` | **State (SQLite, mutabel) vs. Audit (JSONL, append-only)** |
| `run-manifest.schema.json` | LEGACY (explizit als abgelöst markiert) |

**Dokumentierter Reifegrad (aus den Contracts selbst, nicht behauptet):**

| Komponente | Position | Sprache | Status | Kritischer Gap (wörtlich) |
|---|---|---|---|---|
| ShinonLLM | 0 | TypeScript | `PARTIAL` | „Handoff to Promtguard: interface defined but no runtime integration" |
| Promtguard | 1 | Python | `IMPLEMENTED` | „Verification loop (unverified → confirmed) nie vollständig durchgelaufen: **0 verified Claims von 36**" |
| KARMA | 2 | Python | `PARTIAL` | „**0 Claims über Promtguard→KARMA Grenze gewandert**" |
| goal-chain | 2b | Bash+Python | `PARTIAL` | „**0 Runs jemals vollständig abgeschlossen** (2026-08-12)" |
| LIMEN | 3 | Python | `IMPLEMENTED` | „**keine Cross-Component-Integration**: routet noch keine goal-chain API-Calls" |

### ⚠️ Der zentrale Befund: die Pipeline ist noch nie gelaufen
Jede Komponente ist **einzeln gebaut** — aber **kein einziger Handoff hat je
End-to-End gefeuert**: 0 Claims über die Grenze, 0 vollständige Runs,
0 verified Claims, 0 Cross-Component-Integration. Die Contracts und die
Convergence-Schicht existieren und sind ehrlich dokumentiert — **die Laufzeit
dazwischen fehlt komplett.**

Das ist genau die Lücke, die DSH schließt: DSH *ist* die Laufzeit, die die
Komponenten tatsächlich verbindet und ausführt. Nicht die Contracts neu bauen —
die existieren. Sondern: **die Komponenten in DSH-Bundles gießen, damit der
Handoff real läuft.**

Beleg-Nachtrag: alle 5 Contracts + `pipeline-state.schema.sql` +
`audit-trail.schema.json` liegen in `Shinon_Agent/interface-specs/`; `known_gaps`
in jedem → das *ist* bereits die propsa-Statusdisziplin (IMPLEMENTED/STUB/
NOT_IMPLEMENTED/NOT_VERIFIED), nur ohne Gate, das sie erzwingt.

**Das heißt:** Die Contracts sind reif, die **Laufzeit-Verbindung fehlt**. Genau
diese Lücke soll DSH als Fundament schließen.

## Architektur-Konflikt, den wir entscheiden müssen

`Shinon_Agent` beschreibt eine **parallele Control Plane** (eigener Kernel, eigene
SQLite-Welten, eigene Persistenz) — 5 Sprachen: TypeScript (Shinon), Python
(KARMA, LIMEN), JSONL, SQLite, GDScript.

DSH dagegen ist **der Runtime**: Agent-Loop, Tools, Sessions, Provider-Adapter,
Plugin-Registry, Subagent-System, append-only Log.

→ **Nicht beides nebeneinander betreiben** (das wäre der Frankenstein). Mapping:

| Control-Plane-Rolle | DSH-Äquivalent | Konsequenz |
|---|---|---|
| SHINON (Character, Position 0) | System-Prompt-Section / Persona-Plugin | als Prompt-Layer neu, kein eigener Kernel |
| PROMTGUARD (Prompt + Claims) | Context-/Claims-Plugin | Claims-Modell übernehmen (Contract), nicht die Python-Pipeline |
| KARMA (FalsificationGate) | Tool/Gate-Plugin | **wertvollster Teil** — als JS-Gate neu |
| GOAL-CHAIN (Skills/TIDs) | DSH-Subagent + Skills | **existiert in DSH bereits** → nicht doppelt bauen |
| LIMEN (Key-Pool/429/Retry) | DSH-LLM-Adapter-Schicht | Konzept übernehmen; DSH-Adapter bleibt der Transport |
| DOKI (Provenance) | querschnittliche Invariante | als Regel + Audit-Schema |
| Audit-Trail (JSONL) | DSH-Session-Log | **DSH hat append-only Log schon** |

**Regel daraus:** DSH ist die Laufzeit. Aus `Shinon_Agent` übernehmen wir die
**Contracts** (Sprache, Grenzen, Handoffs, Status-Vokabular) — nicht die
Parallel-Runtime.

## Was der Report richtig / falsch hatte

| Report | Verdict |
|---|---|
| S1 Gate-Engine (FTF) | ✅ **stimmt, verifiziert** — reifste Vorlage |
| S4 propsa-Vertragsform | ✅ stimmt |
| A1 FalsifyMe Probe/Twin | ✅ stimmt (Prinzip + Code) |
| A5 DOKI Provenance | ✅ stimmt |
| **S2 Plugin-Registry (Syx_Bridge)** | ❌ **falsch** — Game-Registry; DSH hat Registry bereits |
| **A2 SnipWar Chain** | ⚠️ **GDScript**, kein JS — Port, kein Adopt |
| **A4 LIMEN** | ⚠️ **Python** + überlappt DSH-Adapter → Konzept only |
| **A3 HTTP-Router** | ⚠️ DSH-Web-App bringt eigenes HTTP → niedrige Prio |
| — | ❌ **Report kennt `Shinon_Agent/interface-specs` gar nicht** — das größte Asset fehlt komplett |
| — | ❌ übersehen: `Promtguard`, `syxcraft-commit-layer`, `LLM_Core_V1`-Gates, `SyxEconomyMod` |
