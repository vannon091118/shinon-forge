#!/usr/bin/env node
/**
 * packages/codingmon/test/animation.test.mjs — die Rendering-Regel als Zusage.
 *
 * EINZELTEST: kein Browser, kein React, kein DSH. Die Regel aus der Review
 * („Panik- und Fluchtanimationen duerfen ausschliesslich `transform` und
 * `opacity` animieren — kein `margin`, `top` oder `left` im Keyframe\") ist eine
 * Eigenschaft des Quelltextes und wird deshalb am Quelltext gehalten, nicht in
 * einem Screenshot. Die Probe ersetzt KEINE Messung im Browser; sie verhindert,
 * dass die Regel still verrottet, sobald eine neue Animation dazukommt.
 *
 * Lauf: `npm run test:codingmon` bzw. `node --test packages/codingmon/test/*.test.mjs`.
 */
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** Eigenschaften, die der Compositor allein bewegen kann. */
const COMPOSITED = new Set(['transform', 'opacity', 'visibility', 'animation-timing-function']);

/** Jeden `@keyframes`-Block ueber die Klammerbilanz ausschneiden. */
function keyframeBlocks(source) {
  const blocks = [];
  let index = source.indexOf('@keyframes');
  while (index !== -1) {
    const open = source.indexOf('{', index);
    assert.notEqual(open, -1, `@keyframes ohne Block bei Zeichen ${index}`);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const name = source.slice(index, open).replace('@keyframes', '').trim();
    blocks.push({ name, body: source.slice(open + 1, end) });
    index = source.indexOf('@keyframes', end);
  }
  return blocks;
}

/** Die animierten Eigenschaften eines Blocks: `from { transform: … }` → transform. */
function animatedProperties(body) {
  const withoutSelectors = body
    .replace(/(^|[\s{}])(from|to|[\d.]+%)\s*(,|\s*\{)/g, '$1 $3')
    .replace(/[{}]/g, '\n');
  const found = new Set();
  // match[1] ist die Zeilengrenze, match[2] der Eigenschaftsname.
  for (const match of withoutSelectors.matchAll(/(^|\n)\s*([a-zA-Z-]+)\s*:/g)) found.add(match[2]);
  return [...found];
}

describe('Die Animationen laufen auf dem Compositor', () => {
  test('es gibt Keyframes, und der Pruefer sieht sie auch', () => {
    const blocks = keyframeBlocks(CLIENT);
    assert.ok(blocks.length > 0, 'ohne Keyframe prueft dieser Test nichts');
    assert.ok(blocks.every((block) => block.name !== ''), 'jeder Keyframe hat einen Namen');
  });

  test('kein Keyframe animiert eine Layout-Eigenschaft', () => {
    for (const { name, body } of keyframeBlocks(CLIENT)) {
      for (const property of animatedProperties(body)) {
        assert.ok(COMPOSITED.has(property), `${name}: "${property}" ist keine Compositor-Eigenschaft`);
      }
    }
  });

  test('reduzierte Bewegung schaltet die Animation ab statt sie zu beschleunigen', () => {
    assert.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(CLIENT), 'der Schalter fehlt');
    assert.ok(/animation:\s*none/.test(CLIENT), 'die Animation wird dort nicht abgeschaltet');
  });
});
