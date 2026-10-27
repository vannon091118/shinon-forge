import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportTrace } from '../assets/trace-report.js';
import { DECISION_CHANNEL } from '../assets/mode-core.js';

const record = (outcome = 'accepted') => ({ outcome, reasons: outcome === 'accepted' ? [] : ['NO_JSON'], session_id: 'session-a', rawLength: 3, enhancedLength: 4 });

test('disabled tracing does not buffer, broadcast or expose a decision', () => {
  const runtime = { trace: [] };
  let emitted = false;
  reportTrace({ emit: () => { emitted = true; } }, { trace: false }, runtime, record());
  assert.deepEqual(runtime.trace, []);
  assert.equal(emitted, false);
});

test('trace records are bounded and delivered to the decision channel and live listeners', () => {
  const runtime = { trace: Array.from({ length: 20 }, () => ({ outcome: 'accepted' })), sse: new Set() };
  const events = [];
  const writes = [];
  runtime.sse.add({ write: (value) => writes.push(value) });
  reportTrace({ emit: (name, value) => events.push([name, value]) }, { trace: true }, runtime, record('rejected'));
  assert.equal(runtime.trace.length, 20);
  assert.equal(runtime.trace[0].outcome, 'rejected');
  assert.equal(events.length, 1);
  assert.equal(events[0][0], DECISION_CHANNEL);
  assert.equal(events[0][1].outcome, 'rejected');
  assert.match(writes[0], /^data: /);
  assert.equal(JSON.parse(writes[0].slice(6)).length, 20);
});

test('a disconnected listener and a throwing consumer do not break reporting', () => {
  const runtime = { trace: [], sse: new Set([{ write() { throw new Error('closed'); } }]) };
  assert.doesNotThrow(() => reportTrace({ emit() { throw new Error('consumer failed'); } }, { trace: true }, runtime, record()));
  assert.equal(runtime.trace.length, 1);
});
