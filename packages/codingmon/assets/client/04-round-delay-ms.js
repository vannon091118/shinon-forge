    /**
     * Die Dauer, mit der dieser Client rechnet. Sie ist ein SPIEGEL des
     * Vertragswerts: der Host liest die effektive Zahl aus der Profil-Ebene,
     * und die kann der Browser nicht lesen. Eine Abweichung waere still —
     * deshalb steht der Spiegel hier sichtbar an genau einer Stelle.
     */
    const roundDelayMs = PACING.delayMs;

    // ── Encounter-Kern (S5) — EINE Quelle: assets/encounter.js ───────────────
    // Das Bundle ist selbststaendig und kann `assets/` nicht importieren; der
    // Kern wird deshalb WOERTLICH eingebettet (Kommentare gestrichen), nicht
    // nachgebaut. Schreiben: `node scripts/assets/build-encounter-client.mjs`,
    // pruefen: derselbe Aufruf mit `--check` — der Test
    // `test/encounter-client.test.mjs` vergleicht Block und Verhalten.
    // >>> generated-encounter-core — source: assets/encounter.js
    const ENCOUNTER_CORE = (() => {
      const ENCOUNTER_CONTRACT = 'shinon.encounter/event-v1';

      const ENCOUNTER_STATES = Object.freeze([
        'closed',
        'preflight',
        'running',
        'validating',
        'completed',
        'rejected',
        'aborted',
        'recoverable-error',
        'compact',
      ]);

      const ENCOUNTER_TERMINAL_STATES = Object.freeze([
        'completed',
        'rejected',
        'aborted',
        'recoverable-error',
      ]);

      const ENCOUNTER_EVENT_MEMORY = 64;

      const ENCOUNTER_SOURCE_KINDS = Object.freeze(['spine', 'internal', 'unavailable']);

      const isAllowedValue = (value) => value === null
        || typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
        || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));

      const registry = {};
      const define = (type, definition) => {
        registry[type] = Object.freeze(definition);
      };

      define('encounter.turn.started', {
        from: ['closed'],
        to: 'preflight',
        source: { kind: 'spine', ref: 'turn.start', owner: '@shinon/events' },
        payload: [],
        apply: (state) => state,
      });

      define('encounter.task.classified', {
        from: ['preflight'],
        to: null,
        source: { kind: 'internal', ref: 'intent-policy', owner: '@shinon/task-router' },
        payload: ['taskClass', 'taskLabel'],
        apply: (state, payload) => ({
          ...state,
          task: { taskClass: payload.taskClass ?? null, taskLabel: payload.taskLabel ?? null },
        }),
      });

      define('encounter.index.progress', {
        from: ['preflight', 'running'],
        to: null,
        source: { kind: 'internal', ref: 'index-core', owner: '@shinon/project-index' },
        payload: ['phase', 'count'],
        apply: (state, payload) => ({
          ...state,
          index: {
            phase: typeof payload.phase === 'string' ? payload.phase : state.index.phase,
            count: Number.isSafeInteger(payload.count) ? payload.count : state.index.count,
          },
        }),
      });

      define('encounter.fact.validated', {
        from: ['preflight', 'running'],
        to: null,
        source: { kind: 'internal', ref: 'facts-snapshot', owner: '@shinon/project-index' },
        payload: ['snapshotId', 'valid', 'untrusted', 'unknown'],
        apply: (state, payload) => ({
          ...state,
          facts: {
            snapshotId: typeof payload.snapshotId === 'string' ? payload.snapshotId : state.facts.snapshotId,
            valid: Number.isSafeInteger(payload.valid) ? payload.valid : state.facts.valid,
            untrusted: Number.isSafeInteger(payload.untrusted) ? payload.untrusted : state.facts.untrusted,
            unknown: Number.isSafeInteger(payload.unknown) ? payload.unknown : state.facts.unknown,
          },
        }),
      });

      define('encounter.block.selected', {
        from: ['preflight'],
        to: null,
        source: { kind: 'internal', ref: 'block-select', owner: '@shinon/prompter' },
        payload: ['blocks'],
        apply: (state, payload) => ({
          ...state,
          preflight: { ...state.preflight, blocks: Array.isArray(payload.blocks) ? payload.blocks.slice() : state.preflight.blocks },
        }),
      });

      define('encounter.preflight.ready', {
        from: ['preflight'],
        to: null,
        source: { kind: 'internal', ref: 'pre-step', owner: '@shinon/prompter' },
        payload: [],
        apply: (state) => ({ ...state, preflight: { ...state.preflight, ready: true } }),
      });

      define('encounter.route.selected', {
        from: ['preflight', 'running'],
        to: null,
        source: { kind: 'spine', ref: 'request.header', owner: '@shinon/events' },
        payload: ['provider', 'model'],
        apply: (state, payload) => ({
          ...state,
          preflight: {
            ...state.preflight,
            route: {
              provider: typeof payload.provider === 'string' ? payload.provider : null,
              model: typeof payload.model === 'string' ? payload.model : null,
            },
          },
        }),
      });

      define('encounter.run.started', {
        from: ['preflight'],
        to: 'running',
        source: { kind: 'spine', ref: 'step.start', owner: '@shinon/events' },
        payload: ['step'],
        apply: (state, payload) => ({
          ...state,
          step: Number.isSafeInteger(payload.step) ? payload.step : state.step,
        }),
      });

      define('encounter.tool.started', {
        from: ['running'],
        to: null,
        source: { kind: 'spine', ref: 'tool.requested', owner: '@shinon/events' },
        payload: ['callId', 'name'],
        apply: (state, payload) => ({
          ...state,
          tools: {
            open: state.tools.open + 1,
            calls: state.tools.calls + 1,
            last: typeof payload.name === 'string' ? payload.name : state.tools.last,
          },
        }),
      });

      define('encounter.tool.completed', {
        from: ['running'],
        to: null,
        source: { kind: 'spine', ref: 'tool.completed', owner: '@shinon/events' },
        payload: ['callId', 'ok'],
        apply: (state) => ({
          ...state,
          tools: { ...state.tools, open: Math.max(0, state.tools.open - 1) },
        }),
      });

      define('encounter.key.rotated', {
        from: ['running', 'recoverable-error'],
        to: null,
        source: { kind: 'internal', ref: 'pool-core', owner: '@shinon/key-router' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          keyRotation: {
            count: state.keyRotation.count + 1,
            reason: typeof payload.reason === 'string' ? payload.reason : state.keyRotation.reason,
          },
        }),
      });

      define('encounter.answer.received', {
        from: ['running'],
        to: 'validating',
        source: { kind: 'spine', ref: 'message.completed', owner: '@shinon/events' },
        payload: [],
        apply: (state) => state,
      });

      define('encounter.result-contract.passed', {
        from: ['running', 'validating'],
        to: 'validating',
        source: { kind: 'internal', ref: 'result-contract', owner: '@shinon/prompter' },
        payload: ['contract'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'contract-passed', contract: typeof payload.contract === 'string' ? payload.contract : null, reason: null },
        }),
      });

      define('encounter.result-contract.failed', {
        from: ['running', 'validating'],
        to: 'rejected',
        source: { kind: 'internal', ref: 'result-contract', owner: '@shinon/prompter' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'contract-failed', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
        }),
      });

      define('encounter.abort', {
        from: ['preflight', 'running', 'validating'],
        to: 'aborted',
        source: { kind: 'internal', ref: 'abort-core', owner: '@shinon/prompter' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'aborted', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
        }),
      });

      define('encounter.turn.completed', {
        from: ['running', 'validating'],
        to: 'completed',
        source: { kind: 'spine', ref: 'turn.end', owner: '@shinon/events' },
        payload: ['reason'],
        apply: (state) => ({
          ...state,
          outcome: state.outcome ?? { kind: 'neutral', contract: null, reason: null },
        }),
      });

      define('encounter.turn.failed', {
        from: ['running', 'validating'],
        to: 'recoverable-error',
        source: { kind: 'spine', ref: 'turn.end', owner: '@shinon/events' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'error', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
        }),
      });

      define('encounter.salvage.available', {
        from: ['running', 'validating', 'recoverable-error'],
        to: null,
        source: { kind: 'internal', ref: 'salvage-store', owner: '@shinon/prompter' },
        payload: ['recordId'],
        apply: (state, payload) => ({
          ...state,
          salvage: { recordId: typeof payload.recordId === 'string' ? payload.recordId : null },
        }),
      });

      define('encounter.skill.proposed', {
        from: ['running', 'validating', 'completed'],
        to: null,
        source: { kind: 'internal', ref: 'skill-lifecycle', owner: '@shinon/prompter' },
        payload: ['skillId', 'status'],
        apply: (state, payload) => ({
          ...state,
          skill: {
            skillId: typeof payload.skillId === 'string' ? payload.skillId : null,
            status: 'proposed',
          },
        }),
      });

      define('encounter.receipt.compacted', {
        from: ENCOUNTER_TERMINAL_STATES,
        to: 'compact',
        source: { kind: 'unavailable', ref: 'receipt', owner: '@shinon/popup' },
        payload: [],
        apply: (state) => state,
      });

      const ENCOUNTER_EVENTS = Object.freeze(registry);

      const ENCOUNTER_SOURCE_MAP = Object.freeze(Object.fromEntries(
        Object.entries(ENCOUNTER_EVENTS).map(([type, definition]) => [type, Object.freeze({ ...definition.source })]),
      ));

      const ENCOUNTER_EVENT_TYPES = Object.freeze(Object.keys(ENCOUNTER_EVENTS));

      const stateIssues = (state) => {
        if (state === null || typeof state !== 'object' || Array.isArray(state)) return 'STATE_NOT_OBJECT';
        if (state.contract !== ENCOUNTER_CONTRACT) return 'STATE_CONTRACT';
        if (!ENCOUNTER_STATES.includes(state.status)) return 'STATE_STATUS';
        if (state.lastPhase !== undefined && state.lastPhase !== null
          && !ENCOUNTER_STATES.includes(state.lastPhase)) return 'STATE_LAST_PHASE';
        if (!Array.isArray(state.seen)) return 'STATE_SEEN';
        for (const key of ['preflight', 'facts', 'index', 'tools', 'keyRotation']) {
          if (state[key] === null || typeof state[key] !== 'object' || Array.isArray(state[key])) return `STATE_SHAPE:${key}`;
        }
        if (!Array.isArray(state.preflight.blocks)) return 'STATE_SHAPE:preflight.blocks';
        if (!Number.isSafeInteger(state.applied) || !Number.isSafeInteger(state.step)) return 'STATE_SHAPE:counter';
        return null;
      };

      const eventIssues = (event) => {
        if (event === null || typeof event !== 'object' || Array.isArray(event)) return 'EVENT_NOT_OBJECT';
        if (event.contract !== ENCOUNTER_CONTRACT) return 'EVENT_CONTRACT';
        for (const field of ['eventId', 'type', 'sessionId', 'turnId', 'source']) {
          if (typeof event[field] !== 'string' || event[field].trim() === '') return `EVENT_FIELD:${field}`;
        }
        const definition = ENCOUNTER_EVENTS[event.type];
        if (definition === undefined) return 'UNKNOWN_EVENT_TYPE';
        if (definition.source.owner !== event.source) return `SOURCE_MISMATCH:${event.type}`;
        const payload = event.payload;
        if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) return 'PAYLOAD_NOT_OBJECT';
        for (const key of Object.keys(payload ?? {})) {
          if (!definition.payload.includes(key)) return `PAYLOAD_UNKNOWN_FIELD:${key}`;
          if (!isAllowedValue(payload[key])) return `PAYLOAD_UNSUPPORTED_VALUE:${key}`;
        }
        return null;
      };

      const result = (state, outcome, reason = null) => ({ state, outcome, reason });

      function reduceEncounter(state, event) {
        const brokenState = stateIssues(state);
        if (brokenState !== null) return result(state, 'REJECTED', brokenState);

        const brokenEvent = eventIssues(event);
        if (brokenEvent === 'UNKNOWN_EVENT_TYPE') return result(state, 'IGNORED', brokenEvent);
        if (brokenEvent !== null) return result(state, 'REJECTED', brokenEvent);

        if (state.seen.includes(event.eventId)) return result(state, 'IGNORED', 'DUPLICATE_EVENT');
        if (state.turnId !== null && state.turnId !== event.turnId) return result(state, 'REJECTED', 'FOREIGN_TURN');

        const definition = ENCOUNTER_EVENTS[event.type];
        if (!definition.from.includes(state.status)) return result(state, 'REJECTED', 'INVALID_TRANSITION');

        const nextStatus = definition.to ?? state.status;
        const base = {
          ...state,
          status: nextStatus,
          lastPhase: nextStatus === state.status ? state.lastPhase : state.status,
          turnId: event.turnId,
          sessionId: event.sessionId,
          applied: state.applied + 1,
        };
        const applied = definition.apply(base, event.payload ?? {});
        const seen = [...state.seen, event.eventId];
        return result(
          { ...applied, seen: seen.length > ENCOUNTER_EVENT_MEMORY ? seen.slice(seen.length - ENCOUNTER_EVENT_MEMORY) : seen },
          'APPLIED',
        );
      }

      function createEncounterState() {
        return {
          contract: ENCOUNTER_CONTRACT,
          status: 'closed',
          lastPhase: null,
          turnId: null,
          sessionId: null,
          applied: 0,
          step: 0,
          seen: [],
          task: null,
          preflight: { ready: false, blocks: [], route: null },
          facts: { snapshotId: null, valid: 0, untrusted: 0, unknown: 0 },
          index: { phase: null, count: 0 },
          tools: { calls: 0, open: 0, last: null },
          keyRotation: { count: 0, reason: null },
          salvage: null,
          skill: null,
          outcome: null,
        };
      }

      function foldEncounter(state, events) {
        const journal = [];
        let current = state;
        for (const event of Array.isArray(events) ? events : []) {
          const step = reduceEncounter(current, event);
          journal.push({ type: typeof event?.type === 'string' ? event.type : null, outcome: step.outcome, reason: step.reason });
          current = step.state;
        }
        return { state: current, journal };
      }

      function encounterEvent(type, { eventId, turnId, sessionId, payload, source } = {}) {
        const definition = ENCOUNTER_EVENTS[type];
        if (definition === undefined) throw new Error(`Unbekannter Encounter-Typ: ${type}`);
        return {
          contract: ENCOUNTER_CONTRACT,
          eventId: eventId ?? `${type}#1`,
          type,
          sessionId: sessionId ?? 'session-test',
          turnId: turnId ?? 'turn-test',
          source: source ?? definition.source.owner,
          payload: payload ?? {},
        };
      }
      return Object.freeze({ ENCOUNTER_CONTRACT, ENCOUNTER_STATES, ENCOUNTER_TERMINAL_STATES, ENCOUNTER_EVENT_MEMORY, ENCOUNTER_SOURCE_KINDS, ENCOUNTER_EVENTS, ENCOUNTER_SOURCE_MAP, ENCOUNTER_EVENT_TYPES, createEncounterState, reduceEncounter, foldEncounter, encounterEvent });
    })();
    // Gebunden wird nur, was die Buehne liest — der Kern bleibt vollstaendig.
    const { ENCOUNTER_CONTRACT, ENCOUNTER_EVENTS, ENCOUNTER_EVENT_TYPES, ENCOUNTER_SOURCE_MAP, ENCOUNTER_STATES, ENCOUNTER_TERMINAL_STATES, createEncounterState, reduceEncounter, encounterEvent } = ENCOUNTER_CORE;
    // <<< generated-encounter-core

    // ── 4. LOOT (gewichteter Wurf in Basispunkten) ──────────────────────────
    // >>> generated-codingmon-loot — source: assets/data/codingmon-50.json
    const LOOT_TABLE = [{"id":"schrott","label":"Schrott","weight":8500,"xp":0},{"id":"brauchbar","label":"Brauchbares Teil","weight":1400,"xp":25},{"id":"shiny","label":"Shiny God-Tier","weight":100,"xp":2500}];
    const LOOT_TOTAL = LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
    // <<< generated-codingmon-loot
    // Die aktive Kreatur liefert ihren Bonus in Wurf und sichtbare Quote.
    const rollLoot = (uniform, creature = null) => {
      const table = lootWeightsFor(creature), total = table.reduce((sum, entry) => sum + entry.weight, 0);
      const clamped = Number.isFinite(uniform) ? Math.min(1, Math.max(0, uniform)) : 0, point = Math.min(total - 1, Math.floor(clamped * total));
      let acc = 0;
      for (const entry of table) {
        acc += entry.weight;
        if (point < acc) return entry;
      }
      return table[table.length - 1];
    };
