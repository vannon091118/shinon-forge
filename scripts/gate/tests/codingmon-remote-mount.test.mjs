#!/usr/bin/env node
/**
 * codingmon-remote-mount.test.mjs — die VERDRAHTUNG des Begleiter-Beitrags.
 *
 * WARUM ES DIESEN TEST GIBT: `@shinon/codingmon` bietet seinen Dienst auf dem
 * Host an, und der Client hatte einen Absender — aber niemand mountete den
 * Beitrag, weil der Browser Remotes aus einer KOMPILIERTEN Liste einhaengt
 * (`@deepseek-ai/dsh-api-remotes`, 25 Eintraege) und dieses Paket nicht darauf
 * steht. Der Stand ging deshalb nie ueber die Leitung. Seit der Verdrahtung
 * mountet das Bundle seinen Beitrag selbst; dieser Test haelt das fest — OHNE
 * die Zeile in `client.js` ist er rot.
 *
 * Er braucht keine DSH-Bausteine: das Bundle wird ueber `__ModuleLoader__`
 * geladen (wie im Browser) und der Client-Context ist eine Fassade, die genau
 * die drei Dinge traegt, die der Code anfasst — `slots`, `inject` und `remote`.
 * Geprueft wird die FORM des Beitrags gegen `assets/uebergabe.js`: die eine
 * Quelle der Namen, damit das Literal im Bundle nicht still driftet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as uebergabe from '../../../packages/codingmon/assets/uebergabe.js';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';

const { registration } = loadClientBundle('codingmon');
const plugin = registration.factory(requireStub());

/**
 * Was ueber die vm-Grenze kommt, hat fremde Prototypen (der Bundle-Kontext hat
 * ein eigenes `Array`); verglichen wird der INHALT nach einer Serialisierung —
 * genau so, wie der Carrier ihn spaeter transportiert.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Die projizierte Form, die beide Seiten teilen muessen (ohne Codec-Fabriken). */
const projection = (contribution) => ({
  package: contribution.package,
  descriptors: contribution.descriptors.map((descriptor) => ({
    id: descriptor.id,
    service: descriptor.service,
    namespace: descriptor.namespace,
    method: descriptor.method,
    invocation: descriptor.invocation,
    parameters: descriptor.parameters.map((parameter) => ({
      name: parameter.name,
      wire: parameter.wire,
      source: parameter.source,
      codec: { mode: parameter.codec.mode, typeSymbol: parameter.codec.typeSymbol },
    })),
    result: { mode: descriptor.result.mode, typeSymbol: descriptor.result.typeSymbol },
  })),
});

/** Eine Client-Fassade; `remote` ist optional, weil das Bundle ohne ihn leben muss. */
function facade({ remote, mounted = [], keys = [], alreadyMounted = undefined } = {}) {
  const child = {
    remote,
    get: (name) => {
      if (name === 'remote') return remote;
      return alreadyMounted !== undefined && name === `remote.${uebergabe.UEBERGABE_NAMESPACE}` ? alreadyMounted : undefined;
    },
  };
  return {
    slots: { inject: (_key, callback) => callback(), register: () => () => {} },
    effect: () => () => {},
    get: () => undefined,
    inject: (list, callback) => { keys.push(list); callback(child); },
    mounted,
  };
}

/** Der Remote-Dienst, wie ihn `api-gateway` bereitstellt — nur `$mount`. */
const remoteStub = (mounted) => ({ $mount: async (contribution) => { mounted.push(contribution); return async () => {}; } });

test('das Bundle mountet seinen Beitrag, sobald `remote` da ist', async () => {
  const mounted = [];
  const keys = [];
  plugin.apply(facade({ remote: remoteStub(mounted), mounted, keys }));
  await Promise.resolve();
  assert.deepEqual(plain(keys), [['remote']], 'der Beitrag wartet auf genau den Remote-Dienst');
  assert.equal(mounted.length, 1, 'ohne diese Zeile bleibt der Beitrag ungemountet — der Stand ginge nie ueber die Leitung');
});

test('der gemountete Beitrag nennt dieselbe Form wie `assets/uebergabe.js`', async () => {
  const mounted = [];
  plugin.apply(facade({ remote: remoteStub(mounted), mounted }));
  await Promise.resolve();
  assert.deepEqual(plain(projection(mounted[0])), plain(projection(uebergabe.REMOTE_CONTRIBUTION)), 'Client-Literal und Quelle driften');
});

test('jeder Parameter traegt einen strengen Codec mit Fabrik (Registry- und Gateway-Regel)', async () => {
  const mounted = [];
  plugin.apply(facade({ remote: remoteStub(mounted), mounted }));
  await Promise.resolve();
  const [write] = mounted[0].descriptors;
  assert.equal(write.parameters.length, 1, 'writeSnapshot hat genau einen Parameter');
  for (const codec of [write.parameters[0].codec, write.result]) {
    assert.equal(codec.mode, 'strict', 'das Client-Gateway verlangt strict fuer Eingaben');
    assert.equal(typeof codec.create, 'function', 'die Typert-Registry verlangt eine create()-Fabrik');
  }
});

test('ein zweiter Rueckruf desselben Dienstes mountet nicht doppelt', async () => {
  // Ein Cordis-`inject`-Rueckruf kann mehrfach feuern (Dienstwechsel); `$mount` ist
  // asynchron, der Namensraum existiert also noch nicht. Ohne eigenen Zustand war
  // der zweite Mount eine Absage des Gateways ("already mounted").
  const mounted = [];
  const remote = remoteStub(mounted);
  const child = { get: (name) => (name === 'remote' ? remote : undefined) };
  plugin.apply({
    slots: { inject: (_key, callback) => callback(), register: () => () => {} },
    effect: () => () => {},
    inject: (_list, callback) => { callback(child); callback(child); },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mounted.length, 1, 'zwei Rueckrufe, ein Beitrag');
});

test('ein bereits gemounteter Namensraum wird nicht ein zweites Mal einghaengt', async () => {
  const mounted = [];
  plugin.apply(facade({ remote: remoteStub(mounted), mounted, alreadyMounted: { [uebergabe.UEBERGABE_METHOD]: async () => ({ ok: true }) } }));
  await Promise.resolve();
  assert.equal(mounted.length, 0, 'eine Composition, die den Beitrag schon kennt, gewinnt');
});

test('ohne Remote-Dienst aktiviert das Bundle weiter und wirft nicht', () => {
  assert.doesNotThrow(() => plugin.apply(facade({ remote: undefined })));
  assert.doesNotThrow(() => plugin.apply({ slots: { inject: (_k, cb) => cb(), register: () => () => {} }, effect: () => () => {} }));
});
