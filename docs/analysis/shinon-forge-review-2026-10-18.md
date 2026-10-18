# Review 2026-10-18 — Befunde, Behebung, benannte Lücken

> **Status:** current — der externe Review vom 2026-10-18, am Baum nachgemessen und
> abgearbeitet; was offen bleibt, steht in §6 mit Grund. **Stand:** 2026-10-19.
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Der Review wurde gegen `origin/main @ 974e512` geschrieben. Dieses Dokument nennt
ihn beim Befund, korrigiert die Zahlen am Stand `35b17e5` (drei Commits später) und
hält fest, was in dieser Runde geändert wurde. **Keine Zahl hier ist aus dem Review
abgeschrieben** — jede wurde mit dem danebenstehenden Befehl neu gemessen.

## 1. Methode und Grenzen

Gemessen wurde im vollständigen Klon (`npm ci`, 628 Pakete) mit dem gepinnten DSH
(`node_modules/.bin` vor dem PATH). Nicht geprüft: der Live-Betrieb der Agenten, der
Pack-Test und der Profil-Boot mit einer globalen DSH-Installation. Der Review nennt
dieselben Grenzen; an ihnen ändert dieses Dokument nichts.

Zwei Aussagen des Reviews waren am Stand `35b17e5` überholt und werden hier richtig
gestellt:

| Review-Aussage | Messung am `35b17e5` |
|---|---|
| 85 Markdown-Dateien getrackt, ZAHLEN sagt 88 | `git ls-files '*.md' \| wc -l` → **86** (die Analyse-Datei kam hinzu); ZAHLEN stand bei 88 |
| `gate:test` 674 Tests, 3 rot | **678/678 grün** als uid 1000; die beiden `chmod 000`-Fälle scheitern nur als root |
| 13 getrackte Dateien ohne Statusblock | nach korrigiertem Muster (`^> \*\*Status`) **10**: 6 Skills, `.shinon/project-context.md`, der Ordnungs-Audit, zwei vendorte READMEs |

Der Review ist damit in der Sache richtig, in den Zahlen an drei Stellen daneben —
was für einen Bericht über einen bewegten Branch normal ist. Verbindlich ist der
Baum, nicht der Bericht.

## 2. Governance: was geändert wurde

**B2 — Startskript und Release-Trigger (geändert).** `.freebuff/settings.json` trug
„Commit+push nach jeden task". Zusammen mit `push: branches: [main]` in
`.github/workflows/runtime-release.yml` erzeugte jeder Push ein Tag `runtime-<sha7>`,
ein Release und einen Commit im Schwesterrepo. Jetzt: das Startskript verlangt
Commit/Push nur auf ausdrücklichen Auftrag, der Release-Lauf startet ausschließlich
über `workflow_dispatch`. Der mobile Workflow triggerte auf einen Branch, den es auf
origin nicht gibt (`git ls-remote --heads origin 'mobile/*'` → leer); der Push-Trigger
ist entfernt, PR und manueller Start bleiben.

**B4 — Skills gegen `AGENTS.md` abgeglichen (geändert).** Drei Widersprüche waren
messbar: „Repo-Root ist das `DSH_HOME`" (AGENTS: ausdrücklich nicht), `dashboard` als
„Platzhalter" (liest die echten `workspaces`/`sessions`-Dienste), `npm test` als
„Gesamtstack" (läuft in Sekunden, 5 von 25 Gates). Alle drei sind korrigiert, die
Befehlskarte trennt jetzt `npm test` (schnell) von `npm run test:full` (Abnahme).
Alle sechs Skills tragen einen Statusblock.

**B6 — Doku-Regel wird geprüft (teilweise geändert).** Neues Gate-Plugin
`docs-status` (`scripts/gate/plugins/docs-status.mjs`, Slice in
`scripts/gate/policy.json`, läuft in `always` **und** `local`): jede getrackte
Markdown-Datei braucht `> **Status:**`. Ausgenommen sind nur `docs/archive/`
(Archiv-Banner) und `vendor/` (Fremdtext mit sha256 im `MANIFEST.json`). Der
Ordnungs-Audit und alle Skills tragen den Block jetzt, `.shinon/project-context.md`
ebenfalls. **Was das Gate nicht prüft:** ob die Zahlen in zwei Dokumenten
übereinstimmen — dafür bleibt `npm run zahlen:check` allein beim generierten
Bestandsblock.

