import test from 'node:test';
import assert from 'node:assert/strict';
import { statusFromConfig, validRelayUrl } from '../index.js';

test('plugin disabled by default reports no connection or execution', () => {
  const status = statusFromConfig({}, '2026-10-09T12:00:00.000Z');
  assert.equal(status.state, 'disabled');
  assert.equal(status.enabled, false);
  assert.equal(status.relayConfigured, false);
  assert.equal(status.notionOAuthConnected, false);
  assert.equal(status.syncRunning, false);
  assert.equal(status.benchCoordinatorConnected, false);
  assert.equal(status.agentExecutionEnabled, false);
});

test('relay URL validation accepts HTTPS and localhost development URLs only', () => {
  assert.equal(validRelayUrl('https://relay.example.test'), true);
  assert.equal(validRelayUrl('http://localhost:8787'), true);
  assert.equal(validRelayUrl('http://127.0.0.1:8787'), true);
  assert.equal(validRelayUrl('http://relay.example.test'), false);
  assert.equal(validRelayUrl('file:///tmp/relay'), false);
  assert.equal(validRelayUrl('not a URL'), false);
  assert.equal(validRelayUrl(''), false);
});

test('configured relay is never mistaken for a connected gateway', () => {
  const status = statusFromConfig({ enabled: true, relayUrl: 'https://relay.example.test' });
  assert.equal(status.state, 'scaffold_only');
  assert.equal(status.relayConfigured, true);
  assert.equal(status.relayReachability, 'not_checked');
  assert.equal(status.notionOAuthConnected, false);
  assert.equal(status.syncRunning, false);
  assert.equal(status.benchCoordinatorConnected, false);
  assert.equal(status.agentExecutionEnabled, false);
});

test('enabled without a valid relay fails closed', () => {
  const status = statusFromConfig({ enabled: true, relayUrl: 'http://public.example.test' });
  assert.equal(status.state, 'relay_missing');
  assert.equal(status.relayConfigured, false);
  assert.equal(status.agentExecutionEnabled, false);
});