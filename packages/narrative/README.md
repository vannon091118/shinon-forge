# @shinon/narrative — Narrative Engine

> **Status:** current — Paket-Doku Narrative Engine. **Stand:** 2026-10-10
> **Einstieg:** `docs/INDEX.md` · **Zahlen:** `docs/ZAHLEN.md`

**Stand der Umsetzung:** WIP (Wave 3). Das Paket ist gebaut und lädt im
Distributionstest, ist aber **nicht** in `dsh.profile.bundles` aktiviert.

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
  trust: 0.7,        // 0..1
  respect: 0.9,
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
  mood: 'focused',            // Anti-Wiederholung
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

### Seed-Berechnung
```javascript
// Input: Vorgänger-Composite + aktuelles Event
const seed = djb2(`${prevComposite.seq}|${event.id}|${event.timestamp}`);
const rng = new XorShift(seed);
```

### Mood-Auswahl
```javascript
// Wähle aus Pool, nie gleich wie vorher
function selectMood(prevMood, rng) {
  let next;
  do {
    next = MOODS[rng.next() % MOODS.length];
  } while (next === prevMood);
  return next;
}
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
// Aus Historie abgeleitet, nie behauptet
function calculateRelationshipState(pair, historyLength) {
  const score = hash(pair) + (historyLength * 2);
  if (score >= 70) return 'trusted_team';
  if (score >= 40) return 'established_duo';
  return 'fresh_pair';
}
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
| Anti-Wiederholung (Mood) | ✅ |
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
*Quelle: SYSTEM-ANALYSIS.md, SyxCraft Commit Layer, DOKI*
