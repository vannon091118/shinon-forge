---
name: dsh-test-tempo
description: Schnellster Weg zu echtem Signal - welcher Test wann, Skip-Regeln, real entry path, Mutationsbeweis fuer Guards, Stale-Artifact-Falle. Nutzen vor jedem Testlauf, bei roten Checks oder wenn unklar ist, was ein Gruen ueberhaupt beweist. Ergaenzt dsh-dev-workflow (Befehlskarte) und dsh-bug-muster (Bug-Klassen).
---

# Test-Tempo: Signal statt Aktivität

Zeit geht nicht beim Laufen der Tests verloren, sondern beim Wiederholen der
falschen. Regeln aus DSHs Testing-Policy (`docs/testing.md`) und diesem Repo.

## Feedback-Tier: gezielt vor vollständig

| Signal braucht… | Aufruf | Dauer-Ordnung |
|---|---|---|
| Kernlogik/Formel | `node --test packages/codingmon/test/*.test.mjs` | Millisekunden |
| Vertrag/Struktur | `node scripts/dsh-test.mjs` | Sekunden |
| Gate-Logik selbst | `node --test scripts/gate/tests/*.test.mjs` | Sekunden |
| eine Regel beweisen | `node scripts/validate-test.mjs` | Sekunden |
| eine Naht | `node --test packages/codingmon/test/uebergabe.test.mjs` | Sekunden |
| Boot/Composition | `node scripts/dsh-profile-test.mjs` | teuer |
| Distribution | `node scripts/pack-test.mjs` | teuerste |
| alles | `npm test` | nur am Ende |

- Erst der **schnellste Test, der die Hypothese schlagen kann** — nicht `npm test`
  als Erstes. Ein Formelfehler soll vor `pack-test` auffallen.
- **Skip ist nicht grün.** Tests ohne `node_modules`/`dsh`/Keys überspringen
  sichtbar (Grund im Testnamen) — im Bericht steht der Skip-Grund, nie „bestanden".
- Ein gezielter `node --test <datei>` mit `--test-name-pattern` spart Minuten;
  der volle Lauf bleibt die Abnahme, nicht die Entwicklungsschleife.

## Was ein Grün beweist (und was nicht)

1. **„A guard only guards if the regression fails it."** Ein neuer Check ist erst
   ein Guard, wenn er die Regression sieht: Mutation einbauen → Test muss **rot**
   werden → revertieren → grün. Genau so dokumentieren (`docs/probes/`,
   siehe Skill `dsh-beweis-tempo`). Ein Guard ohne diesen Beweis ist Dekoration.
2. **„Test the real entry path."** Handmontierte `ctx.plugin({…})`-Suiten beweisen
   nicht, dass das Plugin **so wie ausgeliefert** lädt — `unwrapExports`,
   `inject`-Verlust und Modul-Auflösung laufen nur im echten Loader/Build
   (Post-Mortem 0001: 178 grüne Tests, 100 % Coverage, tot). Produkt-sichtbare
   Plugins brauchen mind. einen REAL-composition-Test.
3. **„Verify the world, not the self-report."** e2e-Assertions lesen die Welt
   extern nach (Datei neu lesen, Kommando erneut ausführen), nie ein Keyword im
   Output des Agenten — sonst besteht ein schummelnder Agent.
4. **Real-Implementation vor Mock.** Nur teure/nichtdeterministische Grenzen
   mocken (LLM-Adapter, Netz, Uhr); alles dahinter bleibt echt. Ein handgemachter
   Stub beweist, dass die Brücke Bytes bewegt, nicht dass das Werkzeug sich wie
   behauptet verhält.
5. **Coverage ≠ Verhalten.** Eine ungedeckte Zeile ist oft toter Code (den das
   Gate zum Löschen anzeigt), nicht ein fehlender Test. Coverage ist nötig, nie
   hinreichend.

## Repo-Mapping: welcher Test beweist was

| Behauptung | Beweis |
|---|---|
| Kern-Mathematik/Regelwerk | `node --test packages/codingmon/test/*.test.mjs` |
| Client→Host-Naht, Literal-Drift | `packages/codingmon/test/uebergabe.test.mjs` |
| dauerhafter Store gegen echte DSH-Storage | `scripts/gate/tests/codingmon-store.test.mjs` |
| Vertrag/Struktur/Namen | `node scripts/dsh-test.mjs` |
| Regel wird Gate+Build erzwingen | `scripts/validate-test.mjs` (Fixture) |
| Paket lädt isoliert (Distribution) | `node scripts/pack-test.mjs` |
| alle Bundle-Layer resolvieren | `node scripts/dsh-profile-test.mjs` |
| Regressions-Guard | Mutation → rot → revert (Probe!) |

## Stale-Artifact-Falle (kostet die meisten Wiederholungen)

- Bautest/TSX auflösen **Quelle**, nie zufällig ein altes `lib/` — ein stale
  Build befriedigt die Modulauflösung und lässt kaputten Code grün laufen
  (Post-Mortem 0001: der e2e „lief" gegen altes `lib/`). Wenn ein Test um
  Auflösung kreist: prüfen, welche Datei **wirklich** geladen wurde
  (`console.log(import.meta.url)` / Pfad-Assertion), nicht annehmen.
- Upstream-Regel analog: „Test resolution: source plane only" — built Artifacts
  nur explizit konsumieren.
- Nach Restore/Archivierung ist `node_modules` weg: erst installieren, dann
  testen; ein Skip danach ist ein Hinweis, kein Ergebnis.

## HMR/Teardown-Test für jede Registrierung

Upstream-Regel: jede Registry bekommt einen HMR-Safety-Test — den beitragenden
Fiber disposen, Cleanup asserten. In diesem Repo: jede `ctx.effect`/`ctx.on`/
`sp.section`-Registrierung braucht einen Disposer-Weg (Skill
`cordis-architektur`); der schnellste Beweis ist ein Test, der registriert →
disposet → assertet, dass nichts mehr feuert/leaked.

## Temporegeln für Berichte

- Ein Ergebnis heißt „geprüft durch <Befehl>, Exit n, n Tests, n Skips (Grund)".
- Was nicht lief, steht als Limitierung — nie als Pass.
