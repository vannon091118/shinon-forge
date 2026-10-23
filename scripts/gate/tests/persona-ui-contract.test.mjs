import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const host = readFileSync(new URL('../../../packages/persona/index.js', import.meta.url), 'utf8');
// Der Snapshot selbst hat einen eigenen Eigentuemer: der Vertragsname steht im
// Eintrag, die Felder, die er liefert, stehen in der Flaeche.
const surface = readFileSync(new URL('../../../packages/persona/assets/ui-surface.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../../packages/core/client.js', import.meta.url), 'utf8');

function bannerStatus() {
  const source = client.match(/    function bannerStatus\(state\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(source, 'der Consumer bannerStatus ist vorhanden');
  const voiceLabel = (value) => typeof value === 'string' ? value.split(/[.\u2014\n]/)[0].trim() : '';
  return new Function('voiceLabel', `return (${source.trim()});`)(voiceLabel);
}

test('Persona-Produzent und Core-Banner verwenden denselben versionierten UI-Vertrag', () => {
  assert.match(host, /UI_STATE_CONTRACT = 'shinon\.persona-ui\/v1'/);
  assert.match(host, /uiContract: UI_STATE_CONTRACT/);
  assert.match(surface, /contract: names\.uiContract/);
  for (const field of ['state:', 'voice:', 'tone:', 'self:', 'intent:', 'userMood:']) {
    assert.ok(surface.includes(field), `der Host-Snapshot liefert ${field}`);
  }
  assert.match(client, /state\.contract !== 'shinon\.persona-ui\/v1'/);
});

test('Core rendert bekannte Felder und faengt fehlende oder fremde Formate fail-closed ab', () => {
  const render = bannerStatus();
  assert.match(render({ contract: 'shinon.persona-ui/v1', tone: { stance: 'critical' }, voice: 'Ruhig und bereit.', intent: { classification: 'question' }, self: { runs: 3, accepted: 2 } }), /Haltung: critical · Stimme: Ruhig und bereit · Auftrag: question · 2\/3 angenommen/);
  assert.equal(render({ contract: 'shinon.persona-ui/v0', state: { mood: 'idle' } }), 'Unbekanntes Persona-Format');
  assert.equal(render(null), 'Noch kein Zustand gemeldet');
});
