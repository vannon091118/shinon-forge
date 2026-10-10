# DSH_SUBSET_3-1 — welcher DSH-Anteil der Boot wirklich braucht

> **Status:** current — Nachweis zu `PLAN.md` Schritt 3.1 (D1). **Stand:** 2026-10-11
> **Einstieg:** `docs/INDEX.md` · **Zahlen des Repos:** `docs/ZAHLEN.md`

**Ziel (aus dem Plan):** wissen, welche `@deepseek-ai/dsh-*` der Boot wirklich braucht.
**Abnahme:** Liste mit Begründung je Paket im Repo. **Ergebnis:** §3 (19 Zeilen, eine je
Bundle) plus §4 für die Pakete, die **niemand** in diesem Baum liest.

**Nicht Teil dieses Schritts:** etwas zu entfernen. Die Verdikte sind die Vorbedingung
für die Entscheidung in §5 und für 3.2 (Vendoring) — Vendoring kopiert genau dieses
Subset, deshalb steht es vorher fest.

## 1. Messung

Gemessen wird nicht, was ein Bundle zu heißen behauptet, sondern was das inkrementelle
Laden tatsächlich einsammelt: `dsh --profile shinon --dump-config` schreibt vor jedem
Eintrag den Kopf `# == <Bundle>[, patched by <Overlay>]`. Gezählt wurden diese Köpfe und
die `- id:`-Einträge je Kopf.

Die Zahlen stehen in zwei Ständen: **vor** der Entscheidung aus §5 (19 Bundles — die Liste
in §3 ist in diesem Stand gemessen) und **nach** ihr (18 Bundles). Beide sind gemessen.

| Größe | vor der Entscheidung | nach der Entscheidung | Befehl |
|---|---|---|---|
| Bundles im Profil `shinon` | **19** (14 eigene, 5 fremde) | **18** (14 eigene, 4 fremde) | `node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.length"` |
| Layer-Köpfe im Dump | **55** | **54** | `grep -c '^# == ' <dump>` |
| Einträge im Dump | **207** | **203** | `grep -c '^- id: ' <dump>` |

Die Zuordnung der 54 Köpfe und 203 Einträge im Stand **nach** der Entscheidung — gemessen
gegen das **Repo-`dsh@0.2.1-alpha.1`** (nicht gegen ein globales), indem die Zeilen zwischen
zwei `# == `-Köpfen dem vorangehenden Kopf zugeschlagen wurden (die Zeile des Kopfes selbst
nennt nach `, patched by ` den Überschreiber mit):

| Herkunft des Kopfes | Köpfe | Einträge | davon überschrieben von |
|---|---|---|---|
| `@deepseek-ai/dsh-base` | **31** (16 unverändert + 12 + 3) | **94** | `dsh-web-app` (12), Profil-Patch (3) |
| `@deepseek-ai/dsh-web-app` | **7** (4 + 3) | **91** | Profil-Patch (3) |
| je `@shinon/*`-Bundle | **genau 1** (14 gesamt) | **genau 1** (`shinon-<dir>`) | Profil-Patch bei **3**: `prompter`, `project-index`, `task-router` |
| je experimentellem Bundle | **genau 1** (2: `auto-review`, `agent-team-profile`) | `auto-review` 1, `agent-team*` **3** (`agent-team`, `tool-agent-team`, `ui-agent-team`) | — |
| Summe | **54** | **203** | 21 `patched by`-Zeilen |

Die Zahl der **wirksamen** Ebenen (54) ist größer als die Zahl der **benannten** Bundles
(18), weil `dsh-base` in vielen Wellen lädt und `dsh-web-app` Teile davon überschreibt
(`patched by @deepseek-ai/dsh-web-app`). Wer nur die Bundle-Liste liest, unterschätzt den
Baum um mehr als das Doppelte. Die 21 `patched by`-Zeilen verteilen sich genau:
**12×** `dsh-web-app` über `dsh-base`, **3×** der Profil-Patch über `dsh-base`, **3×** über
`dsh-web-app` und **3×** über je ein `@shinon/*`-Bundle (`prompter`, `project-index`,
`task-router`).

## 2. Verdikt-Vokabular

