#!/usr/bin/env node
/**
 * Tests der Vertrags- und Probe-Prüfer (reine Funktionen).
 * Läuft mit `node --test` — kein node_modules, kein Repo-Zustand nötig.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractIssues, GATE_POINTS, STATUS_VALUES } from '../plugins/contracts.mjs';
import { probeIssues, PROBE_RESULTS, VERDICTS } from '../plugins/probe-twin.mjs';

const goodRule = Object.fromEntries(GATE_POINTS.map((p) => [p, 'x']));

test('contracts: gültiger Vertrag hat keine Probleme', () => {
  const c = { name: 'X', status: 'IMPLEMENTED', rules: [goodRule] };
  assert.deepEqual(contractIssues(c, 'x.json'), []);
});

test('contracts: jeder fehlende Gate-Punkt wird gemeldet', () => {
  for (const point of GATE_POINTS) {
    const rule = { ...goodRule };
    delete rule[point];
    const issues = contractIssues({ name: 'X', status: 'STUB', rules: [rule] }, 'x.json');
    assert.equal(issues.length, 1, `fehlender Punkt ${point} nicht gemeldet`);
    assert.ok(issues[0].includes(point));
  }
});

test('contracts: leerer String zählt als fehlend', () => {
  const rule = { ...goodRule, trace: '   ' };
  assert.ok(contractIssues({ name: 'X', status: 'STUB', rules: [rule] }, 'x.json')[0].includes('trace'));
});

test('contracts: ungültiger Status wird abgelehnt', () => {
  const c = { name: 'X', status: 'MAYBE', rules: [goodRule] };
  assert.ok(contractIssues(c, 'x.json').some((i) => i.includes('MAYBE')));
});

test('contracts: alle vier Zustände sind erlaubt', () => {
  for (const status of STATUS_VALUES) {
    const c = { name: 'X', status, rules: [goodRule] };
    assert.deepEqual(contractIssues(c, 'x.json'), [], `${status} abgelehnt`);
  }
});

test('contracts: leere rules sind ein Problem', () => {
  assert.ok(contractIssues({ name: 'X', status: 'STUB', rules: [] }, 'x.json').length > 0);
});

const goodProbe = {
  id: 'p1', claim: 'etwas gilt', targets: ['a.js'], expect: 'exit 0',
  result: 'BESTAETIGT', verdict: 'WRITE',
};

test('probe-twin: gültige Probe hat keine Probleme', () => {
  assert.deepEqual(probeIssues(goodProbe, 'p.json'), []);
});

test('probe-twin: Anti-Vakuum — Probe ohne Ziel', () => {
  const p = { ...goodProbe };
  delete p.targets;
  assert.ok(probeIssues(p, 'p.json')[0].includes('targets'));
});

test('probe-twin: Anti-Vakuum — Probe ohne Erwartung', () => {
  const p = { ...goodProbe, expect: '' };
  assert.ok(probeIssues(p, 'p.json')[0].includes('expect'));
});

test('probe-twin: Probe ohne Behauptung', () => {
  const p = { ...goodProbe, claim: '  ' };
  assert.ok(probeIssues(p, 'p.json')[0].includes('claim'));
});

test('probe-twin: Vokabular wird erzwungen', () => {
  assert.ok(probeIssues({ ...goodProbe, result: 'VIELLEICHT' }, 'p.json')[0].includes('result'));
  assert.ok(probeIssues({ ...goodProbe, verdict: 'NOPE' }, 'p.json')[0].includes('verdict'));
});

test('probe-twin: alle drei Ergebnisse und vier Verdicts sind erlaubt', () => {
  for (const result of PROBE_RESULTS) {
    assert.deepEqual(probeIssues({ ...goodProbe, result }, 'p.json'), [], result);
  }
  for (const verdict of VERDICTS) {
    assert.deepEqual(probeIssues({ ...goodProbe, verdict }, 'p.json'), [], verdict);
  }
});