**B7 — Ausnahme mit Enddatum (geändert).** Der Ordnungs-Audit setzte die Regeln aus
`AGENTS.md` aus, ohne dass `AGENTS.md` das erwähnte. Die Ausnahme steht jetzt in der
Datei, die sie setzt, mit Enddatum 2026-10-19; `AGENTS.md` verlangt, dass jede
künftige Ausnahme dort mit Enddatum steht.

**B1 — Commit-Prosa (bewusst unverändert).** Wortzahl, Bildsprache und Belegpflicht
bleiben. Das ist eine Eignerentscheidung, keine offene Frage; die Regel steht
weiterhin in `scripts/lib/commit-text.mjs` und `docs/contracts/commit-policy.json`.
Die 9 von 10 Alt-Commits, die der Review nennt, bleiben Verstöße — sie lassen sich
nicht nachträglich reparieren, ohne die Historie umzuschreiben. Für **neue** Commits
gilt der Wächter unverändert.

## 3. Verdrahtung: tote Verweise und tote Importe

Behoben:

- `packages/persona/index.js`: toter `fileURLToPath`-Import entfernt.
- `packages/codingmon/index.js`: `SPECIES` stand nur noch im Kommentar, nicht im
  Import.
- `packages/hook/client.js`: `React` wurde geladen und nie benutzt.
- `scripts/open.mjs`: die komplette `fs`- und `path`-Importzeile war tot.
- `scripts/deb-build.mjs`, `scripts/gate/plugins/scoring.mjs`, `scripts/index-cold-cost.mjs`,
  `scripts/index-match-eq.mjs`, `scripts/install-hooks.mjs`, `scripts/s6-turn.mjs`,
  `scripts/scale-check.mjs`, `scripts/store-cost.mjs`, `scripts/sync-zahlen.mjs`,
  `scripts/vendor-dsh.mjs`: je eine ungenutzte Bindung entfernt.
- `packages/prompter/index.js`: `readdirSync` entfernt; der Schemastery-Import
  **bleibt** — das Gate `host-half` verlangt ihn, obwohl das Schema in
  `assets/schema.js` liegt. Der Kommentar sagt das jetzt, damit niemand ihn erneut
  „aufräumt".
- `docs/contracts/events.json` und `packages/events/assets/event-spine.json`: die
  Behauptung „mengengleich mit `packages/core/session/src/known-event-types.ts` auf
  master `5badb150`" war nicht nachvollziehbar (die Datei liegt nicht im Baum). Sie
  ist durch die messbare Quelle ersetzt: `carrier.verifiedTypes` (17) +
  `carrier.ignoredTypes` (42) = 59. Die alte Zahl im Vertrag (14 abgebildet / 45
  ignoriert) war falsch und ist auf 17/42 korrigiert — gemessen am Datenfile, nicht
  am Kommentar.
- `packages/key-router/assets/pool-core.js`: `PLAN.md §3.12` → `Plan §3.12`; der
  eingefrorene Zeiger auf `docs/COMMENT-KANON.md` bleibt damit inhaltlich stehen
  (siehe §6.2).
- `docs/CHANGELOG.md`: die Datei existierte nur im Arbeitsbaum, nicht in git — zwölf
  Verweise (u. a. `AGENTS.md`, `README.md`, `docs/ROADMAP.md`) zeigten auf einen
  toten Pfad. Die Datei ist jetzt getrackt; `git ls-files docs/CHANGELOG.md` nennt
  sie, und `docs/INDEX.md` führt sie weiter als einzige Liste erledigter Arbeit.