- **nötig** — ohne dieses Bundle lädt das Profil nicht oder die Produktoberfläche fehlt.
- **getragen** — nicht Kern, aber ein `@shinon/*`-Paket oder eine dokumentierte Zusage
  lehnt sich daran (Beispiel: `dsh-base` liefert die Dienste, die `dashboard` liest).
- **Kandidat** — in diesem Baum liest es **niemand**: kein `@shinon`-Paket, kein Gate,
  keine Probe nennt seine Fähigkeit. Der Beweis ist die Suche in §4, nicht das Urteil.

## 3. Die 19 Bundles

| # | Bundle | Einträge im Dump | Was es beiträgt (gemessen/Manifest) | Verdikt |
|---|---|---|---|---|
| 1 | `@deepseek-ai/dsh-base` | **31 Köpfe / 94 Einträge**, 93 Manifest-Abhängigkeiten (Stand nach §5) | Der Kern: `llm` (+ `llm-deepseek`, `llm-deepseek-account`, `llm-retry`, `deepseek-llm-api-extensions`), `session` (+ `session-persistence-jsonl`, `session-query-sqlite`, `session-projection`), `storage` (+ `-json`, `-domain`), `sandbox` (+ `bash-`, `pwsh-`, `sandbox-policy`), `permission-presets`, `approval`, `credentials`, `settings`, `commands`, `goal` (+ `goal-round-driver`), `subagent` (+ in-process-Spawn/Fork), `tools` (bash, pwsh, fs, fs-search, web, goal, jobs, skill, subagent, todo, workflow), `typert`/`typert-loader`/`typert-gateway`, `otel`, `hmr`, `plugin-manager`, `token-meter`, `spill-policy`, `session-checkpoint-policy`, `image-offload`, `mcp-resources` | **nötig** |
| 2 | `@deepseek-ai/dsh-web-app` | **7 Köpfe / 89 Einträge**, 131 Manifest-Abhängigkeiten (Stand nach §5) | Die Browser-Oberfläche und ihre Glue: `webserver`, `modules`, `connection`, `api-remotes`, `client-*` (ui-layout, ui-conversation, ui-sidebar, ui-settings-*, ui-tool, …), `locale` (**@shinon/locale-de hängt daran**), `ui-theme` (Token-Ziel von 3.8), `workspace`/`workspace-*`, `api-*-controller`, `agent-preset-registry`, `cordis-*-runner`, `schedule` (+ `tool-schedule`, `ui-schedule`) | **nötig** (Produktoberfläche; ohne es gibt es kein Fenster — das headless-Profil nimmt stattdessen `dsh-headless`) |
| 3 | `@shinon/persona` | 1 (`shinon-persona`) | Persona/Charakter-Fläche des Forks | **nötig** (eigenes Paket) |
| 4 | `@shinon/events` | 1 (`shinon-events`) | Event-Spine; Träger der Zwillinge (`sha256-digest`) | **nötig** |
| 5 | `@shinon/markers` | 1 (`shinon-markers`) | Marker-Spiegel im Side-Panel; liefert die wirksamen Grenzen über `webserver/index-inject` | **nötig** |
| 6 | `@shinon/core` | 1 (`shinon-core`) | Marke/Branding, besetzt die zwei Marken-Slots | **nötig** |
| 7 | `@shinon/locale-de` | 1 (`shinon-locale-de`) | deutsches Wörterbuch; **Besitzerin** des `shinon`-Namensraums | **nötig** |
| 8 | `@shinon/tooltip` | 1 (`shinon-tooltip`) | Tooltip-Ebene | **nötig** (eigenes Paket) |
| 9 | `@shinon/dashboard` | 1 (`shinon-dashboard`) | Fenster über `workspaces`/`sessions` (liest echte Dienste, `docs/probes/workspace-list.json`) | **nötig** |
| 10 | `@shinon/better-errors` | 1 (`shinon-better-errors`) | Config-Ebene (`apply()` loggt) — bewusst nur Registrierung | **getragen** |
| 11 | `@shinon/token-usage` | 1 (`shinon-token-usage`) | Config-Ebene + Anzeige-Fallback | **getragen** |
| 12 | `@shinon/hook` | 1 (`shinon-hook`) | pre-step-Wache, sendet auf `TRACE_CHANNEL` | **nötig** |
| 13 | `@shinon/prompter` | 1 (`shinon-prompter`) | Prompt-Enhancer; liest den Index optional | **nötig** |
| 14 | `@shinon/project-index` | 1 (`shinon-project-index`) | Index (sqlite/fts5), bietet `shinon_index_query` | **nötig** |
| 15 | `@shinon/task-router` | 1 (`shinon-task-router`) | Entscheidung + Goal-Projektion; seit 2.4 `activate: false` | **getragen** (bis H5 aus) |
| 16 | `@shinon/codingmon` | 1 (`shinon-codingmon`) | Panel/Arena, Absender an den Host | **nötig** |
| 17 | `@deepseek-ai/dsh-experimental-auto-review` | 1 (`auto-review`) | „Per-tool LLM authorization review **for the … Auto permission preset**“ — eine zweite Freigabe-Instanz, die es nur mit dem Preset `auto` gibt | **Kandidat** (siehe §4) |
| 18 | `@deepseek-ai/dsh-experimental-agent-team-profile` | 1 Kopf / 3 (`agent-team`, `tool-agent-team`, `ui-agent-team`) | Agent-Teams: mehrere Agenten samt Werkzeugen und UI | **Kandidat** (siehe §4) |
| 19 | `@deepseek-ai/dsh-experimental-voice-input-bundle` | 1 Kopf / 4 (`speech-to-text`, `-sensevoice`, `api-speech-to-text`, `ui-voice-input`) | Spracheingabe mit lokalem SenseVoice; **„downloads its runtime on first use“** (Manifest) | **ENTFERNT** (2026-10-11, Entscheidung §5 — First-Use-Download; gemessen danach: 0 Treffer für `voice`/`speech` im Dump) |

