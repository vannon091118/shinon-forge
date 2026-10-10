# Shinon Forge — Systemanalyse und Übergabe

> **Status:** historical — abgeschlossener Stand, keine Quelle für aktuelle Zahlen. **Stand:** 2026-10-07
> **Einstieg:** `Docs/INDEX.md` · **Zahlen (aktuell):** `Docs/ZAHLEN.md`

Diese Datei ist die belastbare Übergabe an den nächsten Agenten. Sie ist aus den tatsächlichen Repositories vannon091118/Falsify_Me, vannon091118/propsa, vannon091118/Feed-the-Floor-Bleed, vannon091118/DOKI, vannon091118/Shinon_Agent (inkl. Promtguard-main und .archive/commit-layer-master) sowie dem aktuellen Stand von vannon091118/shinon-forge (Commit d275db09477b409868081130fb1b8614b61fe953, Arbeitsbaum danach um `@shinon/persona` weiter) gebildet. Annahmen oder frühere Zusammenfassungen wurden nicht weitergeführt.

## Quellenübersicht — woher jedes System wirklich kommt

Die Herkunft wurde per GitHub-Abfrage (`gh repo list vannon091118`, `gh repo view`) und per Klon gelesen, nicht erinnert.

| System | Tatsächliche Quelle | Zugriffsstand |
|---|---|---|
| Falsify_Me | `vannon091118/Falsify_Me` (public), Branch main | geklont und gelesen |
| PROPAKT / propsa | `vannon091118/propsa` (public), Branch main | geklont und gelesen |
| Shinon Gate Engine | `vannon091118/Feed-the-Floor-Bleed` (public) — Gate-Code unter `Feed-the-Floor-Bleed/scripts/shinon/`, daneben die Dorf-/Spielserver-Architektur | geklont und gelesen |
| DOKI | `vannon091118/DOKI` (public) | geklont und gelesen |
| Promtguard | **kein eigenes Repository** — `Promtguard-main/` liegt in `vannon091118/Shinon_Agent`; Interface-Spec unter `Shinon_Agent/interface-specs/promtguard.contract.json` | im Shinon_Agent-Klon gelesen |
| SyxCraft Commit Layer | **kein eigenes Repository** — der Layer liegt als `.archive/commit-layer-master/` in `vannon091118/Shinon_Agent` (Default Branch dort: master/material) | im Shinon_Agent-Klon gelesen |
| Shinon-Persona-Kern | `vannon091118/Shinon_Agent` (public), `fusion-main/fusion/shinon/` + `interface-specs/` | geklont und gelesen |
| Shinon Forge | `vannon091118/shinon-forge` (public), Ziel-Repo dieses Auftrags | lokaler Arbeitsbaum |

Zusätzliches Material im Shinon_Agent-Klon, das nicht zum Auftrag gehörte, aber für den nächsten Agenten relevant ist: `karma-main/` (Autoritäts-/Fakten-Kernel, vgl. `karma_facts` in den Contracts), `limen-main/` (Router/Retry/Key-Pool), `PRISM` als eigenes Repo (Visualisierungs-Dashboard), `ShinonLLM-main/`. Diese vier wurden hier **nicht** analysiert und dürfen nicht als geprüft gelten.

## 1 · FALSIFY_ME

### Quelle
- Repository: vannon091118/Falsify_Me, main; Lesestand aus dem geklonten Checkout.
- Wichtigste Dateien: README.md, core/verdict.mjs, core/probes.mjs, core/twin.mjs, core/feasibility.mjs, core/evidence.mjs (via verdict.mjs exportiert), core/agent.mjs, core/tools.mjs, cli/run.mjs, artifacts/jobs.mjs, artifacts/loops.mjs, artifacts/handoff.mjs, HANDOFF.md, WIRING.md, tests/probes.test.mjs, tests/twin.test.mjs, tests/verdict.test.mjs, tests/full-loop-e2e.test.mjs, tests/full-loop-negative.test.mjs.

### Primäre Rolle
Read-only Falsifikations-Gateway für Coding-Agenten: ein Claim wird unabhängig gegen die echten Dateien geprüft, und nur FalsifyMe entscheidet über WRITE.

### Welches Problem löst es?
Agenten können dieselben Dateien lesen, aus denen ihr eigenes Plan entstanden ist, und finden dann „keine Fehler". FalsifyMe macht diesen Selbstbestätigungs-Zirkel unmöglich, indem es einen zweiten, kontextgetrennten Prüfer einsetzt und WRITE erst nach vollständig bestätigten Proben freigibt.

### Kernlogik
1. USER / AGENT CLAIM → Scope-Header (User-Input 1:1) wird beim Scope-Start in die SQLite gespeichert und bleibt in allen Prompts.
2. Anforderungen / Header → deterministisch: `splitRequirement(HEADER/Plan)` zerlegt Absicht in H1..Hn als Original-Spans (Satzenden, Semikolon, Mini-Fragment-Merge, Tail-Merge-Kappe). Kein LLM, keine Paraphrase.
3. Probe-Erzeugung → Thinker liefert je Anforderung mindestens eine Probe als JSON-Set mit `id`, `requirement_ref ∈ {H1..Hn}`, `class ∈ {claim-check, edge-case, regression, security, contract}`, `target`, `claim`, `check`.
4. Formale Validierung → `validateProbeSet(probes, {requirementSource, root, whitelist})` prüft ausschließlich Struktur und Abdeckung: Schema, `requirement_ref` nur originale H-IDs, jede H_i ≥ 1 Probe, Target existiert unter Root, bei Whitelist-Vertrag in der Whitelist, Anti-Vakuum-Minima (`CLAIM_MIN=16`, `CHECK_MIN=24`), Müllfilter gegen reine Lob-/Bestätigungsformulierungen, keine doppelten IDs. Keine Semantik, keine Qualität.
5. Unabhängige Prüfung → Thinker fungiert als erster Falsifikations-Agent; sein Befund und die Falsifikationsversuche werden für das nächste Fenster bereitgestellt.
6. Evil Twin → `runTwinCheck` / `runProbeExecution` starten eine zweite, kontextgetrennte Konversation, die nur Header, Plan, BEFUND und die Falsifikationsversuche oder das validierte Probe-Set sieht — nie das Reasoning des Erstlaufs, nie Findings-Historie, nie SubPrompt. Der Twin ist der einzige Semantik-Exekutor; sein Status je Probe ist `BESTAETIGT | WIDERSPRUCH | UNKLAR`.
7. PLAN / RESEARCH / ASK / WRITE → `computeVerdict` entscheidet ausschließlich aus den Ergebnissen: erst wenn Probe-Set gültig, Twin vollständig, jede Pflicht-Probe BESTAETIGT, jede Bestätigung mit nachgewiesenem eigenem Lesen und verifizierter Referenz, und harte Gates grün → WRITE, sonst PLAN mit Grundliste. `exitCodeOf` bildet WRITE→0, PLAN/RESEARCH→1, ASK→5, fehlerhaft→3 ab.

### Wichtige Datenmodelle
- Scope-Job in SQLite (WAL), mit `JOB_ID`, `scope_id`, `header_digest`, `change_digest`, `whitelist`, `runtime_config`, `loop_state`.
- Probe-Set: Array von Probe-Objekten mit `id`, `requirement_ref`, `class`, `target`, `claim`, `check`.
- ProbeResult[]: `{probe_id, status, evidence}` plus Twin-Laufmetriken `toolRounds`, `toolEvidence`.
- Verdict: `WRITE` oder `PLAN` mit `reasons[]`.
- Handoff: versionierter `falsify handoff brief|report|complete`-Vertrag mit before/after/diff-Digests, `parent_job_id`, `handoff_id`, `iteration_id`, `change_digest`, `header_digest`, idempotent bei doppelten Reports.
- Scope-Protokoll: Tools sind read-only (`list_dir, read_file, glob`), Root-Grenzen werden durchgesetzt, Whitelist-Kontraktion, `--files` als Zugriffsrahmen.

### Persistenz
- `FALSIFY_HOME/falsify.db` (SQLite WAL) außerhalb des Repos: Jobs, Scopes, Findings, Loop-Zustände, atomarer Worker-Claim.
- `FALSIFY_HOME/logs/` für Worker- und Antwortprotokolle.
- `FALSIFY_HOME/.env` für API-Keys (nur dort, nie im Repo, nie in `config.json`).
- `FALSIFY_HOME/config.json` für optionale Laufzeitkonfiguration.
- Checkout-lokaler Identifier `FalsifyME.md` im Zielprojekt (PROJECT_ID / CHECKOUT_ID), wird automatisch in die projekt-eigene `.gitignore` eingetragen.
- Finale Job-Zustände sind unveränderlich: `jobDone` lehnt zweiten Abschluss ab (`false`, keine Exception), ein späterer Fehlerpfad kann ein persistiertes WRITE nie umschreiben.

### Determinismus
- Deterministisch: `splitRequirement`, `parseProbeSet`, `validateProbeSet`, das Evidence-Gate pro Probe (`twinEvidenceOk`, `anchoredFileLine`), `computeVerdict`, `exitCodeOf`, die Loop-Übergangsmaschine in `artifacts/loops.mjs`, die `advanceLoop`-Dienst-Trennung in `artifacts/loopflow.mjs`, der `completeHandoff`-Orchestrierer in `artifacts/handoff.mjs`.
- Nicht deterministisch: die Thinker- und Twin-Modell-Antworten, API-Fehler/Timeouts, Tool-Rundenanzahl, Modell-Choice über live `/models`.

### Authority
- FalsifyMe darf Entscheidungen treffen über WRITE vs. PLAN/RESEARCH/ASK.
- FalsifyMe schreibt nur in seine eigene Queue und Handoff-Protokolle; es schreibt niemals in das zu prüfende Projekt (einzige Ausnahme: vom Nutzer bestätigte Workflow-Instruction).
- Verdict-Hoheit liegt ausschließlich beim Falsifikations-Agenten (Modell); der deterministische Pre-Check in `core/feasibility.mjs` liefert nur Kontext-Hinweise und erteilt kein Verdict.

### Fail-Open / Fail-Closed
- Fail-closed durchgehend: ohne gültiges Probe-Set → PLAN; ohne Twin-Ergebnis → PLAN; jede Nicht-BESTAETIGT- oder UNKLAR-Probe → PLAN; fehlende Evidence-Beweise → PLAN; strukturelle Blocks, SCOPE-DIVERGENZ, oder Dateiänderungen während der Prüfung → PLAN. API-Fehler/Timeouts beim Twin erzeugen ALLE Proben als UNKLAR, nie als Freigabegrund.
- Fail-closed wird auch im Loop enforced: `NO_CHANGE`, Änderungen außerhalb der Whitelist, fremde/korrupte Reports, erreichtetes Loop-Limit → `LOOP_BLOCKED`/`ABORTED` statt Re-Review. Wiederholtes Einreichen desselben Reports ist idempotent (ein Re-Review, kein zweites).

### Replay
- Replaybar: die Prüfkette (Splitter → Validator → Gate) ist reine Funktion; Loop-Zustände, Handoff-Korrelation und finale Job-Zustände sind in SQLite reproduzierbar; `header_digest` + Basis-`change_digest` werden bei Submit und Direkt-Run eingefroren, sodass ein abgedrifteter Header den Job vor jedem Modell-Call abstellt.
- Nicht replaybar im engeren Sinne: die tatsächlichen Modell-Antworten und Tool-Runden sind externe Effekte; der Loop selbst ist deterministisch in seinen Zustandsübergängen, nicht in den Modellausgaben.

### Was ist bewiesen?
- `core/probes.mjs` und `core/twin.mjs` liefern die implementierte und getestete P0-Probe-Kette; `cli/run.mjs` ruft Validator + Twin für WRITE-Kandidaten auf und prüft mtime/Größe der Whitelist-Dateien vor/nach der Twin-Ausführung.
- Exit-Code-Parsing (`parseVerdict`, `exitCodeOf`), `parseBefund`, `parseScopeDivergence` sind implementiert und hart gegen Markdown-Varianten gesichert.
- Der versionierte Handoff-Bahn (`falsify handoff brief/report/complete`) und die Re-Review-Automatik (`RE_REVIEW_QUEUED`) sind implementiert, e2e-getestet und negativ-getestet (`NO_CHANGE`, Loop-Limit, unautorisierte Pfade, gefälschte Korrelation).
- Loop-Zustandsmaschine und -Dienst sind azyklisch getrennt; `completeHandoff` ist idempotent bei 100 identischen Reports.