- **Nachtrag 2026-10-19 (live gemessen):** Ein abgeschnittenes JSON im
  `json`-Zaun (`{"enhancedPrompt": …`) passierte die JSON-Sperre in `salvageProse`,
  weil sie nur vor dem Zaun griff — der Nutzer sah ein halbes Objekt statt seines
  Prompts. `packages/prompter/assets/enhancer.js` prüft jetzt nach dem Auspacken
  erneut; drei Fälle in `scripts/gate/tests/prompter-contract.test.mjs` decken das
  ab, `npm run gate:test` zählt seither 680 statt 678 Tests.
- `docs/CI.md`: der Abschnitt behauptete ein rotes `contracts`-Gate. Nachgemessen:
  `npm run gate:full` → **Exit 0**, 25 Gates, 0 rot. Der Absatz nennt jetzt die
  Messung vom 2026-10-19 und den behobenen Befund.

## 4. Tests: zwei Befunde, zwei Reparaturen

**uid 0.** Die beiden Rechte-Tests in `scripts/gate/tests/project-index.test.mjs`
setzen `chmod 000`; als root ignoriert der Kernel Dateirechte, die Tests wurden rot
ohne Repo-Defekt. Sie überspringen jetzt **sichtbar** mit Grund, wenn
`process.getuid() === 0`. Als uid 1000 laufen sie weiter.

**Wanduhr.** Der Worker-Test verlangte `host.ms > 100`, der Fixture-Lauf dauerte auf
dieser Maschine 85 ms — die Prämisse riss, obwohl die eigentliche Aussage
(`host.ticks === 0` gegen `mounted.ticks >= 5`) trug. Das Fixture ist auf 400 Dateien
× 40 Zeilen vergrößert (gemessen: der Test läuft in ~2,9 s statt ~1 s), damit die
Schranke auf schnellen Runnern nicht mehr die Prämisse testet statt das Verhalten.

