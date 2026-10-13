# Handshake — CI-Lauf grün inkl. Verdict, Schranke noch nicht scharf, sieben Lücken adjudiziert

> **Status:** current — Übergabe dieses Durchgangs: der grüne Remote-Lauf mit SHA und Run-ID, der Branch-Protection-Blocker mit Copy-paste-Befehl, und zu jeder der sieben gemeldeten Lücken der Befund am Baum plus die konkrete Abnahme. **Stand:** 2026-10-13
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

## 1. Der grüne Lauf (kein lokaler Zähler, sondern der Remote-Beleg)

| Feld | Wert |
|---|---|
| Commit (gepusht, Branch `freebuff/3c0503f1a0a9f177352b0431`, kein neuer Branch, kein Rebase) | `bf003a28262ebbc41f57e8063528388bc84f8de4` |
| CI-Run | `38474747771` (`push`, Run-Nummer 138) |
| URL | `https://github.com/vannon091118/shinon-forge/actions/runs/38474747771` |
| Status / Conclusion | `completed` / `success` |
| Verdict-Job | `Verdikt (fail-closed)` — `completed` / `success` |

Alle 14 Jobs `success`: Commit-Wächter, Codemon-Engine, Hook-Replay, Narrative-Kern, Scoring-Signale, Token-Usage-Kern, Gate-Tests, Statisches Gate, Fixtures, Distribution, Profilboot, Prompter, TypeScript Gate, Verdikt. Gemessen über die Runs-/Jobs-API, kein Log-Scraping.

Lokal gegen denselben Baum: `npm test` **Exit 0**, `npm run gate:test` **466/466 Exit 0**, `npm run gate:full` **PASS Exit 0** (21 Gates, 0 rot). Nebenbei geschlossen: ein Flake in `project-index.test.mjs` (4-ms-Raster der ctime plus 1-ms-Rundungsfalle; Vorbedingung jetzt deterministisch hergestellt, keine Assertion gelockert).

## 2. Die Schranke: gebaut, belegt — aber nicht scharf

Versuch, den Schutz zu setzen/prüfen: `GET .../branches/main/protection` antwortet **401 „Requires authentication"**; `gh` ist in dieser Umgebung nicht installiert, kein Admin-Token verfügbar. Es gibt bewusst **keinen** Workaround: ein Schutz, den man sich selbst bestätigt, ist keiner.

**Soll-Zustand (exakt):** `required_status_checks.strict = true`, `contexts = ["Verdikt (fail-closed)"]` (der Anzeigename, nicht die id), `enforce_admins = true`, PR vor Merge Pflicht.

**Copy-paste für den Betreiber** (steht auch in `docs/CI.md` §2):

```bash
gh api --method PUT "repos/vannon091118/shinon-forge/branches/main/protection" \
  --field required_status_checks='{"strict":true,"contexts":["Verdikt (fail-closed)"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews=null \
  --field restrictions=null
gh api "repos/vannon091118/shinon-forge/branches/main/protection" \
  --jq '.required_status_checks.contexts[]'
```

Erwartet: `Verdikt (fail-closed)`. Bis dieser Befehl den Namen ausgibt, gilt der Satz aus `docs/CI.md`: die Schranke ist gebaut, nicht scharf — PR #9 (Merge trotz Rot) bleibt der Beleg dafür, dass Mergen bei Rot möglich ist.

## 3. Die sieben Lücken — Befund am Baum, keine Wiederholung der Meldung

Gelesen, verstanden — und am Baum nachgeprüft statt gezählt. Ergebnis je Lücke: was stimmt, was überholt ist, und die **konkrete Abnahme**, an der man sieht, wann sie geschlossen ist.

