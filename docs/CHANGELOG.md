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
