# Batch 0 — Abnahme (Gate-Tabelle, 00G)

> **Status:** current — Abnahme-Review der Slices 00A–00F; jede Zeile nennt die ausgeführte Probe. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md` (einziger Eigentümer harter Zahlen)

Geprüft auf `main` bei `1fd90f9`, Node `v22.23.3`, gepinntes `dsh 0.2.1-alpha.1`.
Der Review hat **nichts gebaut**: die einzige neue Datei dieses Durchgangs ist diese
Abnahme, dazu zwei Reparaturen an überholten Zeilen in
[`BATCH0-SCOPE-2026-10-17.md`](BATCH0-SCOPE-2026-10-17.md).

## 1. Gate-Tabelle

| # | Kriterium | Verdikt | Beleg | Grenze |
|---|---|---|---|---|
| 1 | Fremdworkspace bei Shinon-Host-CWD injiziert keine Persona-/Projektkontextblöcke | **FAIL → behoben (Nachtrag §3)** | Probe gegen den echten `dsh-system-prompt`-Dienst: `SHINON_WORKSPACE_ROOT=<Repo>`, `workspaceRoot: ''` (genau der `dev`-Start), Assembly mit `agent.session.header.cwd=/tmp/voellig-fremdes-projekt` **und** mit `session.cwd` — beide Male **9 `shinon:*`-Abschnitte, 3886 Zeichen, Identity vorhanden** | Der Scope war prozessweit, nicht pro Sitzung: `package.json:17` exportiert die Freigabe für den ganzen Boot; `packages/persona/index.js` las **0**× `ctx.agent`/`ctx.session` |
| 2 | Globale `AGENTS.md`-Kette über den echten Loader isoliert; Profil/Bundles laden weiter | PASS | `node --test scripts/gate/tests/{persona-state,persona-prompt,dsh-home}.test.mjs` → 49/49; `npm run test:full` Exit 0 (0 `❌`/`not ok` im Protokoll); Profilboot separat: **24 Layer, 19 Paket-Bundles, 3 bestanden, 0 fehlgeschlagen** | Ein manuell gesetztes `DSH_HOME=<Repo>` bleibt möglich; der dokumentierte Startpfad tut es nicht |
| 3 | SHA, geladene DSH-Version, Modellroute, Bash-Schema dokumentiert | PASS (P2) | `1fd90f9`; `dsh 0.2.1-alpha.1`; effektiv `agnes/agnes-2.5-flash`; B0-5 nennt `description` vor `command` und die Abwesenheit einer „Befehl zuerst“-Variante | Die Hash-Paare der **gemounteten** Schemata (`cb42c280…`, `1007875…`) stehen nur im Sitzungsbericht, nicht in der Befunddatei |
| 4 | Enhancer-/Credential-/429-/Budget-/Fallbackpfade getestet oder korrekt NOT_VERIFIED | PASS + NOT_VERIFIED | `packages/prompter/test/enhancer-guards.test.mjs` 9/9; Metadaten-Probe: je Fall Ausgang, Grund, Antwortzeichen, Dauer, Wiederholungen — alle **0** | Echter Modellturn **NOT_VERIFIED** (kein `PROMPTER_API_KEY`, keine Budgetfreigabe); `maxTokens` unverändert Konfigurationsfakt |
| 5 | Job-Registry reproduziert oder mit konkretem Grund blockiert | PASS, Ursache BLOCKED | Werkzeugebene mit echtem Besitzer-Agenten: `job_list` → `(no background jobs)`; fremde ID → `unknown job job-9999`; fremder Besitzer → `job subagent-1 belongs to another session`; eigener Job nach Settlement lesbar | Welcher der drei Kandidaten im historischen Lauf griff, braucht einen echten Subagent-Turn — Session-Fence ist als Ursache **widerlegt** |
| 6 | Individuelle Läufe/Exitcodes stimmen mit den Behauptungen | PASS | frisch gemessen: `npm test` 0, `npm run gate:test` 0 (597/597), `npm run test:full` 0, `npm run zahlen:check` 0, gezielte Persona-/Home-Suite 49/49, Enhancer 9/9 | Keine Freigabe aus `npm test` allein — die separaten Skripte sind einzeln gelaufen |

**Secret-/Dump-Prüfung:** `git diff` gegen Schlüssel-, Token- und PEM-Muster → kein
Treffer; `.env`/`.credentials.yaml` nicht im Status; die neue Enhancer-Testdatei
fängt `console.warn` nur ab und gibt Prompt- oder Antworttext nie aus (sie prüft
Längen, Gründe, Aufrufzahlen).

## 2. Entscheidung

**NO-GO für Batch A — zum Zeitpunkt dieser Abnahme.** Kriterium 1 ist ein P0 und
fiel nicht an einer Lücke der Tests, sondern am Code: die Freigabe, die
`npm run dev` setzt, gilt für den Boot — die Persona fragte keine Sitzung. Ein
fremder Session-Workspace unter einem in Shinon gestarteten Host bekam weiterhin
Identität, Disziplin, Zustand und Report (gemessen: 3886 Zeichen).

**Nachtrag 2026-10-17 (nach dem Fix):** der Scope folgt jetzt der Sitzung
(`agent/pre-step` → `agent.session.header.cwd`, im Async-Kontext des Schritts).
Gemessen am echten Dienst: fremde Sitzung ⇒ **0 Abschnitte mit Text**, Sitzung im
Repo ⇒ Abschnitte und Identity wie zuvor. Kriterium 1 ist damit **PASS**; die
Entscheidung oben bleibt als Zeitpunkt-Beleg stehen, **Batch A ist frei**.

Der Satz aus 00C, „ein fremder Workspace bleibt stumm“, gilt nur für den Fall,
dass der Workspace **benannt** ist (`workspaceRoot` oder `SHINON_WORKSPACE_ROOT`
zeigt woandershin). Genau dieser Fall ist getestet und grün. Der ungetestete
zweite Fall — Host sagt Shinon, Sitzung sagt fremd — ist der historische Befund.

## 3. Kleinster offener Fix (ausgeführt am 2026-10-17)

Ein Prädikat und zwei Tests, kein neues Teilsystem:

1. **Quelle:** der Workspace der **Sitzung**, nicht des Prozesses. Der Host reicht
   ihn als `agent.session.header.cwd` durch — genau so liest ihn der echte
   Instruktions-Loader (`node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js:912`
   und `:1122`).
2. **Regel:** die Persona spricht nur, wenn dieser Pfad **innerhalb** der
   freigegebenen Wurzel liegt. `SHINON_WORKSPACE_ROOT` bleibt die Freigabe des
   Hosts (Obergrenze), ist aber nicht mehr die Antwort für die Sitzung.
3. **Ort:** nicht im Abschnittstext. `AssembleContext` trägt nur `scope` und
   `signal` (`node_modules/@deepseek-ai/dsh-system-prompt/lib/types/index.d.ts:37-45`),
   ein `text: (ctx) => …`-Provider sieht den Pfad also nicht. Die Entscheidung
   gehört dorthin, wo der Agent sichtbar ist (Agent-Hook bzw. Registrierung im
   Agent-Scope), also in `packages/persona/index.js` um `apply()`.
4. **Tests:** `env=<Repo>` + Sitzungs-CWD `<Repo>` ⇒ Abschnitte vorhanden;
   `env=<Repo>` + Sitzungs-CWD fremd ⇒ **0** `shinon:*`-Abschnitte. Beide gegen
   den echten Dienst, wie in `scripts/gate/tests/persona-prompt.test.mjs`.

Erst danach ist Batch A (Engineering-Profile-Contract) freigegeben.