### Was ist nur implementiert?
- Reader-/Writer-State, Worker-Liveness, Dock/UI-Integration, Onboarding-Dialog, Bootstrap-Integration, Settings/Keys/Home-Verwaltung, TUI-Events und der volle Produktions-Loop sind vorhanden und teilweise e2e-getestet.

### Was ist STUB / NOT_VERIFIED / NOT_IMPLEMENTED (laut HANDOFF.md)?
- Unveränderliche Per-Job-Runtime-Snapshots und explizite Overrides: `core/config.mjs` hat Snapshot-Logik, aber nicht alle Pfade sind verdrahtet; Worker stellt Snapshot nicht vor Jobstart wieder her.
- Strukturierter Attack-Round-/NO_EVIDENCE-Workflow als separater Runtime-Vertrag: nicht abgeschlossen.
- Vollständige Retry-/Crash-Orchestrierung für Workers/Provider: nicht vollständig verdrahtet, Retry-Metadaten dürfen nie terminale Jobs wieder öffnen.
- CLI-Help-Audit für alle Subkommandos, Doctor-/Uninstall-Härtung, opt-in Allowlist-Web-Recherche, finales Staging/Audit: offen.
- Die volle USER-AGENT → REPOSITORY CHANGE → THINKER Loop-Hälfte ist laut Audit nicht vollständig automatisch verdrahtet; `HANDOFF.md` markiert das ehrlich als BLOCKED.

### Welches darf in Shinon Forge übernommen werden?
- Die 7-Punkt-Regel-Grammatik und das Verbot von „reine Prosa = Evidenz" sind als Governance-Konzept übernahmbar.
- Das Prinzip „Write-Freigabe nur nach unabhängiger Gegenprüfung" ist das architektonische Rückgrat für @shinon/verify.
- Das Claim-/Probe-/Validator-/Twin-Modell ist das Muster für eigenständige Falsifikation, aber nicht als Fork der gesamten Runtime.
- Die Fail-Closed-Logik, das ID-/Digest-Einfrieren, die idempotente Re-Review- und Loop-Übergangsdisziplin sind übertragbar auf Shinon-Claims, Evidence und Releases.

### Was darf NICHT übernommen werden?
- Die gesamte FalsifyMe-Runtime mit TUI, Dock, Installer, Skill-Integration, Desktop-Pfade, Worker-Liveness als eigenständige Sub-Runtime in shinon-forge.
- Die Whitelist-/Scope-/Root-Sandbox-Pflichtfelder sind FalsifyMe-eigen und nicht 1:1 in DSH/Shinon zu übernehmen; Shinon braucht eigene Zugriffs- und Scope-Modelle.
- Der gesamte Loop als fertiger Code; Shinon baut eigenständig, wie Claims, Twin und Write-Entscheidung in seiner Runtime aussehen.

### Empfohlene Shinon-Funktion
- @shinon/claims
- @shinon/verify
- @shinon/evidence

## 2 · PROPAKT / PROPSA

