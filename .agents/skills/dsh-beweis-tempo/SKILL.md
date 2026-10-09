---
name: dsh-beweis-tempo
description: Beweise einmal fuehren statt doppelt verifizieren - Proben-Praxis (Docs/probes JSON: Claim/Targets/Expect/Result/Verdict/Evidence), Mutationsprobe, Abnahmetest, Statusklassen, Commit-Schnellregeln. Nutzen wenn eine Behauptung gerade geprueft wurde oder eine Aenderung Nachweise braucht.
---

# Beweis-Tempo: was heute geprüft wird, muss morgen niemand wieder prüfen

Dieses Repo hält Behauptungen als **Proben** fest (`Docs/probes/*.json`) — mit
Beleg statt Prosa. Wer eine Prüfung einmal macht, schreibt sie auf: der nächste
Lauf (anderer Agent, anderer Tag) liest statt zu forschen.

## Proben-Format (`Docs/probes/<thema>.json`)

Datei ist eine Liste von Proben (oder ein einzelnes Objekt wie
`brand-render.json`). Felder je Probe:

| Feld | Inhalt |
|---|---|
| `id` | slugs, stabil (`goal-integration-api-verifiziert`) |
| `claim` | die prüfbare Behauptung (ein Satz, kein Essay) |
| `targets` | betroffene Dateien/Slots/Verträge |
| `expect` | was bei der Prüfung sichtbar sein muss |
| `result` | `BESTAETIGT` / Ergebnis des Laufs |
| `verdict` | Vokabular: `PLAN` / `RESEARCH` / `ASK` / `WRITE` |
| `evidence` | der Beleg: Befehl + Zahlen + Fundstellen („gelesen in DSH 0.2.0-rc.2, nicht geraten") |
| `evidence_note` | optional: was als Beleg zählt („Namen/Zahlen; keine Inhalte fremder Dateien") |

**Beleg-Regeln** (aus den besten Proben des Repos):
- „Gelesen, nicht geraten": API-Namen mit Fundstelle (Version + Datei), Zahlen
  gegen die installierte Fassung gepinnt (z. B. `defaultMaxGoalRounds 256`).
- Befehl + Exit + Testzahlen nennen: „`node --test …` → 28/28 grün, Exit 0".
- Keine Inhalte fremder Dateien kopieren — Namen, Zahlen, Verhalten.
- Ein Test, der ohne den Beleg grün bleibt, ist kein Beleg (siehe
  `dsh-test-tempo`: Guard braucht Mutationsbeweis).

## Mutationsprobe + Abnahmetest (das schnellste Doppel)

Muster aus `Docs/probes/prompter-modi.json`:

1. **Abnahmetest** festschreiben: der feste Befehl, der die Behauptung prüft
   (z. B. `node --test scripts/gate/tests/prompter-contract.test.mjs` → 28/28).
2. **Mutationsprobe**: die Regel gezielt brechen (Op aus Liste entfernen) →
   **genau ein Test wird rot** → wiederherstellen → alles grün.
   Das macht den Test zur Regel und nicht zur Dekoration — und dokumentiert in
   einem Satz, WARUM der Test existiert.

Beides gehört in dieselbe Probe-Zeile wie der Feature-Nachweis. Zusammen mit
`scripts/validate-test.mjs` (je Regel: Gate **und** Build werden rot) entsteht
so eine Nachweiskette, die niemand mehr neu aufbauen muss.

## Status ehrlich führen

- README-Statusklassen: *Planned* → *Experimental* → *Verified*. Ein Status ist
  erst „Verified", wenn die Probe den Ort des Nachweises nennt (Testname/Befehl).
- Grenzen in der Probe mitführen, nicht verschweigen (Muster
  `goal-integration-dienst-kommt-spaeter`: der Messzeitpunkt war falsch — die
  Probe sagt es).
- Was offline/nicht prüfbar war, steht als Limitierung im Bericht.

## Commit-Schnellregeln (fail-closed, kostet sonst Nacharbeit)

- Jede Message endet mit dem Vannon-Trailer
  (`created by VANNON — Volatile Agent Needing No Other Nonsense, Never Overly Nice, Never Average Vibe`).
- Verboten: AI-Footer (`Generated with Codebuff 🤖`, `Co-Authored-By: …`),
  `powered by …`, Emoji-Signaturen, `co-authored-by:` überhaupt.
- Vor dem Absenden: `npm run commit:guard -- --last 1` — 1 Sekunde, rettet den
  erzwungenen Nacharbeit-Zyklus. Quelle der Muster: `scripts/lib/commit-text.mjs`.
- Proben + Test + Code im SELBEN Commit — ein Nachweis, der woanders liegt, wird
  nicht gelesen.

## Tempo-Regel

Eine neue Erkenntnis kostet einmal die Prüfung. Ohne Probe kostet sie bei jedem
folgenden Mal die Recherche — und Recherche ohne Beleg ist nur eine besser
formulierte Vermutung.
