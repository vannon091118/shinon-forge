# Narrative/Relationship — unbelegte Ableitungen entfernt (C3)

> **Status:** current — Vorher/Nachher der semantischen Ableitung, jede Zeile mit Test. **Stand:** 2026-10-17
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

`authority: NONE` bleibt: die Narrative ist Interpretation, nie Autorität. Geändert
hat sich nur, **woraus** sie ihre semantischen Felder ableitet — und dass sie es
unterlässt, wo es keine Evidenz gibt.

## 1. Vorher / Nachher

| Ableitung | Vorher | Nachher |
|---|---|---|
| Beziehungsstufe | `djb2(pair + '+') % 100` plus `historyLength * 2`, über Schwellen auf `fresh_pair`/`established_duo`/`trusted_team` | nur eine **explizite Transition** aus `rules.relationshipTransitions` (Event, Payload-Feld, Wert, von/nach, Grund, Evidenz); ohne Treffer bleibt die Stufe, Evidenz `NONE` |
| Trust/Respect | `0.5`/`0.5` als gesetzte Zahlen, nie aktualisiert | `null` — kein Wert ohne Beleg |
| Mood | Tabelle, aber bei gleichem Event „der nächste aus dem Pool" (Anti-Wiederholung) | Tabelle; **derselbe Ereignistyp ergibt denselben Mood**, mit `mood_evidence` und `mood_event` |
| Arc-Thema | `themes[djb2(prefix) % themes.length]` | `rules.themeByEvent[event]`; unbekanntes Ereignis ⇒ `theme: null`, **kein** Arc |
| Unbekanntes Ereignis | Sequenz, Chronik, Mood blieb (teilweise), Arc/Beziehung wurden weitergeführt | Chronik + Sequenz; **kein** semantisches Feld ändert sich, kein Arc, keine Beziehung |
| Beziehungs-Record | `trust`, `respect`, aber kein Zustand | `state`, `state_reason`, `state_evidence`, `trust: null` |

Ein Hash erzeugt keine Bedeutung mehr: `djb2` ist aus dem Kern entfernt, und das
Gate (`scripts/gate/plugins/narrative.mjs`) führt `djb2` jetzt in
`FORBIDDEN_TOKENS` — ein Wiedereinbau fällt rot auf.

## 2. Regeln als Daten (`rules` v2)

`packages/narrative/assets/narrative-state.json` trägt:

- `moodByEvidence`: Event → `{ mood, reason, evidence }`, Evidenz `EVENT_TYPE`
- `themeByEvent`: Event → Thema (jeder Mood-Event hat eins, sonst Befund)
- `relationshipTransitions`: `relation.updated` mit Payload-Feld `relation`;
  `known|trusted|anchor` hebt `fresh_pair` → `established_duo`, `trusted|anchor`
  hebt `established_duo` → `trusted_team`, Evidenz `EXPLICIT_PAYLOAD`.
  `stranger` erzeugt keine Transition: die drei Zustände treffen keine Aussage
  über Distanz, und ein erfundener Abstieg wäre genauso unbelegt wie der Aufstieg.
- `narrator.byEvent` + `default`: ausdrückliche Zuordnung statt Präfix-Logik

Das Gate prüft fail-closed: unbekannter Event-Typ, Mood außerhalb `moodPool`,
fehlender Grund oder Evidenzlevel, `from`/`to` außerhalb der Zustände, gleicher
Ausgangs- und Zielzustand, doppelte `(event, from)`-Paare und ein Payload-Feld
ohne `EXPLICIT_PAYLOAD` sind je ein Befund.

## 3. Regressionstests

| Test | Datei |
|---|---|
| Derselbe Event ⇒ derselbe Mood; unbekanntes Event ⇒ `NONE`, kein Arc, kein Feldwechsel | `packages/narrative/test/narrative.test.mjs` |
| Beziehung: 20 Events Historie heben **nicht**; `known` hebt einmal; `trusted` hebt weiter; `stranger`/unbekannt/fehlend ändern nichts | ebd. |
| Replay: derselbe Strom ⇒ derselbe Composite; `mood_event`/`relationship_event` genannt | ebd. |
| Vertrag: Evidenzlevel, Themenpflicht, Transition-Grund, Duplikat, Hash-Verbot | `scripts/gate/tests/narrative.test.mjs` |

Persistenz und Berechtigungen sind unverändert: dieselben Felder, derselbe Kanal,
dieselbe `authority: NONE`; `trust`/`respect` sind jetzt `null` statt einer
unbelegten Zahl.
