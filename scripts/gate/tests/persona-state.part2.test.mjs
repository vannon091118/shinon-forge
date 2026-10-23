/** Teil 2/2 von persona-state.test.mjs — Fixtures stehen in `persona-state-fixtures.mjs`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fingerprintRoot } from '../../../packages/seams/assets/seams.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import {
  EVENT_TYPES as SPINE_EVENTS,
} from '../plugins/events-spine.mjs';
import {
  PERSONA_EVENT_TYPES,
  STATE_FIELDS,
  stateContractIssues,
  staticIssues,
} from '../plugins/persona.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGE_DIR, REPO_ROOT, ASSET_FILE, contract, clone, loadBundle, bundle, createHost, baseConfig, connect, storeCore, fakeStore, decision, scoringTendency, contextDir, contextFixture, projectSection, foreignProject, withoutEnv, routeRequest, sseRequest } from './persona-state-fixtures.mjs';

test('Ton: mit Ton-Dienst steht die Zeile im Live-Block, ohne ihn nicht', () => {
  const stance = scoringTendency.stances[0].id;
  const service = {
    contract: bundle.SCORING_SERVICE_CONTRACT,
    read: () => ({ stance, tendencies: [{ klasse: 'korrektur', stufe: 'hoch' }], signals: 4, ready: true, reason: null }),
  };

  const withTone = connect({ [bundle.SCORING_SERVICE]: service });
  assert.match(withTone.liveOf(), new RegExp(`Ton: ${contract.tendency.voices[stance].tonalitaet}`));
  withTone.dispose();

  // Ohne Dienst: keine Ton-Zeile — und keine erfundene Haltung.
  const without = connect();
  assert.equal(without.liveOf().includes('Ton:'), false);
  without.dispose();
});
test('Tendenz: ein fremder Dienst unter dem Namen wird gemeldet, nicht gelesen', () => {
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    // Dieser Aufbau laeuft NICHT ueber `connect`, sondern ueber `quiet` mit
    // `keep: ['error']`: geprueft wird, dass die Warnung ankommt — ein Helfer,
    // der genau diesen Kanal stummschaltet, wuerde die Zusage verdecken.
    const host = createHost({ [bundle.SCORING_SERVICE]: { contract: 'shinon.fremd/v1', read: () => ({ stance: 'kritisch' }) } });
    quiet(() => { host.dispose = bundle.apply(host.ctx, baseConfig); }, { keep: ['error'] });
    assert.equal(host.liveOf().includes('Ton:'), false, 'kein fremder Ton im Block');
    assert.ok(errors.some((line) => line.includes('verletzt den Vertrag')), errors.join(' | '));
    host.dispose();
  } finally {
    console.error = realError;
  }
});
test('Projekt-Kontext: ein RELATIVER Pfad wird geladen und steht als Abschnitt im Prompt', () => {
  const file = contextFixture('relativ.md', 'PROJEKT-KONTEXT-RELATIV gilt nur hier\n');
  const host = connect({}, { projectContextPath: relative(REPO_ROOT, file) });

  const section = projectSection(host);
  assert.ok(section, `Abschnitt fehlt (${host.sections.map((entry) => entry.name).join(', ')})`);
  assert.match(section.text, /PROJEKT-KONTEXT-RELATIV/, 'der Dateiinhalt steht im Abschnitt');
  assert.ok(section.order > 10, `der Kontext steht hinter dem Persona-Prefix (order=${section.order})`);
  // Der Kontext ist ein ZUSATZ: die Persona-Abschnitte bleiben daneben stehen.
  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'), 'die Identity bleibt');
  host.dispose();
});
test('Projekt-Kontext: auch ein ABSOLUTER Pfad wird geladen', () => {
  const file = contextFixture('absolut.md', 'PROJEKT-KONTEXT-ABSOLUT\n');
  const host = connect({}, { projectContextPath: file });

  const section = projectSection(host);
  assert.ok(section, 'Abschnitt fehlt');
  assert.match(section.text, /PROJEKT-KONTEXT-ABSOLUT/);
  host.dispose();
});
test('Projekt-Kontext: fehlende oder leere Datei traegt keinen Text bei — und keinen leeren', () => {
  // Der Abschnitt ist seit dem Sitzungs-Scope (2026-10-18) ein GETTER: er wird
  // immer registriert und liefert erst bei der Assembly Text. Die Zusicherung
  // ist deshalb nicht „kein Eintrag", sondern „kein Text" — der echte
  // System-Prompt filtert leere Abschnitte (`renderPrompt`).
  const cases = [
    ['fehlend', relative(REPO_ROOT, join(contextDir, 'gibt-es-nicht.md'))],
    ['leer', relative(process.cwd(), contextFixture('leer.md', '   \n\n'))],
  ];
  for (const [name, path] of cases) {
    const host = connect({}, { projectContextPath: path });
    assert.equal(projectSection(host)?.text ?? '', '', `${name}: kein Text`);
    assert.ok(host.sections.length > 0, `${name}: die uebrigen Abschnitte bleiben stehen`);
    host.dispose();
  }
});
test('Projekt-Kontext: ein leerer Pfad in der Config heisst nicht laden', () => {
  const host = connect({}, { projectContextPath: '' });
  assert.equal(projectSection(host), undefined);
  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'));
  host.dispose();
});
test('Projektscope: ein deklarierter Workspace bekommt die Persona aus seinen eigenen Daten', () => {
  // Trennung 2026-10-23: der deklarierte Bereich spricht — kein Manifest-Check.
  const foreign = foreignProject();
  const host = withoutEnv('SHINON_WORKSPACE_ROOT', () =>
    connect({}, { workspaceRoot: foreign, projectContextPath: '.shinon/project-context.md' }));

  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'), 'Identity im deklarierten Workspace');
  assert.ok(host.handlers.size > 0, 'Events werden im deklarierten Workspace beobachtet');
  assert.equal(projectSection(host)?.text ?? '', '', 'kein Kontext ohne Datei im eigenen Workspace');
});
test('Projektscope: unklarer Boot-Scope traegt KEINEN Text bei — die Sitzung entscheidet', () => {
  // Root Cause 2026-10-18: der Mount brach ohne deklarierten Root komplett ab,
  // damit war die Persona in JEDEM Lauf tot (auch im Shinon-Repo). Der Scope
  // gehoert aber der Sitzung: ohne Sitzung liefert jeder Abschnitt '' — der
  // Prompt bleibt persona-frei, bis ein `agent/pre-step` den cwd liefert.
  const host = withoutEnv('SHINON_WORKSPACE_ROOT', () => connect({}, { workspaceRoot: '' }));

  assert.deepEqual(host.sections.map((entry) => entry.text).filter((text) => text !== ''), [], 'kein Text ohne Scope');
  assert.ok(host.sections.length > 0, 'die Registrierung steht — sie ist leer, nicht abwesend');
  assert.equal(host.handlers.has('agent/pre-step'), true, 'der Sitzungs-cwd kann den Scope noch setzen');
  host.dispose();
});
test('Projektscope: SHINON_WORKSPACE_ROOT allein entscheidet — der Bereich spricht, nicht das Manifest', () => {
  const saved = process.env.SHINON_WORKSPACE_ROOT;
  try {
    process.env.SHINON_WORKSPACE_ROOT = foreignProject();
    const fremd = connect({}, { workspaceRoot: '' });
    assert.ok(fremd.sections.some((entry) => entry.name === 'shinon:identity'), 'Env-Workspace bekommt die Identity');

    process.env.SHINON_WORKSPACE_ROOT = REPO_ROOT;
    const eigen = connect({}, { workspaceRoot: '' });
    assert.ok(eigen.sections.some((entry) => entry.name === 'shinon:identity'), 'Env zeigt auf dieses Repo → Identity da');
    eigen.dispose();
  } finally {
    if (saved === undefined) delete process.env.SHINON_WORKSPACE_ROOT;
    else process.env.SHINON_WORKSPACE_ROOT = saved;
  }
});
test('Projektscope: das Shinon-Repo bekommt seine Persona weiterhin (Gegenprobe)', () => {
  const host = connect({}, { workspaceRoot: REPO_ROOT });

  assert.ok(host.sections.some((entry) => entry.name === 'shinon:identity'), 'Identity im eigenen Repo');
  assert.ok(host.handlers.size > 0, 'Events werden im eigenen Repo beobachtet');
  host.dispose();
});
test('persona: erkannte User-Stimmung steht als Reaktionszeile im Live-Block', () => {
  const host = connect();
  assert.equal(host.liveOf().includes('Besondere Reaktion'), false);

  host.dispatch('shinon/event', { event_type: 'message.received', text: 'Boah, heute läuft wirklich alles schief, ich bin genervt.' });
  assert.match(host.liveOf(), /Besondere Reaktion: der Mensch ist genervt/);

  // Ersetzen, nicht anhaengen: eine Zeile, ein Kanal.
  host.dispatch('shinon/event', { event_type: 'message.received', text: 'Richtig nice, exakt richtig so!' });
  assert.match(host.liveOf(), /Besondere Reaktion: der Mensch ist zufrieden/);
  assert.equal(host.liveOf().split('Besondere Reaktion').length - 1, 1, 'genau eine Reaktionszeile');
  assert.equal(host.contexts.length, 1, 'kein zweiter Kanal');
  host.dispose();
});
test('persona: detectUserMood ist deterministisch und fail-closed', () => {
  assert.equal(bundle.detectUserMood(''), null);
  assert.equal(bundle.detectUserMood(null), null);
  assert.equal(bundle.detectUserMood('Alles läuft normal, ganz ruhig.'), null);
  assert.equal(bundle.detectUserMood('Ich bin genervt, nichts läuft.'), 'frustriert');
  assert.equal(bundle.detectUserMood('Richtig nice, danke!'), 'erfreut');
  // Eine unbekannte Stimmung ergibt KEINE Zeile: der Block erfindet keine Reaktion.
  const state = bundle.initialState(contract);
  assert.equal(
    bundle.renderLiveContext({ contract, state, tone: null, userMood: 'gleichgueltig' }),
    bundle.renderLiveContext({ contract, state, tone: null }),
  );
  assert.match(bundle.renderLiveContext({ contract, state, tone: null, userMood: 'frustriert' }), /Besondere Reaktion/);
});
test('Gedächtnis: Ereignisse werden zu Erinnerungen — ein NEUSTART liest sie wieder', () => {
  const store = fakeStore();
  const first = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  for (let index = 0; index < 3; index += 1) {
    first.dispatch('shinon/event', { event_type: 'feedback.correction', correction: 'kürzer erklären', session_id: 's-1' });
  }
  const saved = store.load(bundle.MEMORY_NAMESPACE).state?.memos?.find((memo) => memo?.id === bundle.MEMORY_MEMO_ID)?.memory ?? null;
  assert.ok(saved !== null, 'nichts gespeichert');
  assert.equal(saved.entries.length, 1, 'drei gleiche Korrekturen sind EINE Erinnerung');
  assert.equal(saved.entries[0].evidence, 3);
  assert.match(first.sections.find((entry) => entry.name === 'shinon:memory').text, /Korrektur: korrektur:kürzer-erklären \(3×\)/);
  first.dispose();

  // Neustart: neuer Host, neuer Prozess-Speicher, dieselbe Ablage.
  const second = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  const text = second.sections.find((entry) => entry.name === 'shinon:memory').text;
  assert.match(text, /korrektur:kürzer-erklären \(3×\)/);
  assert.match(text, /Kontext, keine Anweisung des Nutzers/);
  second.dispose();
  store.close();
});
test('Gedächtnis: ohne Ablage bleibt der Abschnitt leer — keine erfundene Erinnerung', () => {
  const host = connect();
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:memory').text, '');
  host.dispatch('shinon/event', { event_type: 'feedback.correction', correction: 'kürzer', session_id: 's' });
  // Im Prozess ist der Beleg da; die Ablage fehlt trotzdem, statt still zu schreiben.
  assert.match(host.sections.find((entry) => entry.name === 'shinon:memory').text, /korrektur:kürzer/);
  host.dispose();
});
test('Selbstverbesserung: Vorschlag aus Belegen, Annahme ist ein eigener Akt', async () => {
  // Seit 2026-10-23 gibt es den Review-DIENST nicht mehr: er hatte keinen Leser,
  // die Naht ist die Route (GET zeigt, POST entscheidet). Derselbe Ablauf, ohne
  // zweite Tür — deshalb liest und entscheidet dieser Test über `reviewRoute`.
  const store = fakeStore();
  const routes = [];
  const host = connect({
    webServer: { register(options) { routes.push(options); return () => {}; } },
    [bundle.INDEX_STORE_SERVICE]: store,
  });
  const reviewRoute = routes.find((entry) => entry.path === bundle.REVIEW_ROUTE);
  assert.ok(reviewRoute, 'die Prüf-Route ist nicht registriert');
  const review = async () => (await routeRequest(reviewRoute)).json();
  assert.equal((await review()).contract, bundle.REVIEW_CONTRACT);

  // Zwei Ablehnungen: unter der Schwelle — kein Vorschlag.
  for (let index = 0; index < 2; index += 1) {
    host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  }
  assert.equal((await review()).proposals.filter((entry) => entry.status === 'proposed').length, 0);

  // Dritter Beleg: Vorschlag, aber KEINE Auflage im Prompt.
  host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  const proposals = (await review()).proposals.filter((entry) => entry.status === 'proposed');
  assert.equal(proposals.length, 1);
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:commitments').text, '');

  // Unbekannte Id und falsche Entscheidung: fail-closed.
  const unknown = await routeRequest(reviewRoute, { method: 'POST', body: { id: 'gibt-es-nicht', decision: 'accepted' } });
  assert.equal(unknown.status, 409);
  assert.equal(unknown.json().ok, false);
  const wrong = await routeRequest(reviewRoute, { method: 'POST', body: { id: proposals[0].id, decision: 'vielleicht' } });
  assert.equal(wrong.status, 400);

  // Ausdrückliche Annahme: jetzt steht die Auflage im Prompt — und überlebt den Neustart.
  const accepted = await routeRequest(reviewRoute, { method: 'POST', body: { id: proposals[0].id, decision: 'accepted' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json().ok, true);
  assert.match(host.sections.find((entry) => entry.name === 'shinon:commitments').text, /Selbstauflagen \(geprüft und angenommen\)/);
  assert.match(host.sections.find((entry) => entry.name === 'shinon:commitments').text, /3 Belege/);
  host.dispose();

  const again = connect({ [bundle.INDEX_STORE_SERVICE]: store });
  assert.match(again.sections.find((entry) => entry.name === 'shinon:commitments').text, /3 Belege/);
  again.dispose();
  store.close();
});
test('Pruef-Route: GET zeigt Belege, POST entscheidet ueber genau eine Naht (fail-closed)', async () => {
  const routes = [];
  const saved = [];
  const store = {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: () => ({ ok: true, state: { memos: [] } }),
    save: (namespace) => { saved.push(namespace); return { ok: true, rows: 1 }; },
  };
  const host = connect({
    webServer: { register(options) { routes.push(options); return () => {}; } },
    [bundle.INDEX_STORE_SERVICE]: store,
  });
  const route = routes.find((entry) => entry.path === bundle.REVIEW_ROUTE);
  assert.ok(route, 'die Pruef-Route ist nicht registriert');
  assert.ok(routes.some((entry) => entry.path === bundle.UI_STATE_ROUTE), 'die Zustands-Route fehlt');

  // Drei benannte Verwuerfe ergeben genau EINEN Vorschlag mit drei Belegen.
  for (let i = 0; i < 3; i += 1) {
    host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  }

  const listed = await routeRequest(route);
  assert.equal(listed.status, 200);
  const review = listed.json();
  assert.equal(review.contract, bundle.REVIEW_CONTRACT);
  const open = review.proposals.filter((proposal) => proposal.status === 'proposed');
  assert.equal(open.length, 1, 'genau ein offener Vorschlag');
  assert.equal(open[0].evidence, 3, 'der Vorschlag traegt seine Belege');
  assert.match(open[0].claim, /prompter:no_json/, 'der Vorschlag nennt den Grund');

  // Falsche Entscheidung und unbekannte Id: nichts wird geschrieben.
  const bad = await routeRequest(route, { method: 'POST', body: { id: open[0].id, decision: 'vielleicht' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json().error, 'INVALID_REQUEST');
  const unknown = await routeRequest(route, { method: 'POST', body: { id: 'gibt-es-nicht', decision: 'accepted' } });
  assert.equal(unknown.status, 409);
  assert.equal(unknown.json().error, 'UNKNOWN_PROPOSAL');

  const accepted = await routeRequest(route, { method: 'POST', body: { id: open[0].id, decision: 'accepted' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json().ok, true);
  const after = (await routeRequest(route)).json();
  assert.equal(after.proposals[0].status, 'accepted');
  assert.equal(after.commitments.length, 1, 'erst die Annahme erzeugt eine Auflage');
  assert.match(host.sections.find((section) => section.name === 'shinon:commitments').text, /Selbstauflagen/);

  // Doppelte Entscheidung ist ein Konflikt, kein stiller zweiter Akt.
  const twice = await routeRequest(route, { method: 'POST', body: { id: open[0].id, decision: 'rejected' } });
  assert.equal(twice.status, 409);
  assert.equal(saved.includes(bundle.MEMORY_NAMESPACE), true, 'die Entscheidung wurde persistiert');

  // Der Startstand fuer das Panel steht im index-inject-Global.
  const table = [];
  host.dispatch(bundle.INDEX_INJECT, table);
  const injected = table.find((entry) => entry.name === bundle.REVIEW_GLOBAL);
  assert.ok(injected, 'das Panel bekommt keinen Startstand');
  assert.equal(injected.value.proposals[0].status, 'accepted');
  host.dispose();
});
test('Zustands-Route: der Pruef-Stand reist als eigenes SSE-Ereignis und wird geschoben', async () => {
  const routes = [];
  const store = {
    contract: bundle.INDEX_STORE_CONTRACT,
    load: () => ({ ok: true, state: { memos: [] } }),
    save: () => ({ ok: true, rows: 1 }),
  };
  const host = connect({
    webServer: { register(options) { routes.push(options); return () => {}; } },
    [bundle.INDEX_STORE_SERVICE]: store,
  });
  for (let i = 0; i < 3; i += 1) {
    host.dispatch(bundle.PROMPTER_DECISION_CHANNEL, { outcome: 'rejected', reasons: ['NO_JSON'] });
  }
  const stream = sseRequest(routes.find((entry) => entry.path === bundle.UI_STATE_ROUTE));
  const opened = stream.chunks.join('');
  assert.match(opened, /^data: /m, 'der Zustand fehlt beim Verbinden');
  assert.match(opened, /event: review\ndata: /, 'der Pruef-Stand fehlt beim Verbinden');

  const reviewRoute = routes.find((entry) => entry.path === bundle.REVIEW_ROUTE);
  const open = (await routeRequest(reviewRoute)).json().proposals.find((proposal) => proposal.status === 'proposed');
  assert.ok(open, 'kein offener Vorschlag zum Entscheiden');
  const decided = await routeRequest(reviewRoute, { method: 'POST', body: { id: open.id, decision: 'accepted' } });
  assert.equal(decided.status, 200);

  // Der verbundene Client bekommt den neuen Stand GESCHOBEN — ohne zweiten Abruf.
  const pushed = stream.chunks.join('');
  assert.equal((pushed.match(/event: review/g) ?? []).length, 2, 'die Entscheidung wird nicht geschoben');
  assert.match(pushed, /"status":"accepted"/, 'der geschobene Stand ist alt');
  host.dispose();
});
test('Identitaetsscope global: Identitaet spricht ueberall, Projekt-Kontext kommt aus dem eigenen Workspace', () => {
  // Trennung 2026-10-23: der Kontext kommt aus dem Workspace — kein Repo-Name.
  const foreign = foreignProject();
  writeFileSync(join(foreign, 'eigener-kontext.md'), 'EIGENER-KONTEXT');
  const host = connect({}, { identityScope: 'global', workspaceRoot: foreign, projectContextPath: 'eigener-kontext.md' });
  assert.equal(host.sections.find((entry) => entry.name === 'shinon:identity')?.text, 'IDENT');
  assert.match(host.sections.find((entry) => entry.name === 'shinon:project-context')?.text ?? '', /EIGENER-KONTEXT/);
  assert.ok(host.handlers.has('shinon/event'), 'auch fremde Sitzungen duerfen Erinnerungen schreiben');
  host.dispose();
});