**Ungenutzte Test-Helfer.** `prompter-profile-wiring.test.mjs` las das Bundle-Patch
und prüfte es nicht; der Test heißt jetzt, was er prüft („keine statische
Kontextdatei verdeckt den Laufzeit-Index"). `key-router-wire.test.mjs` registrierte
einen `errorHandler` und rief ihn nie auf; der Test prüft jetzt, dass der
429-Beobachter hängt und den Fehler **weiterreicht** (`forwarded === 1`) — die
Zusage „beobachten, nie wiederholen".

## 5. Redundanz und Grenzen (unverändert, benannt)

Der Review nennt vier Kopien von `icon.svg`, identische `cordis.yml` in den Profilen,
`.node-version`/`.nvmrc` und drei S3-Berichte. **Nicht geändert**, weil jedes Paket
als eigenes Tarball ausgeliefert wird und sein Icon selbst mitbringen muss; die
Profil-Dateien sind bewusst gleich und werden von `profile` geprüft; die S3-Berichte
sind datierte Belege, keine Doku-Dubletten.

`vendor/dsh` (140 KB) wird von keinem Laufzeitcode geladen, aber vom Pin-Test
gelesen und über `MANIFEST.json` gehasht. Entfernen würde den Versionsbeweis
schwächen, nicht die Laufzeit verschlanken — bleibt.

`react` in zehn Client-Bundles ist nicht als Peer deklariert; der Host liefert es.
Eine Deklaration wäre ein Vertragswechsel aller Pakete, kein Aufräumen — bleibt
offen (§6.7).

## 6. Bekannte Lücken (bewusst nicht in dieser Runde)

1. **B1 Commit-Prosa.** Bleibt per Eignerentscheidung. Alt-Commits bleiben Verstöße.
2. **B3 Kommentar-Kanon.** Die 10-LOC-Regel und `docs/COMMENT-KANON.md` (381 KB,
   289 Zeiger) bleiben. Der Review maß 88 von 285 Zeigern (31 %) mit veraltetem
   Zieltext. Eine Reparatur ist `node scripts/comment-limit.mjs --fix`, das die
   Kanon-Datei **vollständig** neu schreibt; das ist ein eigener Zug mit eigener
   Abnahme, kein Nebenprodukt dieser Runde. Die Änderung an `pool-core.js`
   verschiebt den Anker um eine Zeile — der Text dort ist jetzt inhaltlich richtig,
   der Kanon-Abgleich bleibt offen.
3. **B5 Governance außerhalb des Repos.** G0–G7, die Release-Liste und der
   Ausnahmekatalog stehen auf einer Notion-Seite und in `~/.agents/AGENTS.md`. Von
   hier ist die Seite nicht lesbar; sie ins Repo zu kopieren, ohne sie gelesen zu
   haben, wäre erfunden. **Entscheidung nötig:** Seite exportieren und als
   `docs/AGENT-MEMORY.md` führen, oder den Abschnitt aus `AGENTS.md` streichen.
4. **B8 Zettel ohne Review.** `generated-skills/` erlaubt dem arbeitenden Modell,
   Regeln zu schreiben; geprüft werden sie nur mechanisch (`notes-check`). Ein
   Review-Schritt (zweiter Lauf, Datum, Beleg) ist nicht gebaut. Vorschlag steht im
   Review, die Mechanik bleibt bis zur Entscheidung wie sie ist.
5. **Doku-Zahlen.** `docs-status` prüft Statusblöcke, nicht Zahlen. `docs/CI.md`
   nennt weiterhin Testzahlen aus Oktober; sie sind jetzt als Verweis auf
   `docs/ZAHLEN.md` formuliert, wo sie hingehören, aber ein Gate prüft das nicht.
6. **Tote Exporte und Test-Bindungen.** 44 ungenutzte Bindungen (TypeScript) sind
   nur für Laufzeit- und Skriptcode bereinigt; der Testrest (z. B.
   `scripts/gate/tests/desktop-integration.test.mjs` mit vier ungenutzten
   `fs`-Importen) bleibt. 82 Exporte ohne externen Importeur sind eine Heuristik —
   wer sie entfernt, muss vorher suchen; nicht in dieser Runde.
7. **`react` als Peer.** Zehn Client-Bundles laden `react` über `require`; der Host
   liefert es, deklariert ist es nirgends. Eine Peer-Deklaration ändert alle
   Paketmanifeste und braucht eine eigene Abnahme.
8. **Eingefrorene Namen.** `scripts/lib/repo.mjs` und `scripts/lib/dsh.mjs` nennen in
   Kommentarblöcken `scripts/dsh-test.mjs` und `dsh-profile-test.mjs`; die Dateien
   heißen heute `shinon-test.mjs` und `shinon-profile-test.mjs`. Die Blöcke tragen
   `→ Kanon`-Zeiger; eine Änderung ohne `--fix` würde den Kanon weiter auseinander
   laufen lassen (§6.2). `docs/INDEX.md` §4 erklärt historische Namen bereits als
   Text, nicht als Live-Pfad.
9. **`packages/prompter/test/workspace.test.mjs`** importiert über die Paketgrenze
   aus `packages/project-index/assets/`. Nur Test, aber es ist die einzige
   Paket-übergreifende Importkante; ein Zwillingstest am Ort des Spiegels wäre
   sauberer.

## 7. Was in dieser Runde gemessen wurde

| Prüfung | Ergebnis |
|---|---|
| `npm run gate:full` | Exit 0, 25 Gates, 0 rot (nach der Reparatur von `host-half`) |
| `node scripts/gate/engine.mjs --only docs-status` | Exit 0 |
| `node scripts/gate/policy.mjs` | Exit 0 (Plugin und Trigger synchron) |
| `node --test scripts/gate/tests/project-index.test.mjs` (gezielt) | 3/3 grün, Rechte-Tests als uid 1000 gelaufen |
| `node --test scripts/gate/tests/prompter-profile-wiring.test.mjs scripts/gate/tests/key-router-wire.test.mjs` | 3/3 grün |
| `npm run zahlen:check` | nach `zahlen:sync` Exit 0 |
| `npm run gate:test` | 680/680 grün, 0 Skips (uid 1000) |
| `profile-links --check` | Exit 0, 29 Links, keiner nach außen |

Der Review selbst bleibt als Bericht stehen; dieses Dokument ist die Antwort darauf,
kein Ersatz. Wer den nächsten Durchgang schreibt, misst wieder am dann aktuellen
`HEAD` — die Zahlen oben sind datiert, nicht zeitlos.
