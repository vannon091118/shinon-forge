# Changelog — erledigte Arbeit mit Beleg

> **Status:** current — die einzige Liste erledigter Arbeit: je Eintrag Datum, was, und wo der Beleg liegt. **Stand:** 2026-10-20
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Regeln dieser Datei: nur Abgeschlossenes mit Beleg (Beleg = Testlauf, Gate, Probe
oder Archiv-Dokument — nie eine Behauptung), keine Zahlen außer Datum und SHA
(Bestand und Messungen stehen ausschließlich in `docs/ZAHLEN.md`), keine offenen
Punkte (die stehen in `docs/ROADMAP.md`). Ein Eintrag wird nicht umgeschrieben —
höchstens ergänzt. Detailtiefe früherer Durchgänge steht im Archiv
(`docs/archive/CHANGELOG.md` für die Umbau-Schritte, je Nachweis-Dokument für
den Rest); hier steht die kurze, datierte Zeile.

## 2026-10-20

- **Modellwahl bleibt variabel.** Der Gate-Test der One-Shot-Route verlangte
  bis heute „der Haupt-Turn läuft NICHT auf dem Prompter-Provider" — ein
  Modell-Literal mit anderem Namen, das jede Route-Auswahl zum Gate-Fall
  machte. Geprüft wird jetzt die FORM: der gewählte Provider steht im Katalog
  des Profils, und der Fallback des One-Shots ist eine definierte Route
  (`scripts/gate/tests/profile-config-override.test.mjs`, Fall 5). Wer ein
  Modell testet, wechselt die Route, ohne eine Zusage zu brechen.