**Bereits entfernt (2026-10-11, Schritt 2.4):** `@deepseek-ai/dsh-experimental-schedule-bundle`
— im Profil benannt, aber in diesem Baum nicht installiert und in keiner Lock-Datei
verzeichnet; sein `# == `-Kopf fehlte im Dump, die Ebene konnte sich also nicht auflösen
(19 statt 20 Bundles). Das ist der Unterschied zwischen „nicht nötig“ und „nicht vorhanden“.

## 4. Die drei Kandidaten: womit das gemessen ist

**Suchlauf (der Beweis, kein Urteil):** `grep -rn -i 'auto-review\|agent-team\|speech-to-text\|voice-input\|sensevoice'`
über `packages/`, `profiles/`, `scripts/`, `docs/contracts/`, `docs/probes/`.

Ergebnis (Stand nach §5, also ohne das entfernte Voice-Bundle): **zwei Treffer in
`profiles/shinon/package.json`** (`auto-review`, `agent-team`) — die Zeilen, die die
Bundles überhaupt erst laden. Kein `@shinon`-Paket liest `auto-review`, `agent-team` oder
`speech-to-text`; kein Gate, keine Probe, kein Test nennt sie. `speech-to-text`/
`voice-input`/`sensevoice` liefern jetzt **null** Treffer außerhalb dieses Dokuments. (Treffer in
`docs/probes/message-ingress.json`: der Beweistext nennt „experimentelle Agent-Team- und
Skill-Pfade“ als **Produzenten** von user-Nachrichten — also als Herkunft fremden Textes,
nicht als Konsumenten einer Fähigkeit dieses Repos.)

Dazu die Manifest-Aussagen, die die Risikoseite dieses Repos berühren (`AGENTS.md`:
„Defaults restriktiv“):

- **`auto-review`**: ohne das Preset `auto` (unser Default ist `workspace-write`/`ask`,
  Schritt 2.4) leistet es nichts; mit ihm wäre es eine **zweite** Freigabe-Instanz neben
  `permission-presets` — ein zusätzlicher Modellaufruf je Werkzeug.
- **`agent-team-profile`**: bringt Werkzeuge mit, die weitere Agenten starten — mehr
  Modellaufrufe, ohne dass ein Paket dieses Repos sie braucht.
- **`voice-input-bundle`**: das einzige Bundle, dessen Manifest einen **Download zur ersten
  Benutzung** ankündigt (lokales SenseVoice-Runtime). Ein Produktprofil, das im
  Startzustand unbemerkt etwas nachlädt, ist mit C7 („keine stillen Vollzüge“) nicht
  vereinbar, solange das nicht ausdrücklich gewollt ist.

