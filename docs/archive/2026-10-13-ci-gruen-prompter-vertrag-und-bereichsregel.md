# Handshake — CI grün: Prompter-Vertrag geschlossen, Bereichsregel für neue Branches

> **Archiv:** historischer Stand (verschoben 2026-10-17) — keine aktuelle Quelle; Messzeitpunkt und ursprünglicher Status stehen im Kopf darunter.

> **Status:** historical — Übergabe dieses Durchgangs: warum CI rot war, was die Ursache war, was jetzt grün ist. **Stand:** 2026-10-13
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

Auslöser war ein Wort: „CI ist rot". Gemessen über die öffentliche Runs-API (kein
Admin-Zugang, keine Log-URLs — die brauchen Schreibrecht): der Merge von PR #9
(`bb04eb4`) steht auf **failure**, und der einzige rote Zweig neben dem Verdict
ist **Gate-Tests**. Der Commit-Wächter ist auf `main` grün; auf dem Branch war er
rot. Zwei Ursachen, beide im Baum, beide jetzt geschlossen.

## 1. Die 7 Roten waren Inhaltsdrift, kein Umgebungs-Rot

Die frühere Diagnose („Node v24 statt v22") war falsch — und sie war gefährlich,
weil sie eine Reparatur überflüssig aussehen ließ. Belegt ist das Gegenteil: die
Fehler sind Zusagen gegen Verhalten, und das Verhalten steht auch auf Node 22 so
im Baum (in CI rot auf `main@063a993` wie auf dem Branch).

- **6× `prompter-contract.test.mjs`:** die Eskalation aus 83948d5 hatte die
  Zusagen überholt. Verworfen heißt seitdem „Frage statt stiller Durchreiche"
  (`[Feedback erforderlich]` + Grund). Die Tests sind auf den neuen Vertrag
  gebracht (Abschnitt 7 umbenannt und neu behauptet).
- **Dazu ein echter Implementierungsfehler**, den erst der geschlossene Vertrag
  sichtbar machte: MESSAGE_NOT_FOUND baute die Eskalation, brachte sie aber nie
  an — der Trägervergleich lief über Identität, und genau im Nicht-gefunden-Fall
  schlägt Identität fehl. Dazu legte der Spread ein `messages: undefined`-Feld
  an. Trägerregel jetzt: Identität, sonst letzte menschliche Nachricht der
  Entscheidung (derselbe Begriff wie `readPrompt`), sonst gilt die Entscheidung
  unverändert (`packages/prompter/index.js`, `escalationCarrier`).
- **1× `project-index.test.mjs`:** die Skills-Kante `./assets/index-manager.js`
  aus Zug 6 stand nicht in der pinenden Erwartungsliste — genau der Fall, für
  den der Test verlangt: auffallen, prüfen, benennen. Geprüft (echter Import in
  `packages/prompter/index.js`), benannt.
- Die überholte Proben-Aussage („jede Verletzung lässt die Entscheidung
  unverändert") steht weiter als Messung ihres Zeitpunkts — mit `nachtrag`
  vom 2026-10-13, nicht umgeschrieben (`docs/probes/prompter-one-shot.json`).

## 2. Neuer Branch: Spitze minus Hauptlinie statt voller Historie

Der Commit-Wächter war auf dem Branch rot, weil ein neuer Branch (`before` ist
der Null-SHA) die **volle Historie** prüfte — inklusive aller Commits vor der
Wort-Regel. Jeder neue Branch war damit rot, egal wie sauber seine eigenen
Commits waren; die Schranke war eine Mauer. `scripts/lib/ci-range.mjs` löst
jetzt die Merge-Basis mit `origin/main` und prüft **genau das, was der Branch
hinzufügt** — nicht weniger (die Hauptlinie wurde bei ihrem eigenen Push
gerichtet), nicht mehr. Fehlt die Basis, gilt weiter die volle Historie
(fail-closed). Belegt: eigener Gate-Fall mit Bare-Remote (Exit 0 trotz
Alt-Verstoß in `main`) + Simulation gegen diesen Baum
(`358979d..92a5f66`, 1 Commit, sauber). Regeltext in `docs/COMMIT-REGELN.md`
und `docs/contracts/commit-trailer.json` nachgezogen.

## 3. Was jetzt grün ist (mit Befehl)

| Lauf | Ergebnis |
|---|---|
| `npm test` | **Exit 0** — alle Paketsuiten, statisches Gate 105/0, Fixtures 9/0, Distribution 80/0, Profiltest 3/0 |
| `npm run gate:test` | **466/466, Exit 0** (2 Tests neu: die Bereichs-Regel) |
| `npm run gate:full` | **PASS, Exit 0** — 21 Gates, 0 rot, 1 `NOT_APPLICABLE` |
| Commit-Wächter für den nächsten Branch-Push | **Exit 0** in der Simulation |

## 4. Was bleibt

1. **Der Push selbst ist nicht erfolgt** — dieser Durchgang hatte keinen
   Auftrag dafür. `main` steht inzwischen auf `bb04eb4` (PR #9 ist gemergt);
   der nächste Push dieses Branches läuft gegen die neue Basis. Ob die CI dann
   grün meldet, entscheidet der Lauf dort, nicht dieser Bericht.
2. **Die Branch-Regel in GitHub ist weiter nicht gesetzt** (`docs/CI.md` §2) —
   PR #9 wurde trotz roter CI gemergt. Die Schranke ist gebaut, nicht scharf.
3. `gate:full --branding` weiter nicht gelaufen (braucht Chromium); echte
   429-Rotation weiter nicht gemessen (braucht zwei echte Schlüssel).