- **Welle 2, Teil 2: der Index wird warm, ohne Dauerbeobachter.** Der Kaltlauf
  beim Mount bleibt der Start; `resolveContext` prüft danach nur die KANDIDATEN
  der Abfrage über den vorhandenen Inode-Stempel (Gerät, Inode, Größe, mtime,
  ctime) und liest ausschließlich geänderte oder neue Dateien neu
  (`refreshIndex`/`probeCandidates` in
  `packages/project-index/assets/index-core.js`, gedeckelt durch
  `WARM_CANDIDATE_LIMIT`). Kein Watcher, kein Vollscan je Turn, und der
  Kontextvertrag bleibt bei seinen sechs Schlüsseln: der Bericht reist über
  `onRefresh` (Diagnose), nicht als siebter Schlüssel. Ein gelöschter Kandidat
  verliert seine Zeilen, ein im Prompt genannter neuer Pfad wird aufgenommen,
  und der Secret-Schutz bleibt unverändert (roh gelesen, nur redigiert
  indexiert). Belege: `scripts/gate/tests/index-warm.test.mjs` (7 Tests; die
  Mutation „Stempel ohne ctime/Inode" macht die Änderungs-Probe rot) und der
  reproduzierbare Messlauf `npm run index:warm` — Zahlen in `docs/ZAHLEN.md` §2.

- **Welle 2, Teil 1: Abbruchquote gemessen.** Der Enhancer-Ausfall ist keine
  Logzeile mehr, sondern ein Feld: `packages/prompter/assets/abort-core.js`
  (importfrei) klassifiziert jeden nicht ersetzten Turn nach
  `abort-reasons.json` (`shinon.abort-reasons/v1`; Timeout, leerer Stream,
  ungültiges JSON, kein JSON, Salvage, fehlende Route) und rechnet Zähler,
  Quote und Top-Grund; `packages/prompter/index.js` hängt nur das Ergebnis an
  (`withAbort`) und trägt `abort`, `abort_counts` und `abort_quote` im
  Entscheidungsdatensatz und im Fensterspiegel. Das Panel zeigt
  `abbr=<abbrüche>/<turns> <prozent>%` mit dem häufigsten Grund im Tooltip, das
  Popup faltet dieselben Einträge über die bestehende Zwillingsregion
  `zwilling:popup-trajectory` (kein zweiter Kanal); `abort.rank` reist mit,
  damit beide bei Gleichstand dieselbe Priorität anwenden. Ein neuer Grund ist
  ein Dateneintrag, keine Client-Änderung. Gemessen gegen den Leitstand
  (9 Turns, 5 Ausfälle → 5/9, Top `KEIN_JSON`):
  `packages/prompter/test/abort-core.test.mjs`, `abort-trace.test.mjs`,
  `packages/popup/test/trajectory-core.test.mjs`,
  `scripts/gate/tests/popup-overlay.test.mjs`,
  `scripts/gate/tests/client-activation.test.mjs`; Vertrag:
  `docs/contracts/abort.json`.

- **Welle 1: Riegel, Matrix, Form.**
  (1) Der pre-commit prüft `zahlen:check` VOR `npm test`: §1 der ZAHLEN muss
  vor dem Commit stimmen, §2 bleibt ein datierter Messwert, und der Hook
  schreibt nie (`zahlen:sync` steht nicht darin). Dieselbe Zeile steht in der
  Installer-Vorlage, damit `npm run hooks:install` den Riegel nicht wieder
  herausnimmt; `scripts/gate/tests/hooks-zahlen.test.mjs` hält beides fest.
  (2) `packages/prompter/assets/intent-conflicts.js` erzeugt aus
  `intent-rules.json` die Konfliktmatrix (exakt, Präfix, Teilwort, gleiche
  Expansion, gleiche Klasse) und der Resolver löst nach der Regel „längste
  Phrase, dann Klasse, dann Erfahrung, dann ID" — die Datenreihenfolge
  entscheidet nichts mehr. Die echte Datei hat 92 Patterns, 402 Trigger und
  genau eine exakte Doppelung (`wie funktioniert` → `read-code`,
  `how-works`). Belege: `packages/prompter/test/intent-conflicts.test.mjs`,
  `scripts/gate/tests/intent-through.test.mjs`.
  (3) Die Modellroute wird als FORM geprüft: `scripts/lib/model-route.mjs`
  liest Provider, Katalog und Wahl aus dem Profil-Patch, `routeIssues` nennt
  jeden Formfehler, und `scripts/mobile-profile-contract-test.mjs` pinnt kein
  Modell-Literal mehr. Agnes steht als empfohlene kostenlose Route in
  `README.md`. Beleg: `scripts/gate/tests/model-route.test.mjs`.


- **Fähigkeitskarte:** 26 Fragen über 21 Pakete, je genau ein Eigentümer; die
  Karte (`shinon.capabilities/v1`) nennt Frage, Paket, Naht, Grenze und Beleg,
  und der Kern lehnt doppelte Fragen oder Begriffe fail-closed ab. Der
  Aufgabenbrief (fünf Felder, harte Zeichengrenze) hängt hinter dem veredelten
  Prompt und reist als `DERIVED`-Eintrag in die Provenienz; ohne Treffer oder bei
  Gleichstand gibt es keinen Brief, und `brief_reason` nennt den Grund. Belege:
  `docs/contracts/capabilities.json`,
  `packages/prompter/assets/capabilities.json`,
  `packages/prompter/test/capability-map.test.mjs`,
  `scripts/gate/tests/capabilities.test.mjs`.

## 2026-10-19

- **Provenienz-Leiter als Runtime-Vertrag:** fünf Klassen (`FACT`, `DERIVED`,
  `JUDGEMENT`, `NARRATIVE`, `PROPOSAL`), Zeigerpflicht auf relativen Pfad oder
  Vertrags-ID, keine Beförderung. Der Entscheidungsdatensatz trägt
  `provenance_contract` und `provenance`, die Fensterspur den Zensus; ein
  ungültiger Eintrag steht mit Grund in `violations`, statt zu verschwinden.
  Belege: `docs/contracts/provenance.json`,
  `packages/prompter/test/provenance.test.mjs`,
  `packages/prompter/test/provenance-trace.test.mjs`.
- **Spurfelder des Index-Kontexts:** `context_budget_tokens`, `context_chars`
  und  `context_files` werden jetzt auch für `shinon_index_query` gesetzt — vorher
  nannte der Datensatz für den Index weder Dateien noch Zeichen. Beleg:
  `packages/prompter/test/provenance-trace.test.mjs` (Index-Fall).

## 2026-10-18

- **Index-Konsolidierung (C1):** der Prompter führt keinen zweiten Index mehr —
  MAX fragt `shinon_index_query`. Beleg: `docs/probes/index-konsolidierung.json`.
- **Vertragsform der Commit-Policy:** `docs/contracts/commit-policy.json` trägt
  die sieben Propsa-Punkte (Eignerentscheidung statt Ausnahme); der
  Policy-Validator prüft deren Form. Beleg: Gate `contracts` grün.
- **Lokale Gates 11 → 4 (P0):** `scripts/gate/policy.json`; `npm test` bleibt der
  schnelle Pfad. Beleg: Gate-Lauf.
- **Totes Paket gelöscht (P1):** das Shinon-Forge-Paket entfernt, Lock nachgezogen.
- **Singleton-Wächter:** `dsh-singleton` pinnt eine `@deepseek-ai/dsh-tools`-Kopie
  im Baum (Antwort auf den `prepare`-Absturz als Upstream-Muster).
- **Dok-Konsolidierung (3.10):** eine Roadmap, ein Changelog; der Root-Plan und
die Starter-/Mobile-/Scoring-Pläne sind nach Übernahme gelöscht (Umleitung:
`docs/archive/README.md` §2).

## 2026-10-17

- **S4 belegt:** `shinon doctor` als Laufzeit-Unterbefehl, read-only.
  Beleg: `docs/S4-DOCTOR-2026-10-17.md`.
- **S3 belegt:** Frischklon-Repro bis UI-Start. Beleg: `docs/S3-FRESH-d8999ab.md`.
- **Commit-Regeln scharf (A6):** VANNON-Trailer, Wort-Regel, Wächter in Hook und CI.
  Beleg: `docs/COMMIT-REGELN.md`, Gate `commit-trailer`.
- **Eine Schemastery-Fassung im Baum (1.2):** Pin und Abgleich, Vendor-Abgleich offen.
- **Vendor-Pin gezogen (A4):** `vendor/dsh` auf Root-Pin-Fassung, Integrität im Manifest.
  Beleg: `docs/archive/A4_DSH_FASSUNG_2026-10-17.md`.
- **Key-Router-Vertrag:** kein Schlüsselfeld im Schema, Logs redigiert, Kette bis
  zum Loopback-Draht belegt; nur die Live-Rotation bleibt offen.
- **Umzug auf DSH `0.2.1-rc.2`:** eine Sollquelle, ein Prüfer.
  Beleg: `docs/DSH-RC2-INTEGRATION.md`.
- **Nutzer-Installat und Backup-Aufbewahrung:** eigene Gate-Tests, `auto`-Staging
  verweigert, jüngstes Backup unantastbar.

## 2026-10-13

- **`key-router`, `popup`, `narrative` aktiviert und verdrahtet (§3.12):**
  Pool-Werkzeuge, Fortschritts-Overlay, Composite-State mit Abnehmer.
- **Codingmon-XP-Regel:** nur `turn/end` mit `reason=completed` zählt.
- **Marker-Grenzen:** wirksame Limits reisen in die Seite, fremde Verträge verworfen.
- **Audit Phase B:** Befunde mit Belegen geschlossen.
  Beleg: `docs/archive/AUDIT_2026-10-13.md`.

## 2026-10-11 und früher

- **Umbau-Schritte P1–P3, 1.x–3.x:** Ist-Stand, Upstream-Diff, Idiom-Quelle,
  Profil-Altlasten, Defaults, DSH-Subset, Vendoring, Spike, Einstieg, pnpm-Rückbau.
  Beleg: `docs/archive/CHANGELOG.md`, `docs/archive/UMBAU_2026-10-11.md`.
- **Starter Stufe 1 scharf:** `npm run open` startet DSH und öffnet die
  tokenisierte URL im Systembrowser. Beleg: `scripts/open.mjs`.
- **Scoring-Basis K1–K5:** Signale, Ledger-Ablage, lesende Kerne.
  Konzept: eingezogen (Rest: K7b, K8 — siehe Roadmap).