Ihr Nutzen ist damit **nicht** widerlegt — nur belegt, dass ihn in diesem Baum **niemand**
abruft. Wer Spracheingabe oder Teams will, lädt sie bewusst.

## 5. Entscheidung: nur das Voice-Bundle geht (A4/C7)

Die Frage war, welche der drei Kandidaten im **Default-Profil** `shinon` bleiben. Die
Entscheidung des Auftraggebers vom 2026-10-11 ist **(b)**:

| Option | Wirkung | Ergebnis |
|---|---|---|
| (a) alle drei entfernen | kleinster Startzustand; `shinon` lädt nur `dsh-base`, `dsh-web-app` und die 14 eigenen Bundles | nicht gewählt |
| (b) nur `voice-input-bundle` entfernen | nimmt den einzigen First-Use-Download heraus, lässt Auto-Review und Agent-Teams als bewusste Extras drin | **gewählt und umgesetzt** |
| (c) alle drei behalten | unverändert; der Nachlade-Download müsste ausdrücklich als gewollt dokumentiert werden | nicht gewählt |

**Umgesetzt:** `@deepseek-ai/dsh-experimental-voice-input-bundle` ist aus
`profiles/shinon/package.json` entfernt — **18** Bundles (14 eigene, 4 fremde). Gemessen
danach: Profiltest **3/0** (18 Layer, 14 Repo-Bundles), Dump **54** Layer-Köpfe und **203**
Einträge, **0** Treffer für `voice`/`speech` im Dump, `dsh-test` 99/0, `gate:full` 18/18
(Exit 0). Auto-Review und Agent-Teams bleiben; wer Spracheingabe will, hängt das Bundle
bewusst wieder an.

## 6. Belege dieses Schritts

> **Fassungsfalle (gemessen):** alle Zahlen unten sind gegen das **Repo-`dsh`**
> (`node_modules/.bin/dsh`, `0.2.1-alpha.1`) erhoben — es muss **zuerst** im PATH stehen.
> Mit dem globalen `dsh` (`0.2.0-rc.2`, `/home/vannon/.local/opt/node-v22.23.3-linux-x64/bin`)
> liefert derselbe Befehl **54** Köpfe, aber **201** Einträge: die Fassung ändert zwei
> Einträge im Baum. Wer den Kopf zählt, sieht den Unterschied nicht; wer die Einträge
> zählt, muss die Fassung nennen.

```bash
export PATH="$PWD/node_modules/.bin:$PATH"   # Repo-dsh zuerst, sonst misst man 0.2.0-rc.2

# Umfang und Verdikte
node -p "require('./profiles/shinon/package.json').dsh.profile.bundles.length"        # 18
DSH_HOME=$PWD dsh --profile shinon --dump-config | grep -c '^# == '                   # 54
DSH_HOME=$PWD dsh --profile shinon --dump-config | grep -c '^- id: '                  # 203
DSH_HOME=$PWD dsh --profile shinon --dump-config | grep -ci 'voice\|speech'            # 0

# Die Kandidaten: wer liest sie?
grep -rn -i 'auto-review\|agent-team\|speech-to-text\|voice-input\|sensevoice' \
  packages/ profiles/ scripts/ docs/contracts/ docs/probes/                            # nach §5: 2 Treffer im Profil + 1 Beweistext (message-ingress.json)

# Manifest-Aussagen (Version und Rolle je fremdem Bundle)
node -p "require('./node_modules/@deepseek-ai/dsh-experimental-voice-input-bundle/package.json').description"
# "Experimental voice input with local SenseVoice; downloads its runtime on first use"

# Der Profiltest bestätigt die Auflösung (jede benannte Ebene erscheint im Dump)
node scripts/dsh-profile-test.mjs                                                      # 3/0, Exit 0
```

**Nicht geprüft in diesem Schritt:** ob die drei Kandidaten in einem *laufenden* Boot
stören (kein Browser-Boot in diesem Durchgang) und was sie im Boot an Zeit oder Speicher
kosten — das ist Sache von 4.1 (F1). Die Liste ist eine Verdrahtungs-, keine
Laufzeitmessung.