### Quelle
- Repository: vannon091118/propsa, main.
- Wichtigste Dateien (im Repo `propsa`): README.md, docs/wiki/Bausteine.md, `propsa/packages/core/src/vertrag.ts`, bausteine/vertrage/*.contract.json, bausteine/geraest/*.ts, bausteine/AGENTS.md, tests/vertrag.test.ts, scripts/pruefen/vertragsGates.mjs, package.json.

### Primäre Rolle
Gemeinsame Vertragssprache und Statusdisziplin: ein Baustein wird durch sieben Punkte und vier Zustände beschrieben, nicht durch Code, den man raten muss.

### Welches Problem löst es?
Ohne gemeinsame Grammatik muss jeder Verbraucher jeden Baustein auf eine andere Struktur lesen. propsa gibt allen Regeln dieselbe Sieben-Punkte-Form und allen Baustein-Status dieselben vier Werte, sodass „ist das implementiert?" beantwortbar wird.

### Kernlogik
Jeder Vertragsabschnitt trägt dieselben sieben Punkte:
- POSITIVE: der Fall, in dem die Regel gilt.
- FORBIDDEN: der Fall, der abgewiesen wird.
- FALLBACK: was bei Nichterfüllung passiert.
- ERROR: maschinenlesbarer Fehlerstatus.
- TRACE: Herkunfts-/Provenienzkette.
- REPLAY: Replay-Verhalten.
- INVARIANT: testbare Zusicherung.

Eine Regel gilt erst als umgesetzt, wenn alle sieben Punkte belegbar sind; sonst ist sie Behauptung.

Vier Zustände:
- IMPLEMENTED: gebaut und durch die sieben Punkte belegt.
- STUB: Signatur steht, Logik fehlt — bewusst offen (Entscheidung, es nicht zu bauen, ist getroffen; das ist eine Aufgabe).
- NOT_IMPLEMENTED: nicht angefangen.
- NOT_VERIFIED: gebaut, aber die Belege fehlen (offener Prüfposten).

STUB und NOT_VERIFIED sind nicht dasselbe. STUB ist eine bewusste Entscheidung; NOT_VERIFIED ist ein ungeprüfter Build.

Verträge sind Prüfobjekte: `regelVollstaendig` prüft die Sieben-Punkte-Füllung, `statusBekannt` prüft die Statusmenge. Die drei Kataloge (TypeScript, Rust, Muster/Verträge) werden als Regel 9 verglichen, damit Spiegelung keine zweite Wahrheit wird.

### Wichtige Datenmodelle
- `Regel` mit `gate` + allen sieben Pflichtpunkten.
- `Vertrag` mit `name`, `position`, `zusagt[]`, `nicht_zugesagt[]`, `regeln[]`.
- `VertragsStatus` mit `overall`, `sections`, `last_verified_against_code`, `known_gaps`.
- Baustein-Positionen 0..3, einseitige Abgabe nach unten (keine zyklischen Aufwärtsaufrufe).

### Persistenz
- Verträge sind Dokumente, keine Runtime: `bausteine/vertrage/*.contract.json`, `propsa/packages/core/src/vertrag.ts`, gespiegelt in `propsa/tauri-app/src-tauri/src/vertrag.rs`.
- Status ist dokumentiert, kein laufender Service-Zustand.

### Determinismus
- Deterministisch: Grammatik selbst, die Vollständigkeitsprüfung, die Statusprüfung, der Katalog-Vergleich.
- Nicht deterministisch: die Frage, ob ein Baustein tatsächlich die behauptete Realität hat, wenn er NOT_VERIFIED ist.

### Authority
- propsa erhebt keine Runtime-Authority; es definiert nur die Form und den Stand.
- Es unterscheidet klar: Vertrag vs. Funktion; Muster vs. Code.

### Fail-Open / Fail-Closed
- propsa selbst ist keine Runtime-Entscheidung; seine Force ist Transparenz: ein Baustein mit nur Absichtserklärungen ist kein IMPLEMENTED.
- Im Baustein-Entwurf gibt es zwei fail-Richtungen: Prüfung ist fail-closed (im Zweifel zurückhalten), Beobachtung ist fail-open (Darf den beobachteten Prozess nie blockieren).

### Replay
- Replaybar: die Grammatik und die Katalogprüfung sind reproduzierbar.
- Nicht replaybar als Semantik: was ein Baustein in der Laufzeit tatsächlich tut, hängt von der Implementierung ab, nicht vom Vertrag.

### Was ist bewiesen?
- Die Sieben-Punkte-Form und die vier Zustände sind als gemeinsamer Contract definiert; `vertrag.ts` exportiert die Typen und Prüfungen; `bausteine/vertrage/01-vermittlung.contract.json` zeigt ein konkretes Beispiel mit `implementation_status` und `known_gaps`.

### Was ist nur implementiert?
- Der Typvertrag und die Validierungsfunktionen sind echt; die Vertrags-JSON-Beispiele sind formale Verträge; einige Prüfskripte existieren.

### Was ist STUB / NOT_VERIFIED / NOT_IMPLEMENTED?
- Laut docs/wiki/Bausteine.md steht sechs der sieben Bausteine auf STUB; ein Baustein (Integration) ist IMPLEMENTED.
- Die Geraeste in `bausteine/geraest/` sind bewusst leer.
- Von den sieben Bausteinen ist einer umgesetzt, zwei haben echte Teilbestände, vier sind leer.
- PROPAKT selbst nutzt weiterhin drei fest verdrahtete Anbieter; der Scanner in PROPAKT ist Erzeuger von Kritik, nicht Prüfer im propsa-Baustein-Sinn.

### Welches darf in Shinon Forge übernommen werden?
- Die Sieben-Punkte-Grammatik als gemeinsame Governance-Sprache für Shinon-Persona, Memory, Narrative, Claims, Verification und Branding-State.
- Die vier Statuswerte als verbindliche Redeweise, was „fertig" bedeutet, und besonders die STUB/NOT_VERIFIED-Trennung.
- Das Prinzip, dass jede Shinon-Regel alle sieben Punkte tragen muss, wenn sie als implementiert gilt.
- Die Abgrenzung Vertrag vs. Runtime-Code als Denkweise, nicht als separaten Service.

### Was darf NICHT übernommen werden?
- propsa nicht als separaten Runtime-Service einplanen.
- Die konkrete Baustein-Menge (Vermittlung/Prüfung/Beobachtung/Prompts/Laufzeit/Übersicht/Integration) 1:1 übernehmen; Shinon braucht eigene Bausteine nach derselben Grammatik.
- Die Abhängigkeit von PROPAKTs Scanner/Kritik/LLM-Beratung/Deskop-App als Shinon-Infrastruktur.

### Empfohlene Shinon-Funktion
- @shinon/contracts (als Grammatik und Statusdisziplin im Code, nicht als Service)

## 3 · FEED-THE-FLOOR-BLEED — SHINON GATE ENGINE

### Quelle
- Repository: vannon091118/Feed-the-Floor-Bleed, main.
- Wichtigste Dateien (im Repo `Feed-the-Floor-Bleed`): `Feed-the-Floor-Bleed/scripts/shinon/engine.mjs`, `Feed-the-Floor-Bleed/scripts/shinon/policy.json`, `Feed-the-Floor-Bleed/scripts/shinon/policy.mjs`, `Feed-the-Floor-Bleed/scripts/shinon/lib/engine-policy.mjs`, `Feed-the-Floor-Bleed/scripts/shinon/plugins/*.mjs` (insbes. commit-integrity.mjs), `Feed-the-Floor-Bleed/scripts/shinon/prepare-commit-msg.mjs`, `Feed-the-Floor-Bleed/scripts/shinon/commit-msg.mjs`, `Feed-the-Floor-Bleed/scripts/shinon/policy-schema.mjs`, .github/workflows/shinon.yml, docs/ARCHITEKTUR.md.

### Primäre Rolle
Technische Gate-Ausführung und Governance-Enforcement auf Git-Änderungen: Scope → relevante Plugins → PASS/FAIL.

### Welches Problem löst es?
Lokale Hooks sind umgehbar (--no-verify, klone Ignorierung, core.hooksPath). Ein vollständiges Gate muss die tatsächlichen Commits und den tatsächlichen Stand prüfen und darf nicht nur auf dem lokalen Rechner sitzen.

### Kernlogik
1. Git Diff / Scope → engine.mjs bestimmt die geänderten Dateien.
   - `SLICE` (Standard) nutzt `git diff --cached --name-only` für gestagte Änderungen.
   - `--full` / `--push` nutzt Union aus `git diff --name-only HEAD` und `git diff --cached --name-only`.
   - `--local` nutzt keinen Diff; seine Menge steht fest in der Policy.
2. Relevante Gate-Plugins → Plugins werden aus `Feed-the-Floor-Bleed/scripts/shinon/plugins/*.mjs` geladen; `policy.mjs` validiert, dass die im Policy konfigurierten Plugins auch als Dateien existieren und umgekehrt.
3. Policy entscheidet, welche Plugins laufen → `shouldRun(pluginName, changedFiles, forceFull, policy)`:
   - `forceFull` → alles.
   - Plugin in `policy.engine.always` → immer.
   - Plugin hat einen Slice → nur wenn geänderte Dateien dazu passen (`matchesSlice` prüft `prefixes` und `contains`).
   - Sonst → true.
   - `shouldRunLocal` nutzt nur `policy.engine.local`.
4. PASS / FAIL → jedes Plugin wird als eigenständiger `node`-Prozess mit `--changed <list>` aufgerufen; Nicht-0 → FAIL; bei einem FAIL bricht die Engine ab mit Exit 1 und „Shinon Verdict: FAIL".

### Wichtige Datenmodelle
- Policy als versionierte JSON-Struktur:
  - `engine.always`: globale Gates, die immer laufen.
  - `engine.local`: kürzere Teilmenge für lokale Hooks.
  - `engine.slices`: Plugin → `{prefixes, contains}`.
  - `source`, `globalLoc`, `locCaps`, `deadCode`, `coreDeterminism`, `falsePositive`, `redundancy`, `contracts`, `modularity`.
- Plugin-Vertrag: jedes Plugin muss `--changed` akzeptieren und 0/1 als Exit-Code liefern.

### Persistenz
- Keine Runtime-Persistence im engeren Sinne; die Policy ist versioniert; das git-Repo ist der Zustand.
- commit-integrity nutzt git-Historie (Range, Inhalts-Commits, Merge-Commits), um Commit-Regeln remote zu prüfen statt nur per lokalem Hook.

### Determinismus
- Deterministisch: Scope-Bestimmung per git-Befehle, Plugin-Auswahl aus der Policy, Plugin-Ausführung pro geänderter Dateiliste, Policy-Validierung.
- Nicht deterministisch: Inhalt der geänderten Dateien selbst, was die Plugins daraus ableiten; Plugin-Ausgaben sind Substrate der Prüfung, nicht der Engine.

### Authority
- Die Engine entscheidet nur PASS/FAIL für den Commit-Zugang; sie schreibt nicht in den Code.
- commit-integrity ist eine Authority für Commit-Text-Integrität auf der tatsächlichen Commit-Revision; sie blockt bei Verstößen.

### Fail-Open / Fail-Closed
- Fail-closed: eine einzelne Plugin-Failure führt zu Exit 1 und blockiert den Commit.
- Die lokale Teilmenge ist bewusst kürzer als `always`, damit das schwere Material (Typecheck, Redundanz, Contract-Schema, Slices) im Remote-Job `Shinon Gate` mit `--full` läuft; die lokale Menge darf keinen Commit durchlassen, der remote scheitert — das wird in Tests gegen `always` geprüft.

### Replay
- Replaybar: dieselbe Diff-Situation und dieselbe Policy ergeben dieselbe Plugin-Auswahl; gleiche Commit-Range ergibt bei commit-integrity dieselbe Ergebnismenge.

### Was ist bewiesen?
- Engine, Policy-Validierung und Plugin-Ladung sind implementiert; `commit-integrity` prüft die tatsächlichen Inhalts-Commits einer Range und umgeht synthetische Test-Merges.
- Die Trennung zwischen lokaler Minimal-Menge und vollem Remote-Gate ist so konzipiert, dass kein lokal gelaufenes Plugin remote fehlen darf; das ist als Testgedanke vorgesehen.

### Was ist nur implementiert?
- Die modulare Plugin-Struktur, die Policy, die lokale/volllose Unterscheidung, commit-integrity als Remote-Kontrolle und die Hook-Kopplung (`prepare-commit-msg`, `commit-msg`) sind vorhanden.

### Was ist STUB / NOT_VERIFIED / NOT_IMPLEMENTED?
- Die einzelnen Plugins sind Teil des Systems, aber die Engine ist bewusst nicht als fertige Gesetzmäßigkeit für alle Governance-Aspekte ausgelegt; das Schwere (Compilerlauf, Redundanz, Contract-Schema und Slices) gehört ins Remote-Gate.
- Ob alle Plugins für Shinons spätere Runtime-Gates (Runtime, Evidence, Persona, Narrative, Release) direkt sinnvoll sind, ist nicht aus der Policy allein bewiesen.

### Welches darf in shinon-forge direkt als eigenes JS-System weitergeführt werden?
- Der modulare Gate-Runner und die Policy-getriebene Plugin-Auswahl sind direkt übernehmbare JS-Architektur.
- commit-integrity als Remote-Integritätsprüfung für Commits (nicht nur lokaler Hook) ist ein starker Baustein für Shinons Release- und Commit-Gates.
- Die Trennung zwischen schnellem lokalen Gate und schwerem Remote-Gate ist einprügbar in Shinons Governance-Hooks und CI.

### Was bleibt bewusst nur Referenzprinzip?
- Die konkrete Plugin-Signatur (`--changed <list>`) und die Policy-Struktur müssen für Shinon neu definiert werden, wenn Shinon andere Scope-Modelle hat.
- Die gesamte Gameplay-/Dorfszene-/Server-Architektur des Feed-the-Floor-Bleed Repos ist kein Shinon-Baustein; nur das Gate-Konzept ist übertragbar.

### Empfohlene Shinon-Funktion
- @shinon/gates (als JS-Policy- und Plugin-Runner für Commit/Runtime/Evidence/Persona/Narrative/Release-Gates)

## 4 · DOKI

### Quelle
- Repository: vannon091118/DOKI, main.
- Wichtigste Dateien (Verzeichnis `src/` am Klon verifiziert): CONTRACT.md, CONTEXT.md, src/observer.mjs, src/observer-store.mjs, src/replay.mjs, src/runtime.mjs, src/narrator-context.mjs, src/narrator-catalog.mjs, src/commit-narrator.mjs, src/thinker-orchestrator.mjs, src/contracts.mjs, src/falsify-adapter.mjs, src/history.mjs, src/prompt.mjs, src/blocks.mjs, src/etats.mjs, src/signals.mjs, src/ensemble-state.mjs, src/vocabulary.mjs, src/model.mjs, src/atled.mjs, src/bridge.mjs, src/cli.mjs, src/db.mjs, src/hash.mjs, src/qlearning.mjs, src/reconstruction.mjs, src/ylamona.mjs, tests/.

### Primäre Rolle
DOKI ist die Basisplattform für persistente, rekonstruierbare Akteure mit Observation, Memory, Narrative, Provenance und Confidence-Domänen — und gleichzeitig ein Add-on-Vertrag, der Falsify/LIMEN nicht als Kern definiert.

### Welches Problem löst es?
Einzelne LLM-Aufrufe sind nicht persistent und nicht rekonstruierbar. DOKI macht den Akteur zum Zustandswechsel über Events, nicht zum einmaligen Prompt.

### Kernlogik
- REALITY → OBSERVATION → SECOND BRAIN → NARRATIVE / AGENT STATE → REACTION / OUTPUT.
- Der Beobachter (`DokiObserver`) ist eine Skeleton-Schicht: `ingest(event)` lehnt Duplicates über `observationId` ab, speichert die Observation im Store, setzt Cursor und Zähler.
- `observationId` ist die Identität: bei vorhandenem `source_event_id`/`event_id` nimmt es dieses; sonst den Inhalts-Hash über `{type, text}`. Seq ist nur Ordnung, nie Identität.
- Der persistente Store (`createPersistentStore`) schreibt Observationen, Cursors, Thinker-Slot-Reservierungen (atomic `BEGIN IMMEDIATE`), Bridge-State, narrative Outputs, Characters, Memories, Relationships, Threads, Perspectives, Beliefs, Conflicts, History-Runs — alles mit `rule_version` + Digests.
- Replay und Live-Observation sind getrennt:
  - `ingest_cursor` gehört der Live-Pipeline (ingest).
  - `observation_cursor` gehört der Replay-Pipeline (loop_events).
  - `replayTerminalEvents` liest Events, wählt ab Cursor, verarbeitet mit `processEvent`, und rückt den Cursor erst vor, nachdem `processEvent` zurückgekehrt ist — Crash vor dem Schritt bedeutet Replay des Quell-Events.
- `processEvent` ist der zentrale Runtime-Vertrag: er prüft Adapter-Vertrag, snapshotet, behauptet die Update-Transaktion, erkennt Gaps, persistiert Observation/Phase-Report, und führt Narration nur bei geöffnetem Thinker-Slot durch.
- Narrative entsteht aus Observation + Report + History + Ensemble + Care + Evidence → `buildNarratorContext` und `compilePrompt` → Thinker. Die Narrative ist abgeleitet und trägt keine technische Autorität.
- DOKI trennt drei Confidence-Domänen: `capture_confidence`, `inference_confidence`, `policy_relevance_confidence`. Automatische Übertragung capture → inference ist verboten.
- DOKI trennt `DERIVED ≠ AUTHORITY` klar: Narrative annotiert State als abgeleitet; Prosa bewegt State nicht; State braucht Runtime-Ursache.
- Der Scheduler (Concept) trennt Cause von stilistischer Deduplikation (Museum Break), Screen-Time-Balance, User Bias, Seeded RNG. Der leere Kandidatenfall ist legitim mit `NO_SPEAKER_REASON`.
- Output-Vertrag: jeder Input bekommt eine Antwort; Output-Klassen sind LOCAL / NARRATIVE / LLM; LLM-Failure ist kein Runtime-Failure.

### Wichtige Datenmodelle
- Event mit `event_type`, `source`, `payload`, `timestamp`, `correlation_id`.
- Observation mit `observation_id`, `source_event_id`, `job_id`, `scope_id`, `event_type`, `observed_text`, `observed_at`, `event`.
- Phase-Report mit `schema`, `update_id`, `loop_event_ref`, `job_id`, `scope_id`, `phase`, `from_state`, `to_state`, `verdict_ref`, `wave_refs`, `history_refs`, `correlation_status`, Digests.
- Narrator-Context mit `schema`, `narrator`, `authority: 'NONE'`, `source`, `care`, `ensemble`, `evidence`, `constraints`.
-CARE-Stufen: `CLAIM`, `ATTACK`, `RE_EVALUATE`, `EVIDENCE`.
- Zustandsregeln mit `rule_version` (z. B. `doki.character/v1`, `doki.memory/v1`, `doki.relationship/v1`).

### Persistenz
- DOKI schreibt in eine eigene SQLite-DB (Observer-Observations, Cursors, Thinker-Slot, Bridge-State, narrative_outputs, character_states, character_memory, relationships, relationship_events, threads, thread_observations, perspectives, beliefs, conflicts, history_runs, update_jobs, phase_reports, prompt_runs, gaps, anomalies, dialog_messages, q_table).
- Narrative Outputs sind historische Fakten: `INSERT OR IGNORE` — der erste Write gewinnt.
- Finale Job-Zustände sind unveränderlich; `jobDone` lehnt zweiten Abschluss ab.

### Determinismus
- Deterministisch: Cursors, Cursor-Digests, Update-Claim-Logik, Observation-Deduplikation nach `observation_id`, die Report-/History-/Prompt-Digests, die Ableitung von Ensemble/StateKey/Relevance, die Template-/Block-Auswahl in der Prompt-Assemblierung.
- Nicht deterministisch: die Thinker-/LLM-Antwort, die Wahl des ModelCall, das Modell-Verhalten, externe Adaptersignale.

### Authority
- DOKI hat keine technische Autorität über den FalsifyMe-Verdict oder die technische State Machine; `authority` im Narrator-Kontext ist ausdrücklich `NONE`.
- DOKI darf nicht die DB manipulieren, die technische State Machine verändern, den Scope brechen, Agents blockieren oder mit der Coding-LLM kommunizieren.
- DOKI darf ableiten, aber nichts Abgeleitetes wird zur Autorität ohne explizite Runtime-Regel.
- Narrative betreibt kein Prose-to-State-Pfad.

### Fail-Open / Fail-Closed
- Beobachtung ist fail-open: ein Fehler darf den beobachteten Prozess nie blockieren.
- DOKI selbst ist nicht Fail-Closed im Sinne einer Schreib-Entscheidung; es ist eine Interpretations- und Narrative-Schicht.
- Der Slot-Gate (`windowOpen`) ist ein Port; standardmäßig injiziert der falsify-adapter die alte Wahrheit „DOKI denkt nur, wenn FalsifyMe schläft". Das ist eine Port-Signatur, keine feste FM-Tabelle.
- Unbekannter Adapter-Vertrag → `UNAVAILABLE`, nicht stiller Durchlauf.

### Replay
- Replaybar: die Replay-Pipeline replays Events ab dem `observation_cursor`, und der Cursor verschiebt sich erst nach erfolgreicher `processEvent`-Rückkehr, so dass Crashes vor dem Schritt korrekt wiederholt werden.
- Replaybar: gleiche Events ergeben dieselbe Cursor-/Observation-Abfolge und dieselben persistierten Reports/Outputs (abgesehen von LLM-Ausgaben).
- Nicht replaybar im Gesamtprosa-Sinn: die narrativen Outputs sind LLM-abhängig.

### Was ist bewiesen?
- Der Vertrag mit sieben Punkten pro Regel, die Confidence-Domänen, die Narrative-Richtungsregel, die Identitätsregeln, die Epistemik-Regeln, der Memory-Inklusions-Gate, der Output-Vertrag und der Scheduler-Konzept sind vertraglich ausgearbeitet.
- Beobachter-Skeleton und persistenter Store sind implementiert; `replayTerminalEvents` und `processEvent` sind implementiert und zeigen die Replay-/Live-Trennung.
- Der Narrator-Kontext und die Care-Stufen sind implementiert.

### Was ist nur implementiert?
- Der Runtime-Vertrag `processEvent`, die Prompt-Assemblierung, die Narrator-Kontextbildung, der Store, der Observer-Skeleton, der Replay-Cursor, die etats-/ensemble-/block-/signal-/vocabulary-Pfeiler sind vorhanden.

### Was ist STUB / NOT_VERIFIED / NOT_IMPLEMENTED?
- Viele Module sind Skeleton oder Ports mit begrenzter Semantik gegenüber einer vollen Akteur-Plattform.
- Der volle Add-on-Vertrag, der volle Scheduler, die volle Beziehungs-/Perspektiven-/Glaubens-Semantik, die volle Q-Lern-/Replay-Lern-Semantik sind nicht als abgeschlossene Runtime belegt.
- Die Vertragsdokumentation behauptet mehr, als die vorhandene Codebasis wahrscheinlich vollständig leistet; DOKI ist ein Vertrag mit echtem Kern und vielen Ausbauzonen.

### Welches darf als eigenständiges System bleiben?
- DOKI als eigenständige Basisplattform und Add-on-Vertrag.
- Die Add-on-Trennung (DOKI darf von keinem bestimmten Add-on abhängen) und die Autoritätslosigkeit der Narrative.
- Die Confidence-Domänen, die Narrative-Richtungsregel, die Observability-Regeln und der Replay/Live-Cursor-Trennung.

### Welches darf direkt als Architektur für @shinon/narrative oder @shinon/context verwendet werden?
- Die Beobachtungs-ID-Logik (`source_event_id` zuerst, sonst Inhalts-Hash) und die Cursor-Trennung.
- Die Confidence-Domänen-Trennung und das Verbot von automatischer Übertragung capture → inference.
- Die Narrative-Richtungsregel (NARRATIVE X→ REAL STATE) und die Ableitungsregel (DERIVED ≠ AUTHORITY).
- Der Narrator-Context mit `authority: 'NONE'` und den Care-Stufen als Muster für eine abgeleitete, nicht-autoritative Narrative-Schicht.
- Die Inklusions-Gate-Logik (Ausschluss ist observable, nicht schwarzes Loch) als Vorbild für Shinon-Context-Selection.
- Die rule_version-Digests und die historische Unveränderlichkeit als Muster für Shinon-State.

### Besondere Unterscheidung: DOKI ist nicht einfach „Memory"
- Observation: der nicht-abgeleitete Erfassungsschritt.
- Persistence: der durable, regelversionierte, digestgeträgte Speicher mit Cursor-Disiplin.
- Derived State: die aus Events abgeleitete Zustandsrepräsentation, die niemals die wirkliche technische Autorität wird ohne explizite Runtime-Regel.
- Narrative: die Interpretations-/Sprechschicht mit `authority: 'NONE'`, die State annotiert, aber nicht mutiert.
- Authority: DOKI hat keine Schreib-Entscheidungshoheit über den zu beobachtenden Prozess; die Authority liegt weiter draußen.

## 5 · PROMTGUARD

### Quelle
- Repository: existiert nicht als separates Repository in vannon091118 auf GitHub.
- Material: Promtguard-main ist ein Unterordner in vannon091118/Shinon_Agent: PROMPTSET.md, .promtset/*.md, .promtset/schemas/*, .promtset/tools/promptgen.py, CODER-WORKFLOW.md, agents.md, constraints.json.
- Interface-Spec: interface-specs/promtguard.contract.json.
- Code: src/promtguard/generator.py (minimaler Einstieg).

### Primäre Rolle
Kontextkontinuität, Claims, Handoffs, Scope, Entscheidungsjournal und strukturierte Agentenübergaben als Regelwerk für Agent-Sitzungen.

### Welches Problem löst es?
Agenten-wechsel ohne State führen zu Kontextverlust, widersprüchlichen Entscheidungen und versteckten Handoff-Fehlern. Promtguard macht State, Handoffs, Claims und Task-Atomarität explizit.

### Kernlogik
- State → Context → Research → Claim → Task → Coder → Context Token → nächster Task.
- INIT-Protokoll (PROMPTSET laden, State laden, Anti-Duplicate-Check, Projekt identifizieren, dann arbeiten).
- Context Token als deterministische Belegen, dass ein Task erledigt wurde: `CTX-{PREFIX}-{PHASE}-{SEQ}`.
- Claims als Verifikations-Atome: jede Research-Aussage ist ein Claim, bis verifiziert; Claim-Log ist Append-only, latest-wins pro ID; Status-Werte: `unverified | verified | refuted | refined`.
- Handoff nach R04 mit `from`, `to`, `timestamp`, `note`, `handoff_version`.
- Decision Journal nach R05 mit `what`, `why`, `evidence`, `confidence`, `alternatives_rejected`.
- R06 Validation Gate vor Task-Build und vor completed.
- R07 Self-Improvement aus Erfolgsmustern.
- R08 Output-Vertrag für Agent-zu-Agent-Kommunikation.
- R09 Scope-Bounding: jede Aufgabe definiert IN SCOPE und NICHT IN SCOPE.
- R10 Fehler-Transparenz.
- R11 Prompt-Template: deklarativ > imperativ, Drei-Teile-Struktur.
- R12 Task-Sequenz.
- R13 Claims als eigenständiger Lebenszyklus.

### Wichtige Datenmodelle
- Context Token mit `id`, `timestamp`, `source_task_id`, `agent`, `task`, `status`, `summary`, `promtset_version`, `code_refs`, `diff_stats`.
- Claim mit `id`, `claim`, `status`, `source_res`, `timestamp`, und bei Verifikation `verified_evidence`, `verified_by_res`.
- Handoff mit `handoff_version`, `from`, `to`, `timestamp`, `note`.
- Decision mit `what`, `why`, `evidence`, `confidence`, `alternatives_rejected`.
- State-Dateien als JSONL in `.promtset/state/` (context-log, decision-journal, claim-log, handoffs) und `task-index.json`, `projects.json`.

### Persistenz
- JSONL-Append-only-Dateien im `.promtset/state/`-Verzeichnis; nichts wird gelöscht, nur angehängt.
- `task-index.json` ist überschreibbar, nicht append-only.
- Migration zu zentraler SQLite ist geplant, aber nicht vollzogen; Claim-Log soll ins `karma_facts`-Namespace wandern.

### Determinismus
- Deterministisch: ID-Formate, latest-wins-Resolutionslogik, Schema-Validierung, die Ingestionslogik für Claims aus Decisions.
- Nicht deterministisch: Research-Ergebnisse, Coder-Ausgaben, die Frage, ob Claims tatsächlich verifiziert werden.

### Authority
- Promtguard erhebt keine Laufzeit-Authority über das Zielsystem; es trägt State, Claims und Handoffs.
- Claims sind Behauptungen bis Verifikation; verifizierte Claims sind Belege, nicht automatisch Wahrheit über das Zielsystem.
- Validierung ist ein Gate, kein übergeordneter Entscheidungsgeber.

### Fail-Open / Fail-Closed
- Fail-closed bei Validierung: ungültige Research/Task-Formate werden abgelehnt, bevor sie die nächste Stufe erreichen.
- Fail-open bei Fehlern in der Laufzeit des Zielsystems: Promtguard ist nur die Kontext-/Handoff-Schicht; es blockiert das Zielsystem nicht.

### Replay
- Replaybar: State-Dateien sind historisch; Claims und Decisions lassen sich chronologisch nachvollziehen.
- Nicht replaybar: die eigentlichen Research-/Coder-Entscheidungen sitzen im Zielsystem und in der LLM-Interaktion.

### Was ist bewiesen?
- Das Regelwerk mit 12 Regeln und das Claim-/Handoff-/Decision-Modell sind klar beschrieben; die Vertragssprache im Interface-Spec ist vorhanden.
- Der Claim-Lebenszyklus (unverified → verified/refuted/refined, Append-only, latest-wins) ist konsistent dokumentiert.

### Was ist nur implementiert?
- `promptgen.py` bildet die Pipeline CLI ab (research, ingest, build, task-done, resume, handoff, claim, self-improve).
- Die `.promtset/state/`-Struktur und Schemata sind vorhanden.
- Claim-Verwaltung ist dokumentiert und teilweise implementiert.

### Was ist STUB / NOT_VERIFIED / NOT_IMPLEMENTED?
- Claim-Verifikationsschleife nie vollständig durchlaufen: 0 verifizierte Claims von 36 laut Interface-Spec.
- Handoff zu KARMA: Contract definiert, Runtime-Integration fehlt.
- JSONL → SQLite-Migration für zentrale Persistenz geplant, aber nicht vollzogen.
- Der Proof, dass der Claims-Zyklus im Produkt tatsächlich claims verifiziert, fehlt.

### Welche Teile für Shinons internes Kontextsystem sinnvoll sind?
- Context Token als explizite Beleg-Struktur für Task-Abschluss.
- Claims als Atom für Research-Aussagen mit Append-only-Log und latest-wins.
- Handoff-Vertrag als Standard-Modell für Agentenübergaben.
- Decision Journal als Pflicht für dokumentierte Entscheidungen.
- Scope-Bounding für jede Aufgabe.
- Validation Gate vor Task-Build und vor completed.

### Welche Teile nicht in DSH doppelt gebaut werden dürfen?
- Kein zweiter Claims-Service, wenn Shinon bereits ein eigenes Claim/Evidence-Modell hat; Promtguards Claim-Modell ist Vorbild, nicht nächste Kopie.
- Kein zweiter State/Context-Token-Service, wenn DSH/SHINON schon ein eigenes Kontextmodell baut.

### Empfohlene Shinon-Funktion
- @shinon/context (als Kontextkontinuität, Handoffs, Claims, Scope, Decision Journal)

## 6 · SYXCRAFT COMMIT LAYER

### Quelle
- Repository: kein separates Repository; die Commitment-Logik lebt als `.archive/commit-layer-master` in vannon091118/Shinon_Agent.
- Wichtigste Dateien: author_system.js, commit_lore/utils.js, commit_lore/rng.js, commit_lore/story_generator.js, commit_lore/template_engine.js, commit_lore/narrative_templates.json, commit_lore/freeze_plotchain.js, commit_lore/plotchain.json, commit_lore/lore_arcs.json, commit_lore/composite_chain.json, commit_lore/character_sheets.json, commit_lore/sidejoke_pool.json, commit_lore/cross_references.json, commit_lore/narrative_params.json, commit_lore/template_schema.json, commit_lore/writing_rules.json, PLOT_LORE.md, verify_commit_msg.js.
- SyxCraft-Undead-Research: Dokumentations- und Forschungsunterordner mit Architekturnotizen zu SyxCraft-Domänensystemen.
- Verifikation der Herkunft: `gh repo view vannon091118/syxcraft-commit-layer` und `gh repo list vannon091118` zeigen **kein** eigenes Repo — der Ordner `.archive/commit-layer-master/` in `Shinon_Agent` ist der vollständige Layer (inkl. `.pre-commit-config.yaml`, `Agent.md`, `INDEX.md`, `Handof 23:00 SyxCraft.txt`, `SyxCraft/`).

### Primäre Rolle
Der praktisch gebaute Chronik-/Narrative-Motor: er verwandelt jeden Git-Commit deterministisch in einen Plotchain-Knoten mit Erzähler, Mood, Beziehung, kausalem Kontext und Arc-Zuordnung — und friert alte Historie als Arc-Snapshot ein.

### Welches Problem löst es?
Ein Projekt hat Historie, aber keine Erzählung. Commits sind Zeilen, und nach Monaten weiß niemand mehr, in welcher Phase was geschah, wer beteiligt war und was daraus folgte. Der Layer macht aus der Commit-Folge eine fortlaufende, nachlesbare und deterministisch ableitbare Chronik (Plotchain → Arcs → PLOT_LORE), ohne die Historie zu verlieren.

### Höherstufung gegenüber der ersten Einschätzung
Der Layer ist **kein „schöne Commit-Messages“-Gadget**, sondern bereits ein kleines Narrative-System mit eigener Historie, Plotchain, Arcs, Charakteren, Moods, Beziehungen, kausalen Signalen, deterministischer Auswahl, Narrativ und Freeze/Archivierung. Daraus folgt eine saubere Rollenteilung bei den Narrative-Kandidaten:
- **DOKI** liefert die *Semantik*: Observation, Persistenz, Derived State, Provenance, `DERIVED ≠ AUTHORITY`, `authority: 'NONE'`.
- **SyxCraft Commit Layer** liefert die *Maschinerie*: Ableitung aus Vorgängerzustand + Änderungssignal, Kausalität, Erzähler-/Mood-Wahl, Beziehungszustand, Arc-Bildung, Hot/Cold-Freeze.
Shinon braucht beide, aber in unterschiedlichen Rollen. DOKI ist nicht der einzige Narrative-Kandidat — und umgekehrt ist der Commit Layer nicht die Wahrheit über Narrative, sondern ihre bereits gebaute Technik.

### Kernlogik
1. **Git Change → Commit-Kontext.** `author_system.js` liest gestagte Dateien (`stagedFiles`), Commit-Hash, Impuls (Commit-Absicht), `core/.body_text.txt` als `customBody` sowie Plotchain, Composite-Chain, Character-Sheets, Narrative-Parameter, Sidejoke-Pool und Lore-Arcs.
2. **Composite-Ableitung.** `rng.derive(prevComposite, commitHash, limits, prevMood)` → `seed = djb2(prevComposite + commitHash)` → `XorShift128` → Composite-Felder. `c` ist reine Sequenz (`prev.c + 1`), `j/n/a/p` sind RNG-Felder aus Pools (`j`=100, `n`=14, `a`/`p` aus Arc-/Plot-Zählern). `selectMood()` garantiert `Mood[N] != Mood[N-1]`.
3. **Erzählerwahl.** Narrator wird deterministisch aus Composite + Character-Sheets gewählt (bzw. per Forced-Narrator erzwungen), mit Cross-Narrator-Blick auf den vorherigen Erzähler.
4. **Kausale Signale.** `causalSignals = { character, mood, relationship{prev_narrator, state}, domain{primary, secondary, resonance}, sequence{phase, theme, progress}, codeContext{type, complexity, files, summary, impulse} }`.
5. **Narrativ.** Die Template-Engine ersetzt Platzhalter im `commit_template` des Charakters deterministisch aus diesen Signalen (`buildNarrativePrompt`); schlägt sie fehl, übernimmt `story_generator.js` mit lokaler deutscher Prosa. Beide Pfade sind reines JS — **kein `fetch`, kein LLM, kein Netz** in `author_system.js`.
6. **Commit-Body.** Sidejoke + Voice-Intro + generierte Story + `customBody` + Metadaten-Footer `[NARRATOR:…][MODEL:…][IMPULSE:…][COMPOSITE:…]`.
7. **Chronik schreiben.** Neuer Plotchain-Node, Composite-Chain-Eintrag, CHANGELOG-Eintrag (Composite als Duplikat-Anker), optional PLOT_LORE.md-Eintrag; die SSoT-Dateien werden gestaged.
8. **Arc-Freeze.** Bei `plotchain.length > KEEP_THRESHOLD + 5` archiviert `freeze_plotchain.js` die ältesten Knoten komprimiert nach `commit_lore/arcs/<arc>/frozen_plotchain.json`; aktiv bleiben die letzten 20 Nodes.
9. **Enforcement.** `verify_commit_msg.js` prüft Tokens, Impulse-Integration, Storytelling/Kausalität, Narrator↔Composite, COMPOSITE-Anker, Dateireferenzen und unaufgelöste Platzhalter → Exit 1 = BLOCKED.

### Wichtige Datenmodelle
- **Plotchain-Node** (Feldnamen im Archiv verifiziert): `p_id` (`p294`…), `id` (`plot-<timestamp>`), `timestamp`, `summary`, `narrator`, `model_id`, `composite`, `ref_to`, `prev_narrator`, `data_changes[]` (file/insertions/deletions), `recent_commits[]`, `causal_chain_summary[]`.
- **Composite-Chain-Eintrag:** `seq`, `hash`, `composite`, `mood`, `narrator`, `model_id`, `date`.
- **Arc:** `id`, `name`, `version`, `theme`, `span`, `status` (`active`/`archived`), `first_p`, `last_p`; `active` zeigt auf den laufenden Arc. Im Repo real: `a1`–`a6`, aktiv `a6`.
- **Composite** `c/j/n/a/p` mit `COMPOSITE_FORMAT` (`c` = Sequenz, `j/n/a/p` = RNG, Poolgrößen 100/14/…).
- **Beziehungszustand:** `fresh_pair` → `established_duo` (≥2 Ko-Okkurrenzen) → `trusted_team` (≥5), gezählt im letzten 20-Node-Fenster der Plotchain.
- **Frozen-Node:** Plotchain-Node ohne `recent_commits`, `data_changes`, `causal_chain_summary`, `data_changes_legacy`; `CORE_FIELDS` (`p_id, id, timestamp, summary, narrator, model_id, composite, ref_to, prev_narrator`) bleiben.
- **Kataloge:** `character_sheets.json`, `narrative_templates.json`, `narrative_params.json`, `template_schema.json`, `writing_rules.json`, `sidejoke_pool.json`, `cross_references.json`.

### Persistenz
- `commit_lore/plotchain.json` (aktiv, letzte 20 Nodes), `commit_lore/composite_chain.json`, `commit_lore/arcs/<a>/frozen_plotchain.json` (real vorhanden für a1–a6, dazu `a5/PROGRESS.md`), `lore_arcs.json`, `CHANGELOG.md`, `PLOT_LORE.md` (356 KB), sowie die Katalog-Dateien.
- Alles repo-lokal und versioniert: es gibt **keine Datenbank und keinen externen Service**.
- Der Freeze ist konservativ: komprimieren und nach Arc gruppieren, nie löschen.

### Determinismus
- **Deterministisch:** `rng.js` (explizit „Kein `Math.random()`, kein `crypto`“) mit `djb2` + `XorShift128`; `derive`, `selectMood`, `parseComposite`/`buildComposite`, `decodeJ`; Erzählerwahl; `calculateRelationshipState`; `calculateDomainResonance`; Komposition der kausalen Signale; Template-Ersetzung; `story_generator` (lokal); Arc-Gruppierung im Freeze.
- **Nicht deterministisch (konkret belegt, nicht behauptet):** `{DATE}`/`{TIME}`/`{TIME2}` über `new Date()` in `author_system.js`; der `isoTimestamp` des Plotchain-Nodes (`id`, `timestamp`); der CHANGELOG-Eintrag; die Ghost-Zeile mit `new Date()` in `story_generator.js` und `template_engine.js`; `new Date().toISOString()` in `utils.js`.
- **Extern:** `model_id` wird mitgeschrieben (real: `mimo-v2`, `nemotron-3-ultra-free`) — die endgültige Prosa entsteht also außerhalb des Layers durch ein Modell.

### Trennung: deterministische Ableitung ≠ deterministische Gesamtprosa
- **Deterministisch ist die Ableitung:** Composite, Mood, Narrator, Relation, Domain-Resonanz, Sequenzphase, Arc-Fortschritt, Code-Klassifikation und die Auswahl von Template + Variablen.
- **Nicht deterministisch ist die fertige Prosa:** sie trägt Wanduhr-Zeit und kommt aus einem externen Modell (im `model_id` vermerkt).
- **Unfertiger Pfad, ehrlich benannt:** `buildNarrativePrompt()` gibt einen *Prompt* zurück, und `author_system.js` hängt dieses Ergebnis direkt an den Commit-Body. Ohne äußere Instanz, die den Prompt vorher füllt, enthält der Body also eine Anweisung statt Prosa. Das ist der sichtbarste Bruch im Layer.
- **Folge für Shinon:** der Ableitungsteil ist als deterministische Schicht portierbar; die Prosa ist eine austauschbare Präsentationsschicht, die Zeit/LLM enthalten darf — aber nie in den abgeleiteten State zurückfließen darf (`NARRATIVE ≠ REALITY`).

### Authority
- Autorität nur über die **eigenen Chronik-Dateien** im Checkout (Plotchain, Arcs, PLOT_LORE, CHANGELOG, Kataloge) und über den Commit-Text — **nicht** über Code-Inhalt und nicht über technische Entscheidungen.
- `verify_commit_msg.js` ist die einzige Gate-Autorität des Layers (Exit 1 = BLOCKED).
- Der Layer erhebt keinen Wahrheitsanspruch über seine Narrative: er beschreibt Historie, er entscheidet sie nicht.

### Fail-Open / Fail-Closed
- **Fail-closed:** der Verifier. Leere Message, fehlende Message-Datei, nicht lesbare staged Files, keine staged Files, fehlende Tokens, unaufgelöste Platzhalter oder Chain-Bruch → Exit 1 mit gesammelter Ausgabe.
- **Fail-safe (nicht blockierend):** der Freeze. Ein Fehler wird als Warnung geloggt und bricht den Commit nicht ab.
- **Fail-open mit Fallback:** die Template-Engine. Schlägt sie fehl, übernimmt `story_generator` (Warnung statt Abbruch).

### Replay
- **Replaybar:** Composite/Mood/Narrator/Beziehung/Arc aus `prevComposite + commitHash + Pools` — gleiche Eingaben und gleiche Katalog-Dateien ergeben die gleiche Auswahl. Frozen-Arc-Dateien sind reine, gruppierte Snapshots.
- **Nicht replaybar:** die fertige Prosa und alle Zeitstempel (`new Date()`), weil sie Wanduhr bzw. ein externes Modell enthalten.

### Was ist bewiesen?
- Alle genannten Dateien liegen im Archiv und sind lauffähig; `plotchain.json` enthält reale Knoten (aktives Fenster p294…p314), `lore_arcs.json` reale Arcs a1–a6 mit `active: a6`, `arcs/a1…a6/frozen_plotchain.json` reale Snapshots.
- Die Kette `djb2 → XorShift128 → Composite → Mood(≠prev) → Narrator → Beziehung` ist im Code belegt (`rng.js`, `author_system.js`).
- `freeze_plotchain.js` implementiert `KEEP_THRESHOLD = 20`, `ARCHIVE_FIELDS`/`CORE_FIELDS` und die Arc-Gruppierung.
- `verify_commit_msg.js` implementiert acht Checks mit Exit 0/1; `commit_lore/test_template_engine.js` existiert als Test.

### Was ist nur implementiert?
- Der lokale Flow ist vollständig: Ableitung, Template/Story, Body-Bau, Plotchain-/Composite-/CHANGELOG-/LORE-Schreiben, Auto-Freeze, Konsistenz-Warnungen (`checkConsistency`). Er läuft für SyxCraft nachweislich im Alltag (die Historie ist die Probe).

### Was ist STUB / NOT_VERIFIED / NOT_IMPLEMENTED?
- **Universalisierbarkeit:** nicht belegt. Erzähler-Roster, Sidejokes, Domain-Resonanz-Tabelle, Impuls-Klassen `DOKU/FIX/REFACTOR/BUILD/CODE`, Lore-Inhalte und das Beiwerk (`Agent.md`, `INDEX.md`, `Handof 23:00 SyxCraft.txt`, `SyxCraft/`, `SyxCraft-Undead-Research/`) sind SyxCraft-spezifisch.
- **Template-Pfad als Prosa-Pipeline:** NOT_VERIFIED — er liefert einen Prompt, keinen fertigen Text.
- **Externer Runner:** keiner im Layer; wer den Prompt füllt, liegt außerhalb und ist damit ungeprüft.

### Welche Teile echte allgemeine Narrative-Technik sind?
- Deterministische Ableitung aus **Vorgängerzustand + Änderungssignal** (`prevComposite + commitHash` als Seed).
- Trennung von **Chronik-State** (Plotchain/Composite-Chain/Arcs) und **Darstellung** (Template/Prosa).
- **Beziehungszustand zwischen aufeinanderfolgenden Akteuren**, aus der Historie abgeleitet statt behauptet.
- **Kausale Signale** als strukturierte Zwischenschicht zwischen Event und Narrativ.
- **Mood-Pool mit Anti-Wiederholungs-Garantie.**
- **Hot/Cold-Historie:** kleine aktive Chronik + komprimierte, arc-gruppierte Snapshots.
- **Arc als Phase** mit Name, Thema, Zeitraum, Status und Start-/End-Event.

### Welche Teile nur für SyxCraft/Commit-Narration gebaut wurden?
- Erzähler-Roster (Buffy/Basher/Thinker/Ghost/Devin/Squizzle/Argos/…), `sidejoke_pool.json`, `character_sheets.json`, die Domain-Resonanz-Tabelle, die Impuls-Klassifikation, die konkreten `lore_arcs`-Inhalte und PLOT_LORE-Texte.
- Das syxcraft-spezifische Beiwerk (Agent.md, INDEX.md, Handoff-Zettel, `SyxCraft/`, `SyxCraft-Undead-Research/`).

### Was Shinon daraus konkret baut
Nicht `@shinon/commit-layer` als Port, sondern die von den SyxCraft-Inhalten getrennte Mechanik:

```
NarrativeEvent      ← ein reales Ereignis (Commit, Gate-Verdict, Claim-Übergang, Session-Turn)
NarrativeArc        ← Phase mit Name, Thema, span, status, first/last event (aus lore_arcs gelernt)
NarrativeThread     ← offener Faden innerhalb eines Arcs
RelationshipState   ← history, trust, respect, patterns, commitments, conflicts, open_threads
Consequence         ← was aus welchem Ereignis folgte
NarrativeState      ← abgeleiteter Gesamtzustand (deterministisch)
NarrativeSnapshot   ← eingefrorener Arc (verlustfrei komprimiert)
NarrativeRenderer   ← austauschbare Präsentation (darf Zeit/LLM enthalten)
```

Darunter Adapter, keine Kopien: **DOKI-Adapter** (Observation/Provenance), **Commit-Layer-Adapter** (Git-Event → NarrativeEvent), **FalsifyMe-Event-Adapter** (Verdict/Verdict-Wechsel), **DSH-Session-Adapter** (Session-/Agent-Events).

Und die daraus abgeleitete Gedächtnisteilung — der stärkste übertragbare Gedanke des Layers:

```
HOT   aktueller Kontext                 (aktive Chronik, letzte N Events)
MID   laufende Arcs / Beziehungen       (offene Threads, aktive Beziehungen)
COLD   abgeschlossene Arcs              (frozen snapshots, historische Erfahrung)
```

Damit wird aus dem bisherigen Two-Tier-Memory von Shinon_Agent eine semantisch begründete Dreiteilung, und Arc-Freeze ist ihr direkter Vorfahre.

### Was davon gehört in Shinon Forge?
- Die Ableitungsmechanik als `@shinon/narrative`: Vorgängerzustand + Änderungssignal → Composite/Mood/Akteur/Beziehung → kausale Signale → Arc-Zuordnung.
- Das Arc-Modell (Name, Version, Thema, Zeitraum, Status, erstes/letztes Ereignis) als Schema, nicht als Inhalt.
- Der Beziehungszustand aus Historie (`fresh_pair`/`established_duo`/`trusted_team` als Vorlage für reichere `relationship(user)`-Felder).
- Hot/Cold-Freeze: `NarrativeSnapshot` pro Arc, verlustfrei komprimiert, konfigurierbare Schwelle.
- Der Verifier als Vorbild für ein Narrative-/Release-Gate (Tokens, Integration, Platzhalter, Chain-Integrität).

### Was darf NICHT übernommen werden?
- Erzähler-Roster, `sidejoke_pool.json`, `character_sheets.json` und die Domain-Resonanz-Tabelle — SyxCraft-Besetzung, keine Shinon-Identität.
- Die konkreten `lore_arcs`-Inhalte, PLOT_LORE-Texte und Impuls-Klassen `DOKU/FIX/REFACTOR/BUILD/CODE` als feste Wahrheit.
- Das Beiwerk `Agent.md`, `INDEX.md`, `Handof 23:00 SyxCraft.txt`, `SyxCraft/`, `SyxCraft-Undead-Research/`.
- Die Annahme, die Prosa sei deterministisch: Zeit und externes Modell bleiben außerhalb der Determinismus-Garantie.

### Empfohlene Shinon-Funktion
- @shinon/narrative — Chronicle + Arcs + Relationships + Consequences + Provenance (Mechanik übernehmen, SyxCraft-Lore nicht).

## 7 · SHINON_AGENT — BESTEHENDER PERSONA-KERN

### Quelle
- Repository: vannon091118/Shinon_Agent, main.
- Wichtigste Dateien:
  - fusion-main/fusion/shinon/shinon_engine.py
  - fusion-main/fusion/shinon/shinon_memory.py
  - fusion-main/fusion/shinon/shinon_attitudes.py
  - fusion-main/fusion/shinon/shinon_emotional.py
  - fusion-main/fusion/shinon/shinon_patterns.py
  - fusion-main/fusion/shinon/shinon_prompts.py
  - fusion-main/fusion/shinon/shinon_prosa.py
  - fusion-main/fusion/shinon/shinon_contracts.py
  - fusion-main/fusion/event_bus.py
  - interface-specs/shinon.contract.json
  - interface-specs/promtguard.contract.json
  - fusion-main/fusion/promtguard_claims.py
  - fusion-main/fusion/claim-to-skill-map.json
  - shinon_fusion_bridge.py

### Primäre Rolle
Bestehender Shinon-Persona-Prototyp: Identity, Attitudes, Emotional State, Pattern Recognition, Memory, Confrontation, NarrativeSpec, Prosa Renderer, Event Bus, Contracts, Handoff zu Promtguard.

### Welches Problem löst es?
Shinon soll eine konsistente Persönlichkeit über Sitzungen hinweg haben, mit Einstellungen, emotionalem Zustand, erkannten Mustern und einer Vertrags-Disciplein vor der Weitergabe an Promtguard.

### Welche Persona-Funktionen bereits existieren
- Identity: `ShinonIdentity` mit Name, Version, Werten, base_tone, Taboos.
- Attitudes: `AttitudeState` mit warmth/respect/patience/trust, Regeln, Drift, Persistenz über SQLite.
- Emotional State: 6-Zustands-Maschine mit Tone-Modifier (neutral/amused/annoyed/concerned/curious/confrontational).
- Pattern Recognition: Regex-Pattern-Erkennung für Präferenz/Beziehung/Commitment/Widerspruch mit Confidence-Scoring.
- Memory: zwei-Tier-Speicher mit Hot/Mid/Cold-Zonenumzug, Pattern-Verstärkung, Cross-Tier-Links, WAL.
- Confrontation: Widerspruchserkennung und `should_confront`-Logik.
- NarrativeSpec + Prosa Renderer: reine Funktion NarrativeSpec → text, mit deterministischem Mood-Block, Fallback ohne LLM, Beleg-Vertrag.
- Event Bus: AsyncPub/Sub mit ReplayReport/Unterscheidung structureller Fingerprints.
- Contracts: fail-closed Input-/Output-/Action-Validierung mit `stable_serialize`; nicht-konforme Nutzlast wird abgelehnt.
- Handoff: `HOFF-0002`-Handschlag nach Promtguard mit System-Prompt, Character-Annotations, Contract-Version.

### Identifizierte Inkonsistenzen zwischen Contract und Implementierung
- Das Interface-Spec `shinon.contract.json` listet Implementationen in TypeScript-Pfaden auf (`character/src/contracts/inputSchema.ts` etc.), die in der aktuellen Codebasis nicht als solche existieren; die Implementierung ist in Python unter `fusion-main/fusion/shinon/`.
- Das SPEC nennt TypeScript-Sprach- und Runtime-Angaben, die der aktuelle Python-Prototyp nicht einhält: SPEC und Code driften.
- `shinon.contract.json` nennt `two_tier_memory` als STUB mit leerer Ergebnismenge; die Implementierung `shinon_memory.py` ist dagegen vollständiger (Hot/Mid/Cold, Pattern-Verstärkung, Cross-Tier-Links, WAL) und arbeitet, aber das SPEC spiegelt das nicht vollständig wider.
- `shinon.contract.json` listet SQLite-Tabellen und storage-Konventionen, die im SPEC stehen; die Implementierung verwendet andere Tablennamen/Modelle (z. B. `personal_facts`, `patterns`, `pattern_links`), und die SPEC-beschriebenen Tabellen entsprechen nicht 1:1 dem Code.
- Das SPEC sagt `cold_memory` liest aus `karma_facts` im READ_ONLY-Modus; die Implementierung hat eigene Speicher und die Verbindung zu KARMA ist nicht als laufende Realität belegt.
- Das SPEC nennt Replay Gates auf `character/src/experience/twoTierMemory.ts`; die Implementierung hat Replay-Funktionen im Event-Bus, aber kein vollständiges, abgeschlossenes Shinon-Two-Tier-Replay-Gate, das die SPEC verspricht.
- Einige Felder im SPEC (z. B. `reply` immer leer, `handoff_to_promtguard` immer mit bestimmten Pflichtfeldern) sind teilweise implementiert, aber die volle Integration zu Promtguard fehlt.
- `shinon_engine.py` überschreitet die Annotation-only-Regel der SPEC in der Praxis: er baut Prompt-Generierung und Handoff, während das SPEC eine saubere Trennung von Character-Annotation und Reply-Generierung verspricht.

### Was bereits funktioniert
- Identity, Attitudes, Emotional State und deren Persistenz-/Regelmodule sind implementiert und lauffähig.
- Contracts für Input/Output/Action sind implementiert und fail-closed.
- Prosa-Renderer ist implementiert als reine Funktion mit LLM- und Fallback-Pfad.
- Event Bus mit ReplayReport und struktureller Fingerprint-Unterscheidung ist implementiert.
- Memory-Modul mit Zonenumzug, Pattern-Verstärkung und Cross-Tier-Links ist implementiert.
- Handoff-Konstruktion zu Promtguard ist implementiert als Datenstruktur.

### Was nur behauptet, stubbed oder unverifiziert ist
- Zwei-Tier-Memory im SPEC als STUB, obwohl die Implementierung mehr tut — Ansatz vs. Stand.
- Kaltgedächtnis aus `karma_facts` als READ_ONLY im SPEC, ohne belegte laufende Integration.
- Replay-Gate nach SPEC nicht als abgeschlossene Einheit.
- Handoff zu Promtguard als volle Runtime-Integration fehlt.
- Claim-zu-Skill-Map und die Promtguard-Integration sind teilweise vorhanden, aber nicht als durchgängiger, getesteter Durchlauf.

### Empfohlene Shinon-Funktion
- @shinon/persona (Identity, Attitudes, Emotional State, Pattern Recognition, Memory, Confrontation, Contracts, Prosa-Renderer, Event-Bus-Ports, Handoff-Konstruktion)

## 8 · SHINON FORGE — ZIELARCHITEKTUR

### Quelle
- Repository: vannon091118/shinon-forge, Commit d275db09477b409868081130fb1b8614b61fe953, main.
- Wichtigste Dateien:
  - packages/core/*
  - profiles/shinon/*
  - profiles/headless/*
  - scripts/gate/*
  - Docs/contracts/*
  - Docs/ARCHITECTURE.md
  - Docs/FOUNDATION-PLAN.md
  - Docs/PLAN.md
  - Docs/REPO-ANALYSIS.md
  - Docs/probes/*
  - README.md
  - IDEA.md

### Aktueller Stand
- Shinon Forge ist bootfähig mit eigenem Branding-Overlay, profiles/shinon + headless, Modell-Route über pi-ai/OpenRouter (SHINON_API_KEY aus Umgebung), Governance-Gate-Engine in scripts/gate/ (14 Checks, Diff-Slicing, --local/--full/--release), modulare Plugins (registry, contracts, doctor, probe-twin etc.), 7-Punkt-Verträge mit 4 Zuständen und maschineller Prüfung, Falsifikations-Proben mit Anti-Vakuum-Prüfung.
- Es gibt bereits ein DSH-Fundament, @shinon/core, eigenes SHINON-Branding, Profile, Gate-Engine, Contract-Prüfungen und erste Runtime-Struktur.

### Wie die analysierten Systeme hineinpassen
- FALSIFY_ME liefert das Verify-Konzept: Claim → Anforderungen → Probe → Validator → Evil Twin → WRITE-Entscheidung, fail-closed, mit Replay- und Zustandsdisziplin.
- PROPSA liefert die Grammatik und Statusdisziplin für die 7-Punkt-Verträge und die vier Zustände, insbesondere die STUB/NOT_VERIFIED-Trennung.
- Feed-the-Floor-Bleed liefert das technische Gate-Konzept als JS-Policy-/Plugin-Runner und Commit-Integrity als Remote-Gate-Prinzip.
- DOKI liefert die Beobachtungs-/Persistenz-/Narrative-/Confidence-/Autoritätslosigkeit-Architektur als Vorbild für @shinon/context und @shinon/narrative.
- Promtguard liefert das Kontext-/Claim-/Handoff-/Scope-/Decision-Journal-Konzept als Governance-Vorbild.
- SyxCraft Commit Layer liefert die chronikfähige, deterministisch-ableitende Narrative-Struktur als Vorbild für @shinon/narrative.
- Shinon_Agent liefert den bestehenden Persona-Kern als Prototyp für @shinon/persona.

### Empfohlene Zuordnung
- Identity / Persona → @shinon/persona. **Status: teilweise gebaut.** `packages/persona/` existiert bereits als DSH-native Prompt-Schicht (`ctx.systemPrompt.section()` mit Abschnitten für Identität, Epistemik, Änderungsklassen, Determinismus, Zuständigkeit, Reportstil, Augenhöhe; Config im Profil), aktiviert über `profiles/shinon/package.json` `dsh.profile.bundles` und geprüft von `scripts/gate/plugins/persona.mjs`. Was **fehlt**, ist der zustandsbehaftete Teil aus Shinon_Agent (Attitudes, Emotional State, Pattern Recognition, Memory) — das ist der nächste echte Bauschritt.
- Self Model / State → @shinon/state (aus Shinon_Agent Memory/Attitudes/Emotional + DOKI rule_version/digest/Hot-Mid-Cold + FalsifyMe Loop-State/Digest-Discipline).
- Memory / Narrative → @shinon/narrative + @shinon/context (aus DOKI Observation/Persistence/Derived/Narrative/Authority + SyxCraft deterministische Chronik-Ableitung + Promtguard Claims/Context/Handoff).
- Context / Claims → @shinon/claims + @shinon/context (aus FalsifyMe Claim/Probe/Validator/Twin-Konzept + Promtguard Claims/Handoff/Scope/Decision-Journal + DOKI Confidence-Domänen und Inklusions-Gate).
- Verification / Twin → @shinon/verify (aus FalsifyMe Probe/Validator/Twin/Gate).
- Gates / Policy → @shinon/gates (aus Feed-the-Floor-Bleed Engine/Plugins/policy/commit-integrity + propsa Grammatik + Shinon_Contract-Disciplein).
- DSH Runtime → Shinon-Forge Boot/Profile/Branding/Contracts/Gate-Integration.

## Gesamtsynthese

                   SHINON
                      │
            Identity / Persona
                      │
            Self Model / State
                      │
            Memory / Narrative
                      │
                 Context / Claims
                      │
            Verification / Twin
                      │
                Gates / Policy
                      │
                 DSH Runtime
                      │
                    LIMEN
                      │
                   ACTION

Diese Karte ist die Übergabe an den nächsten Agenten. Jedes System oben hat seine eigene Datei/README/Contract/Implementierung; das ist keine Zusammenfassung aus Erinnerung.

### Rollenteilung — ein Satz pro System

| System | Rolle in einem Satz |
|---|---|
| Falsify_Me | Der Zweifel: unabhängige Gegeninstanz mit eigenem Kontext, die WRITE erst nach bestätigten Proben freigibt. |
| propsa | Der Vertrag: Grammatik (7 Punkte) und Statusdisziplin (4 Zustände) für jede Regel, kein Runtime-Dienst. |
| Feed-the-Floor-Bleed | Das Gate: Policy-getriebene Plugin-Ausführung über Git-Diffs, lokal schnell, remote vollständig. |
| Promtguard | Der Kontext: Claims, Context Token, Handoff, Decision Journal, Scope-Bounding und Task-Atomarität. |
| DOKI | Der Zustand: Observation, Persistenz, abgeleiteter State, Provenance — mit `DERIVED ≠ AUTHORITY`. |
| SyxCraft Commit Layer | Die Chronik: deterministische Ableitung von Erzähler/Mood/Beziehung/Arc aus jedem Commit plus Hot/Cold-Freeze. |
| Shinon_Agent | Die Persona: Identity, Attitudes, Emotional State, Patterns, Memory, Confrontation, NarrativeSpec, Prosa, Event Bus. |
| Shinon Forge | Der Ort: DSH/Cordis-Runtime, Profil, Bundles, Gate-Engine, Contracts und Branding — hier läuft alles zusammen. |

### Die eine Richtungsregel

```
REAL EVENT → OBSERVATION → EVIDENCE → NARRATIVE → PERSONA STATE → VOICE
```

Niemals umgekehrt. Narrative darf Evidence und technische Realität nie überschreiben; persona state darf abgeleitet sein, aber er darf nie zur Quelle technischer Wahrheit werden. Das ist gleichzeitig die DOKI-Regel (`DERIVED ≠ AUTHORITY`, `authority: 'NONE'`), die Farbe der Analyse und die Sicherung gegen eine Persona, die sich ihre eigene Geschichte selbst zur Wahrheit erklärt.

## Konkrete Empfehlung — Übernehmen / Adaptieren / Nicht übernehmen

| Quelle | Übernehmen | Adaptieren | Nicht übernehmen | Ziel in Shinon |
|---|---|---|---|---|
| Falsify_Me | Claim→Probe→Validator→Twin, Fail-Closed, Digest-Einfrieren, idempotentes Re-Review | Verdict-Vokabular PLAN/RESEARCH/ASK/WRITE; Probe-Klassen; Anti-Vakuum-Minima | TUI/Dock/Installer/Worker-Runtime, Desktop-Pfade, SQLite-Queue, Scope-/Whitelist-Sandbox, Skill-Dump | `@shinon/verify` (+ `@shinon/claims`) |
| propsa | 7-Punkt-Grammatik, 4 Statuswerte, `known_gaps`, `last_verified_against_code` | Baustein-Menge neu nach Shinon-Notwendigkeit; Statusprüfung als Gate-Plugin | propsa als Service, PROPAKT-Scanner/LLM-Beratung/Desktop-App, TypeScript↔Rust-Katalogspiegel | Verfassung in `Docs/contracts/` + Gate-Plugin |
| Feed-the-Floor-Bleed | Modularer Policy-/Plugin-Runner, Diff-Slicing, `always`/`local`/`slices`, Commit-Integrität als Remote-Gate | Plugin-Signatur (`--changed`) für Shinon-Scopes; neue Gates für Runtime/Evidence/Persona/Narrative/Release | Dorf-/Spielserver-Architektur, Gameplay-Pakete, lokale Hook-Abhängigkeit als einzige Kontrolle | `scripts/gate/` (besteht bereits, hier abgeleitet) |
| DOKI | Observation-ID (source_event_id → Inhalts-Hash), Cursor-Trennung live/replay, Confidence-Domänen, `NARRATIVE X→ REAL STATE`, `authority: NONE`, Inklusions-Gate, `rule_version` | Scheduler/Dedup/Screen-Time-Ideen; Etats/Ensemble-Blöcke als Struktur; Q-Learning als Konzept | DOKI als zweiter Kernel neben DSH; eigene Parallel-SQLite-Welt; Add-on-Vollvertrag als fertige Runtime; Python-Ports | `@shinon/context`, Vorlagen für `@shinon/narrative` |
| Promtguard | Claims (append-only, latest-wins), Context Token, Handoff-Vertrag, Decision Journal, Scope-Bounding, Validation Gate | Token-/Claim-Schemata in DSH-Konventionen; Handoff als Session-Artefakt | Zweiter Claims-/State-Service neben DSH; JSONL-State als eigene Persistenzwelt; die volle Python-Pipeline; KARMA-Runtime-Integration | `@shinon/claims`, `@shinon/context` |
| SyxCraft Commit Layer | Deterministische Ableitung, kausale Signale, Beziehungszustand aus Historie, Arc-Modell, Mood-Anti-Wiederholung, Hot/Cold-Freeze, Verifier | Arc-/Event-/Thread-Schemata generalisiert; Mood-/Template-Kataloge als `assets/`; Freeze-Schwelle konfigurierbar | Erzähler-Roster, Sidejokes, Character-Sheets, Domain-Resonanz-Tabelle, PLOT_LORE-Inhalte, `Agent.md`/`INDEX.md`/Handoff-Zettel, `SyxCraft/`- und Undead-Research-Inhalte | `@shinon/narrative` |
| Shinon_Agent | Identity, Attitudes, Emotional State, Patterns, Confrontation, NarrativeSpec, Prosa-Renderer, Event-Bus-Ports, Handoff-Konstruktion, Contract-Disziplin | Two-Tier-Memory → HOT/MID/COLD (mit Arc-Freeze); `karma_facts`-Kaltgedächtnis nur mit echter Anbindung; Python-Module als Verhaltensbeschreibung, nicht als Code-Port | Das Content-Automation-Beiwerk (`Content_Machine`, `goose`-Prompts), der Skill-Dump (7676 Dateien), SPEC-Pfade, die nicht existieren, die `karma`/`limen`-Kernel als Parallel-Runtime | `@shinon/persona` |

## Konkrete Empfehlung — Reihenfolge

Reihenfolge bewusst vertikal: lieber früh einen erlebbaren Shinon-Zyklus als monatelang Infrastruktur.
Schritt 0 (`@shinon/core`) ist gebaut. Die Schritte 1–6 sind die Kern-Bundles, Schritt 7 ist Anzeige.

### 1. @shinon/persona — Zustand ergänzen (Status: Prompt-Schicht GEBAUT, State-Teil offen)
- **Ziel:** Shinon ist erlebbar, bevor irgendetwas Verificiertes existiert. Prompt-Schicht steht schon; jetzt Identity/Attitudes/Emotional/Patterns als abgeleiteten, nicht-autoritativen State.
- **Dateien/Module:** `packages/persona/index.js` (Config + Sections erweitern), `packages/persona/cordis.patch.yml` (`id: shinon-persona` liegt), `profiles/shinon/package.json` (`bundles` enthält `@shinon/persona`), `profiles/shinon/cordis.patch.yml` (Werte), `scripts/gate/plugins/persona.mjs` (erweitern), `Docs/contracts/persona.json` (neu).
- **Abhängigkeiten:** Shinon_Agent (`shinon_attitudes.py`, `shinon_emotional.py`, `shinon_patterns.py` als Verhaltensreferenz), DSH `ctx.systemPrompt`, `session/event`.
- **Contract:** 7 Punkte + Status; Persona darf nur Kontext liefern, nie Aktion auslösen; State-Felder `stance`, `uncertainty`, `mood`, `capabilities`, `limitations`.
- **Test:** `node scripts/dsh-test.mjs`, `node scripts/pack-test.mjs`, `node scripts/dsh-profile-test.mjs`, `node --test` für State-Übergänge; `persona`-Gate-Plugin prüft Bundle im Profil + nicht-leerer Host-Abschnitt.
- **Replay-Nachweis:** gleicher Identitäts-Config-Wert + gleiche Event-Folge → identische Sections/Snapshot.
- **Definition of Done:** Gate grün; Persona-Abschnitte im System-Prompt sichtbar; Contract für den Textteil `IMPLEMENTED`, für den State-Teil ehrlich `NOT_IMPLEMENTED`.

### 2. Contract-Spine (propsa) — kein Bundle, die Verfassung
- **Ziel:** jede Shinon-Fähigkeit trägt dieselben 7 Punkte und denselben Status, bevor komplexe Funktionen entstehen.
- **Dateien/Module:** `Docs/contracts/*.json` (heute `core.json`, `model-route.json`), Grammatik zentral in `scripts/lib/` (neu, z. B. `contract.mjs`), `scripts/gate/plugins/contracts.mjs`, `scripts/gate/tests/contracts.test.mjs`, `Docs/ARCHITECTURE.md` §Statusklassen.
- **Abhängigkeiten:** keine Runtime; nur Node.
- **Contract:** `POSITIVE/FORBIDDEN/FALLBACK/ERROR/TRACE/REPLAY/INVARIANT`, `IMPLEMENTED/STUB/NOT_IMPLEMENTED/NOT_VERIFIED`, `known_gaps`.
- **Test:** `node --test scripts/gate/tests/contracts.test.mjs` + Negativ-Fixture (fehlender Punkt → FAIL).
- **Replay-Nachweis:** Contract-Prüfung ist reine Funktion; zweimal derselbe Input → derselbe Report.
- **Definition of Done:** jedes `@shinon/*`-Paket hat einen Contract; `contracts`-Gate wird rot, wenn ein Punkt fehlt oder `IMPLEMENTED` ohne Beleg behauptet wird.

### 3. @shinon/context — Beobachtung und Gedächtnis (aus DOKI)
- **Ziel:** DSH-Events werden beobachtet, persistiert und zu rekonstruierbarem Kontext, ohne eine zweite Runtime zu bauen. Das ist die Memory-/Second-Brain-Stufe und Voraussetzung für Narrative.
- **Dateien/Module (geplant, noch nicht im Baum):** vier Rollendateien als Paket `context`, ein Gate-Plugin `context` und ein Vertrag `context` im Verzeichnis `Docs/contracts/`, Slices-Eintrag in `scripts/gate/policy.json`.
- **Abhängigkeiten:** DSH `session/event` + Session-Append (DSH-Session-Log ist der Audit), `@shinon/persona` (Anzeige).
- **Contract:** Observation-ID-Regel, Cursor-Trennung (live vs. replay), Confidence-Domänen (`capture`/`inference`/`policy_relevance`), `rule_version`-Digests, Inklusions-Gate.
- **Test:** `node:test` für ID-Bildung, Dedupe, Cursor-Vorschub bei Crash; `pack-test` für die Distribution.
- **Replay-Nachweis:** gleiche Event-Folge ab Cursor → gleiche Observation-Folge; Cursor rückt erst nach erfolgreichem Schritt vor.
- **Definition of Done:** Beobachtung annotiert nur; keine Schreibzugriffe ins Projekt; `derived ≠ authority` ist als Invariante getestet.

### 4. @shinon/claims — Claims und Kontextkontinuität (aus Promtguard + FalsifyMe)
- **Ziel:** aus Kontext wird arbeitsfähiger, prüfbarer Zustand: Claims als Atome, Handoff als Übergabe, Scope als Grenze.
- **Dateien/Module (geplant):** vier Rollendateien als Paket `claims`, ein Vertrag im Verzeichnis `Docs/contracts/`, Gate-Plugin + `policy.json`-Slice; ein eigenes Decision-Journal-Verzeichnis gibt es nicht — Entscheidungen führt heute `Docs/INDEX.md`.
- **Abhängigkeiten:** `@shinon/context` (Observation als Belegquelle), DSH-Append/Session.
- **Contract:** Lebenszyklus `unverified → supported → confirmed | refuted | conflicted`, append-only, latest-wins; Handoff-Felder (`from`, `to`, `timestamp`, `note`, `handoff_version`); Scope-Bounding je Aufgabe.
- **Test:** `node:test` für erlaubte/verbotene Übergänge; Negativtest für „Beleg fehlt“.
- **Replay-Nachweis:** Claim-Log ist append-only; gleicher Event-Strom → gleiche Chronologie und gleicher latest-wins-Stand.
- **Definition of Done:** **der erste echte Nachweis der ganzen Kette:** ein Claim läuft `unverified → supported` über eine DSH-Bundle-Grenze. Genau dieser Beweis fehlt in Shinon_Agent (0 verifizierte von 36 Claims).

### 5. @shinon/verify — Falsifikation und Verdict (aus Falsify_Me)
- **Ziel:** Shinon darf glauben, aber nicht behaupten: jeder WRITE-Kandidat braucht Probe + unabhängige Gegenprüfung.
- **Dateien/Module (geplant):** vier Rollendateien als Paket `verify`, ein Vertrag im Verzeichnis `Docs/contracts/`; Proben liegen unter `Docs/probes/` (dieses Dokument nennt drei ältere), geprüft wird heute von `scripts/gate/plugins/probe-twin.mjs` und `scripts/gate/plugins/registry.mjs`.
- **Abhängigkeiten:** `@shinon/claims`, `@shinon/context`, Gate-Engine.
- **Contract:** Probe-Struktur (`id`, `requirement_ref` auf originale H-IDs, `class`, `target`, `claim`, `check`), Anti-Vakuum-Minima, Verdict-Vokabular, „keine Prosa als Evidenz“.
- **Test:** negative Fixtures — leeres Probe-Set → PLAN, jede UNKLAR-Probe → PLAN, API-Fehler → alle Proben UNKLAR.
- **Replay-Nachweis:** Requirement-Splitter, Validator und Gate sind reine Funktionen; `header_digest`/`change_digest` eingefroren und vor jedem Modell-Call geprüft.
- **Definition of Done:** WRITE nur bei vollständig bestätigten Pflicht-Proben; Exit-Code-Mapping (WRITE 0, PLAN/RESEARCH 1, ASK 5, Fehler 3) nachgebildet und getestet. FalsifyMe bleibt dabei eigenständig und wird **nicht** Teil der Persona: Shinon stellt einen Verify-Request, bekommt ein Verdict zurück.

### 6. @shinon/narrative — Chronicle, Arcs, Relationships, Consequences
- **Ziel:** das, was Shinon bisher fehlt: gelebte historische Kontinuität. Nicht „Commit 294“, sondern „Shinon ist im Arc *Übergang vom Framework zur Persona*, offene Threads: …“.
- **Dateien/Module:** `packages/narrative/{index.js,client.js,cordis.patch.yml,package.json}`, `packages/narrative/assets/` (Arc-/Event-/Thread-/Mood-Schemata und Templates), Gate-Plugin + `policy.json`-Slice; ein Eintrag unter `Docs/contracts/` fehlt bis heute. Adapter: DOKI (Observation/Provenance), Commit-Layer (Git-Event → NarrativeEvent), FalsifyMe (Verdict-Wechsel), DSH-Session (Turns). Chronik-State persistiert über `@shinon/context`, nicht in einer neuen DB.
- **Abhängigkeiten:** `@shinon/context` (Observations), `@shinon/claims` (Evidence), `@shinon/persona` (Anzeige des State).
- **Contract:** `NarrativeEvent/Arc/Thread/RelationshipState/Consequence/NarrativeState/NarrativeSnapshot/NarrativeRenderer`; HOT/MID/COLD; Ableitung deterministisch, Prosa austauschbar; `authority: NONE`.
- **Test:** Determinismus-Test — gleiche Chronik + gleiches Event-Set → gleiche Composite-/Mood-/Arc-Auswahl; Snapshot-Test für verlustfreien Freeze; Negativtest „Narrative mutiert technischen State“ → FAIL.
- **Replay-Nachweis:** Chronik-Replay aus Observations reproduziert Arcs und Beziehungszustände; die Nicht-Reproduzierbarkeit der Prosa wird ausdrücklich dokumentiert (Zeit + Modell).
- **Definition of Done:** Narrative mutiert nie technischen State (Invariante getestet); Arc-Freeze komprimiert verlustfrei; ein realer Arc über mehrere Events ist sichtbar und überlebt einen Freeze.

### 7. @shinon/brand-state — Persona-State → Animation (zuletzt)
- **Ziel:** das bestehende Branding (SVG-Mark, Wortmarke, Pulse in `@shinon/core`) zeigt echten inneren Zustand statt Deko.
- **Dateien/Module (geplant):** `packages/core/client.js` (Pulse) oder ein neues Paket `brand-state` bzw. eine Erweiterung des Persona-Clients; ein Vertrag im Verzeichnis `Docs/contracts/`; `Docs/probes/brand-render.json` als Probe.
- **Abhängigkeiten:** `@shinon/persona` (State), DSH `slots`/`styles`.
- **Contract:** State→Visual-Mapping (`IDLE/THINKING/VERIFYING/SPEAKING/CURIOUS/SKEPTICAL/BLOCKED/ERROR`), nur Darstellung, nie State-Quelle.
- **Test:** `client-half`-Gate + `brand-render`-Probe; Mapping-Tabelle als reine Funktion getestet.
- **Replay-Nachweis:** Mapping ist deterministisch aus dem State; die Animation selbst darf zeitabhängig sein (Präsentation, nicht Gameplay/State).
- **Definition of Done:** die Mark pulsiert nachweisbar anders, wenn eine Verifikation läuft — nachweisbar über die Probe, nicht über Augenschein.

## Was zusätzlich NICHT als eigener Shinon-Baustein gebaut wird
- **LIMEN** nicht als eigenes Shinon-System portieren. DSH besitzt die Runtime-/Provider-Seite (`llm-retry`, Modell-Route über pi-ai). Übernommen werden nur Router-, Retry-, Key-Pool- und Fehlerbehandlungs-Prinzipien — als Konzept, nicht als Python-Code (`Shinon_Agent/limen-main`, eigenes Repo `vannon091118/…`).
- **Feed-the-Floor** nicht als Produktmodul: seine Rolle ist die Gate-Engine, und die existiert in `scripts/gate/` bereits als eigene JS-Implementierung.
- **propsa** bleibt Vertrags-/Prüfsprache, kein Runtime-Service.
- **karma / PRISM / ShinonLLM** wurden in dieser Analyse **nicht** geprüft und dürfen nicht als Fundament gelten; `karma_facts` ist nur ein im SPEC genanntes, unbelegtes Kaltgedächtnis.

## Übergabe-Notiz
- Der Stand ist gegen die tatsächlichen Repos geprüft; verifizierte Quellen und Nicht-Repos stehen in der Quellenübersicht.
- Die Analyse widerspricht bewusst zwei früheren Einschätzungen: (1) der Commit Layer ist ein Narrative-System, kein Commit-Text-Gadget; (2) `@shinon/persona` ist bereits gebaut (Prompt-Schicht), der State-Teil fehlt.
- Wenn ein System später weiterzieht: neu lesen. Die Aussagen sind an die oben genannten Dateien und das genannte shinon-forge-Commit gebunden.