| # | Lücke | Befund am Baum | Abnahme (prüfbar) |
|---|---|---|---|
| 1 | Key-Router „Vitrine ohne Tür" | **Überholt im Kern, offen im Nachweis.** Der Override existiert und ist verdrahtet: `createResolveOverlay` (`packages/key-router/assets/pool-core.js`) klammert `credentials.resolve`, `agent/request-error` deckelt nach `RATE_LIMIT` (`packages/key-router/index.js`, mit fail-closed-Meldungen wenn der Dienst fehlt). Tests: 17 Pool-Kern + 6 Sicherheitsvertrag + 3 Override, grün. Was stimmt: **echte 429-Rotation nie gemessen** (leerer Pool im Live-Boot, kein Schlüssel in der Umgebung). | Erzwungener 429 gegen die laufende Route mit zwei echten Schlüsseln: Platzwechsel im Log, kein Schlüsselmaterial in Logs/Kontext; steht bereits als offen in `docs/ZAHLEN.md` §4 |
| 2 | Task-Router klassifiziert, tut nichts | **Bestätigt — und so entschieden** (C7: `activate: false` bis H5; Blocker-Kette `stages` → 3.9 → 3.8 → Upstream-Diff). Kein Bruch, sondern ein angehaltener Schritt. | H5-Entscheidungstabelle in `docs/audit/` (je Feature behalten/verwerfen mit Messung) |
| 3 | Namensgeber `shinon-forge` inactive | **Bestätigt; das Verdikt steht, der Folgeschritt fehlt.** 3.12.1 begründet `inactive` (einziger `child_process`-Import, neun fremde CLIs, fünf Tools, Intervall-Daemon). Die Meldung stimmt darin: Einen **Aktivierungs-Schritt mit Sicherheitsvertrag** (welche Kommandos, welches `cwd`, welche `env`, wer sieht die Ausgabe, was bei Abbruch) gibt es im Plan nicht. | Neuer Plan-Schritt mit Vertragsdokument + Gate-Test, der ihn pinnt; bis dahin bleibt `dsh.inactive: true` die ehrliche Aussage |
| 4 | §19 / `LAST_VERIFIED_FACT` ohne Quelle | **Bestätigt — die einzige Lücke ohne Planplatz.** Das Feld existiert, die Quelle (loop-guard/Progress-Evaluation) ist nirgends als Aufgabe formuliert. | Plan-Schritt für §19 mit Produzent + Gate-Pin; Abnahme: Feld ist nach einem bewerteten Turn im Live-Lauf nicht leer |
| 5 | Codingmon: XP aus Tokens statt Completions | **Bestätigt; Schritt 6.3 ist offen.** Zähler und Spawn-Mechanismus existieren, `award()` hängt an `tickTokens()`. Das Kabel liegt auf beiden Seiten. | Erweiterte Tests in `packages/codingmon/test/`: XP-Kopplung an erfolgreiche Schritte ist nachgewiesen, `xpPerToken` als Quelle entfernt oder begründet |
| 6 | Popup produziert, niemand konsumiert | **Bestätigt — und im Baum dokumentiert** (`profiles/shinon/cordis.patch.yml`: „In diesem Baum liest ihn niemand mehr"). Das Overlay rendert (Naht Profil-Slot = Client-Literal = Host-Default, 6 Overlay-Tests grün); der Client liest Sessions direkt. | Entweder ein In-Tree-Konsument wird gemountet (Test pinnt Empfang auf `shinon/trajectory`) oder der Kanal wird als Out-of-Tree-Probe-API umklassifiziert (Doku + Test); bis dahin keine Ende-zu-Ende-Behauptung über die Trajectory |
| 7 | Live-Verifikation nie passiert | **Bestätigt; Schritt 3.9 ist offen.** Gate grün, Profil lädt, aber der Strom fließt nie. | Ein echter Modell-Turn gegen `agnes/agnes-3.0-flash` mit Protokoll (Boot, Urteil, Widerruf, Host-Ende, Neustart), ohne Schlüsselwert im Text, Protokoll unter `docs/probes/` |

**Keine Aktivierungsänderung in diesem Durchgang:** `key-router` und `popup` bleiben aktiv, `shinon-forge` und `task-router` bleiben inaktiv. Ob „Kernfunktion, Sicherheitsvertrag und Tests vollständig" für Router und Popup erfüllt ist, ist nach obiger Tabelle **teilweise** wahr (Code + Tests ja, Live-Nachweis nein) — ein Rückbau oder eine Fertigerklärung wäre eine Betreiberentscheidung, kein Bot-Urteil. Die Tabelle hält fest, was dafür noch zu messen ist.

## 4. Der eine Satz für die Übergabe

Der gepushte Stand `bf003a2` ist im Remote-Lauf `38474747771` grün **inklusive** `Verdikt (fail-closed)`; die Branch-Regel für `main` ist exakt beschrieben, aber mangels Admin-Recht nicht gesetzt (Blocker-Befehl oben); und die sieben Lücken haben je einen Befund am Baum und eine Abnahme mit Ort — drei davon waren bereits als offen verzeichnet (3.9, 6.3, 429-Rotation), zwei sind entschieden-offen mit Kette (Task-Router→H5, `shinon-forge`→Vertrag), eine braucht einen neuen Planplatz (§19), eine eine Umklassifizierung oder einen Konsumenten (Trajectory).
