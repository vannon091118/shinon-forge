# @shinon/narrative — Narrative Engine

> **Status:** current — Paket-Doku Narrative Engine. **Stand:** 2026-10-17
> **Einstieg:** `AGENTS.md` · **Zahlen:** `docs/ZAHLEN.md`

**Stand der Umsetzung:** aktiv im Profil (`shinon-narrative`); der Composite geht
auf `shinon/narrative/state` hinaus und wird von Persona und Veredler gelesen.

**Rolle:** Deterministische Ableitung von Composite, Mood, Arc, Relationship aus Event-Historie  
**Abhängigkeit:** `@shinon/events` (Spine als Event-Quelle)

---

## Architektur

```
REAL EVENT ──▶ @shinon/events ──▶ shinon/event ──▶ Chronicle
                                                        │
                                                        ▼
                                                Arc Tracking
                                                        │
                                                        ▼
                                                Relationship State
                                                        │
                                                        ▼
                                                Composite → Persona
```

**Prinzip:** Narrative ist Interpretation, nie technische Autorität (`authority: NONE`).

---

## Datenmodelle

### NarrativeEvent
```javascript
{
  id: 'evt-20261007-001',
  type: 'session.created' | 'claim.created' | 'gate.passed' | 'tool.completed',
  timestamp: '2026-10-07T...',
  actors: ['shinon', 'user', 'system'],
  context: { sessionId, toolName, verdict }
}
```

### NarrativeArc
```javascript
{
  id: 'arc-001',
  name: 'Übergang vom Framework zur Persona',
  theme: 'identity' | 'verification' | 'creation' | 'conflict' | 'resolution' | 'exploration',
  status: 'active' | 'archived',
  first_event: 'evt-001',
  last_event: 'evt-294',
  span: { start: '2026-10-01', end: null }
}
```

### RelationshipState
```javascript
{
  pair: ['shinon', 'user'],
  history: [{ event: 'evt-001', type: 'conflict' }, ...],
  state: 'established_duo',        // nur aus expliziter Transition
  state_evidence: 'EXPLICIT_PAYLOAD',
  trust: null,       // kein Wert ohne Beleg (nie aus Historie oder Hash)
  respect: null,
  patterns: ['direct', 'challenges-assumptions'],
  commitments: ['verify-before-write'],
  conflicts: [],
  open_threads: ['explain-gate-failure']
}
```

### Composite
```javascript
{
  seq: 294,                    // monotone Sequenz
  mood: 'focused',            // aus rules.moodByEvidence
  mood_evidence: 'EVENT_TYPE',
  mood_event: 'evt-294',
  narrator: 'shinon',         // wer erzählt
  arc_id: 'arc-001',
  arc_events: 15,
  freezeThreshold: 20,
  relationship_state: 'established_duo',
  pair: ['shinon', 'user'],
  domain_resonance: {
    primary: 'verification',
    secondary: 'focused'
  }
}
```

---

## Ableitung (Deterministisch)

### Explizite Regeln (`rules` v2)
```javascript
// Mood: Ereignis → Mood, Grund und Evidenzlevel. Kein Hash, kein Wurf.
const { mood, reason, evidence } = deriveMood(rules.moodByEvidence, prevMood, event.type);

// Thema: Ereignis → Thema. Ein unbekanntes Ereignis trägt kein Thema.
const theme = rules.themeByEvent[event.type]; // undefined ⇒ kein Arc
```

### Mood-Auswahl
```javascript
// Derselbe Ereignistyp ergibt IMMER denselben Mood.
// Die frühere Anti-Wiederholung („nie zweimal derselbe") ist entfernt:
// Abwechslung war keine Evidenz.
```

### Arc-Freeze
```javascript
// Nach N Events wird Arc eingefroren
if (composite.arc_events >= freezeThreshold) {
  arc.status = 'archived';
  createNewArc();
}
```

### Relationship-State
```javascript
// Nur eine ausdrückliche Transition hebt die Stufe — sonst KEINE_EVIDENZ.
// `djb2(pair) % 100` und `historyLength * 2` sind entfernt: beides war
// eine Trust-Aussage aus dem Fehlen von Gegenbelegen.
const { state, evidence } = relationshipState(rules, current, event.type, event.context);
```

---

## Hot/Mid/Cold Memory

| Zone | Inhalt | Zugriff |
|------|--------|---------|
| **HOT** | Letzte N Events (Chronicle) | Schnell, aktuell |
| **MID** | Laufende Arcs / Relationships | Semantisch, offen |
| **COLD** | Archivierte Arcs (Snapshots) | Komprimiert, historisch |

```javascript
// HOT
const hot = chronicle.slice(-config.chronicleLimit);

// MID
const mid = {
  activeArcs: arcs.filter(a => a.status === 'active'),
  relationships: Object.values(relationships)
};

// COLD
const cold = arcs
  .filter(a => a.status === 'archived')
  .map(a => freezeSnapshot(a));
```

---

## Integration mit anderen Plugins

### Mit @shinon/events
Der Spine emittiert Events auf `shinon/event`. Narrative abonniert diesen Kanal und verarbeitet eingehende Envelopes.

### Mit @shinon/persona
Narrative liefert den Composite als Input für den Persona-State. Die Persona liest den Relationship-State und Mood aus dem Composite.

### Mit @shinon/codingmon
Codingmon kann Narrative-Events nutzen, um XP/Battles basierend auf tatsächlichem Context zu steuern (statt nur Token-Zähler).

---

## Config

```yaml
- id: shinon-narrative
  name: '@shinon/narrative'
  config:
    eventsChannel: 'shinon/event'   # Spine-Output
    chronicleLimit: 50              # Hot-Memory-Größe
    freezeThreshold: 20             # Arc-Freeze nach N Events
    relationshipWindow: 20          # Historie für Relationship
```

---

## Gateway-Regeln

| Regel | Status |
|-------|--------|
| Deterministische Ableitung | ✅ |
| Explizite Regeln (`rules` v2, Evidenzlevel) | ✅ |
| Unbekannte Events ändern kein semantisches Feld | ✅ |
| Monotone Sequenz | ✅ |
| Authority NONE | ✅ |
| Keine autonomen Aktionen | ✅ |
| Keine Modellaufrufe | ✅ |
| Keine Schreibzugriffe | ✅ |

---

## TODO

- [ ] Slot-Registrierung im Client (Dashboard/Panel)
- [ ] Persistenz (SQLite/JSON) für Cold-Memory
- [ ] Integration mit Persona-State (reading)
- [ ] Deterministische Arc-ID (keine Zeit-basierten IDs)
- [ ] Tests für deriveComposite()
- [ ] Gate-Plugin für Narrative

---

*Erstellt: 2026-10-07*  
*Quelle: SyxCraft Commit Layer, DOKI (Systemanalyse im Dev-Tagebuch)*
