/**
 * @shinon/prompter — capability-map.test.mjs
 *
 * Der Kern der Fähigkeitskarte, ohne DSH und ohne node_modules: Zuordnung,
 * Genau-ein-Eigentümer, Aufgabenbrief. Die Baum-Prüfung (existiert der
 * Eigentümer, trägt er die Naht?) macht der Gate-Test — hier wird die Karte
 * gegen sich selbst geprüft.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as capabilityMap from '../assets/capability-map.js';
import {
  CAPABILITIES_CONTRACT,
  MAX_BRIEF_CHARS,
  briefRecord,
  capabilityIssues,
  containsTerm,
  matchCapability,
  renderTaskBrief,
  taskBrief,
} from '../assets/capability-map.js';

const MAP = JSON.parse(readFileSync(new URL('../assets/capabilities.json', import.meta.url), 'utf8'));

function cap(id, terms, extra = {}) {
  return {
    contract: CAPABILITIES_CONTRACT,
    id,
    frage: `Frage zu ${id}?`,
    owner: 'prompter',
    terms,
    notAnswers: ['nicht zuständig'],
    evidence: ['packages/prompter/index.js'],
    seam: null,
    ...extra,
  };
}

test('die ausgelieferte Karte ist gültig', () => {
  assert.deepEqual(capabilityIssues(MAP), []);
  assert.ok(MAP.capabilities.length >= 20, `nur ${MAP.capabilities.length} Fähigkeiten`);
});

test('jede kanonische Frage findet ihren eigenen Eigentümer', () => {
  for (const capability of MAP.capabilities) {
    const found = matchCapability(capability.frage, MAP);
    assert.equal(found.ok, true, `${capability.id}: ${found.reason ?? ''}`);
    assert.equal(found.capability.id, capability.id, `${capability.frage} landete bei ${found.capability.id}`);
  }
});

test('die Zuordnung ist reihenfolge-unabhängig', () => {
  const reversed = { ...MAP, capabilities: [...MAP.capabilities].reverse() };
  for (const capability of MAP.capabilities) {
    assert.equal(matchCapability(capability.frage, reversed).capability.id, capability.id);
  }
});

test('kein Treffer, wenn kein Begriff vorkommt', () => {
  assert.deepEqual(matchCapability('', MAP), { ok: false, reason: 'KEIN_TREFFER' });
  assert.deepEqual(matchCapability('   ', MAP), { ok: false, reason: 'KEIN_TREFFER' });
  const miss = matchCapability('Wie backe ich ein Brot mit Sauerteig?', MAP);
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, 'KEIN_TREFFER');
});

test('Großschreibung entscheidet nicht', () => {
  const found = matchCapability('WELCHE PROVENIENZ DER AUSSAGE HAT DER BLOCK?', MAP);
  assert.equal(found.ok, true);
  assert.equal(found.capability.id, 'prompt-herkunft');
});

test('Gleichstand wird nicht geraten', () => {
  const tie = {
    contract: CAPABILITIES_CONTRACT,
    capabilities: [cap('eins', ['alpha']), cap('zwei', ['beta'])],
  };
  const found = matchCapability('alpha und beta', tie);
  assert.equal(found.ok, false);
  assert.equal(found.reason, 'MEHRDEUTIG');
  assert.deepEqual(found.candidates, ['eins', 'zwei']);
});

test('Begriffe treffen nur als ganzes Wort', () => {
  assert.equal(containsTerm('wo lebt das pet?', 'pet'), true);
  assert.equal(containsTerm('competition', 'pet'), false);
  assert.equal(containsTerm('kontrolle', 'ton'), false);
  assert.equal(containsTerm('markierungen begrenzen', 'marke'), false);
  assert.equal(containsTerm('markierungen begrenzen', 'markierung'), false);
  assert.equal(containsTerm('markierung begrenzen', 'markierung'), true);
  assert.equal(containsTerm('markierungen begrenzen', 'markierungen'), true);
  assert.equal(containsTerm('identität und review', 'identität'), true);
  assert.equal(containsTerm('', 'pet'), false);
  assert.equal(containsTerm('pet', ''), false);
});

test('doppelte Frage, doppelter Begriff, doppelte id sind Befunde', () => {
  const duplicateQuestion = capabilityIssues({
    contract: CAPABILITIES_CONTRACT,
    capabilities: [cap('a', ['alpha']), cap('b', ['beta'], { frage: 'frage zu A?' })],
  });
  assert.ok(duplicateQuestion.some((issue) => issue.includes('frage doppelt')), duplicateQuestion.join(' | '));

  const duplicateTerm = capabilityIssues({
    contract: CAPABILITIES_CONTRACT,
    capabilities: [cap('a', ['alpha', 'shared']), cap('b', ['shared'])],
  });
  assert.ok(duplicateTerm.some((issue) => issue.includes('gehört schon a')), duplicateTerm.join(' | '));

  const duplicateId = capabilityIssues({
    contract: CAPABILITIES_CONTRACT,
    capabilities: [cap('a', ['alpha']), cap('a', ['beta'])],
  });
  assert.ok(duplicateId.some((issue) => issue.includes('id doppelt')), duplicateId.join(' | '));
});

test('Formfehler werden benannt, nicht stillschweigend hingenommen', () => {
  const issues = capabilityIssues({
    contract: 'shinon.irgendwas/v9',
    maxBriefChars: 10,
    capabilities: [cap('a', ['x'], {
      owner: 'Kein Paket',
      notAnswers: [],
      evidence: ['/etc/passwd'],
      seam: { kind: 'zauber', name: '' },
    })],
  });
  const joined = issues.join(' | ');
  assert.ok(joined.includes('contract'), joined);
  assert.ok(joined.includes('maxBriefChars'), joined);
  assert.ok(joined.includes('zu kurz'), joined);
  assert.ok(joined.includes('owner'), joined);
  assert.ok(joined.includes('notAnswers'), joined);
  assert.ok(joined.includes('Beleg'), joined);
  assert.ok(joined.includes('seam.kind'), joined);
  assert.ok(joined.includes('seam.name'), joined);
});

test('eine leere Karte ist ungültig', () => {
  assert.deepEqual(capabilityIssues({ contract: CAPABILITIES_CONTRACT, capabilities: [] }), [
    'Karte: capabilities fehlt oder ist leer',
  ]);
  assert.deepEqual(capabilityIssues(null), ['Karte: kein Objekt']);
});

test('der Brief nennt Frage, Ort, Fähigkeit, Grenze und Beleg', () => {
  const byId = new Map(MAP.capabilities.map((entry) => [entry.id, entry]));
  for (const id of ['markierungen-grenzen', 'pet-und-begleiter']) {
    const capability = byId.get(id);
    assert.ok(capability, id);
    const brief = taskBrief(capability);
    const rendered = renderTaskBrief(brief);
    assert.equal(rendered.ok, true, `${id}: ${rendered.reason}`);
    assert.ok(rendered.chars <= MAX_BRIEF_CHARS, `${id}: ${rendered.chars} > ${MAX_BRIEF_CHARS}`);
    for (const label of ['Frage:', 'Ort:', 'Fähigkeit:', 'Grenze:', 'Beleg:']) {
      assert.ok(rendered.text.includes(label), `${id} ohne ${label}`);
    }
    assert.ok(rendered.text.includes(capability.frage), `${id} ohne seine Frage`);
    assert.ok(rendered.text.includes(`@shinon/${capability.owner}`), `${id} ohne Eigentümer`);
    assert.equal(brief.evidence.class, 'DERIVED');
    assert.equal(brief.evidence.pointer, CAPABILITIES_CONTRACT);
  }
});

test('die Fähigkeit benennt die Nahtform', () => {
  const byId = new Map(MAP.capabilities.map((entry) => [entry.id, entry]));
  assert.ok(taskBrief(byId.get('markierungen-grenzen')).ability.includes('Global __DSH_MARKERS_CONFIG__'));
  assert.equal(taskBrief(byId.get('markierungen-grenzen')).ability.includes('('), false);
  assert.ok(taskBrief(byId.get('pet-und-begleiter')).ability.includes('Dienst shinon_codingmon_store'));
  assert.ok(taskBrief(byId.get('pet-und-begleiter')).ability.includes('shinon.codingmon/store-v1'));
  assert.equal(taskBrief(byId.get('pet-und-begleiter')).ability.endsWith(', gelesen'), false);
  assert.ok(taskBrief(byId.get('prompt-veredeln')).ability.includes('Vertrag shinon.prompter/result-v1'));
  assert.ok(taskBrief(byId.get('mobile-oberflaeche')).ability.includes('kein Dienst'));
  assert.equal(taskBrief(byId.get('mobile-oberflaeche')).ability.includes('null'), false);
});

test('der Brief trägt den Arbeitsbereich, aber keine Erfindung', () => {
  const capability = MAP.capabilities[0];
  assert.equal(taskBrief(capability).workspace, null);
  assert.equal(taskBrief(capability, { workspace: '/tmp/projekt' }).workspace, '/tmp/projekt');
  assert.equal(taskBrief(capability, { workspace: '' }).workspace, null);
  assert.equal(taskBrief(null).id, '');
  assert.deepEqual(taskBrief(null).where, []);
});

test('über der Grenze wird nicht gekürzt, sondern verweigert', () => {
  const capability = MAP.capabilities[0];
  const brief = taskBrief(capability);
  assert.deepEqual(renderTaskBrief(brief, { maxChars: 60 }), {
    ok: false,
    reason: 'BRIEF_ZU_LANG',
    chars: renderTaskBrief(brief).chars,
    maxChars: 60,
  });
  assert.equal(renderTaskBrief(brief, { maxChars: 60 }).chars > 60, true);
});

test('der Brief bleibt Metadaten — es gibt keinen Prompt-Appender', () => {
  // Die Trennung ist die Zusage: der Veredler ersetzt den Nutzertext, der Brief
  // geht als eigener Runtime-Context-Block daneben. Ein Appender würde beides
  // wieder mischen — deshalb existiert keiner.
  assert.equal('appendTaskBrief' in capabilityMap, false, 'der Prompt-Appender ist zurück');
  const rendered = renderTaskBrief(taskBrief(MAP.capabilities[0]));
  assert.equal(rendered.ok, true);
  assert.ok(rendered.text.startsWith('<task_brief'), 'der Block existiert als Daten');
});

test('die Spur nennt Adresse und Länge, nicht den Text', () => {
  const capability = MAP.capabilities[0];
  const rendered = renderTaskBrief(taskBrief(capability));
  const record = briefRecord(capability, rendered);
  assert.deepEqual(Object.keys(record).sort(), ['chars', 'contract', 'id', 'owner']);
  assert.equal(record.chars, rendered.chars);
  assert.equal(record.owner, capability.owner);
  assert.equal(JSON.stringify(record).includes('<task_brief'), false);
});
