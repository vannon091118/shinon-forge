#!/usr/bin/env node
/**
 * persona-review-panel — das Prüf-Panel entscheidet über die BESTEHENDE Naht.
 *
 * WARUM DIESE DATEI EXISTIERT: die Persona hatte eine Prüf-Naht im Host
 * (`reviewService.review()` / `decide()`, Route + Global) und danach keinen
 * sichtbaren Weg dorthin. Ein Panel, das nur aus der Ferne „belegen“ könnte,
 * wäre keine Prüfung: wer offene Vorschläge annimmt, muss die Belege sehen und
 * genau EINEN Vorschlag entscheiden.
 *
 * GEPRUEFT WIRD DAS AUSGELIEFERTE BUNDLE (`__ModuleLoader__` -> `apply`):
 *
 *   1. ZWILLINGE — Route, Startstand-Global und Vertragsname sind auf beiden
 *      Seiten dasselbe Literal. Das Panel kann `index.js` nicht importieren; ein
 *      falscher Name liesse es leer aussehen („nichts zu entscheiden“).
 *   2. ANZEIGE — offene Vorschläge mit ihrer Belegzahl erscheinen, bereits
 *      entschiedene nicht. Der Startstand aus dem Global trägt den ersten Blick.
 *   3. ENTSCHEIDUNG — Annehmen/Ablehnen gehen als POST an dieselbe Route, mit
 *      genau `{ id, decision }`. Kein anderer Weg, kein Schreiben im Client.
 *   4. FAIL-CLOSED — ein fremdes Dokument im Global wird verworfen.
 *
 * Was der Test NICHT beweist: dass ein Browser das Panel malt. Er führt die
 * Komponente mit der React-Attrappe des Loaders aus und vergleicht den Baum.
 *
 * Läuft mit `node --test` — kein node_modules, kein Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientBundle, requireStub } from './helpers/client-sandbox.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const host = read('packages/persona/index.js');
// Die Routen haben einen eigenen Eigentuemer (`assets/ui-surface.js`); die
// Vertragsnamen stehen weiter im Eintrag.
const surface = read('packages/persona/assets/ui-surface.js');
const core = read('packages/persona/assets/interaction-core.js');
const client = read('packages/persona/client.js');

/** Den Export-Wert aus dem Host lesen — die Quelle, gegen die gespiegelt wird. */
function hostLiteral(name) {
  const match = new RegExp(`export const ${name} = '([^']+)';`).exec(host);
  assert.ok(match !== null, `packages/persona/index.js: ${name} fehlt`);
  return match[1];
}

/** Den Literal-Wert aus der Client-Hälfte lesen (sie kann den Host nicht importieren). */
function clientLiteral(name) {
  const match = new RegExp(`const ${name} = '([^']+)';`).exec(client);
  assert.ok(match !== null, `packages/persona/client.js: ${name} fehlt`);
  return match[1];
}

/** Der Literal-Wert aus dem importfreien Kern (dort wohnt die Beziehungs-Naht). */
function coreLiteral(name) {
  const match = new RegExp(`export const ${name} = '([^']+)';`).exec(core);
  assert.ok(match !== null, `packages/persona/assets/interaction-core.js: ${name} fehlt`);
  return match[1];
}

const REVIEW_ROUTE = hostLiteral('REVIEW_ROUTE');
const REVIEW_GLOBAL = hostLiteral('REVIEW_GLOBAL');
const REVIEW_CONTRACT = hostLiteral('REVIEW_CONTRACT');

/** Einen Weg gehen, den die Komponente wirklich anbietet: `apply(ctx)`. */
function mount(globals = {}) {
  const { registration, sandbox } = loadClientBundle('persona', globals);
  const registered = [];
  const ctx = {
    slots: {
      inject(_name, callback) { callback(); return () => {}; },
      register(options, component) { registered.push({ options, component }); return () => {}; },
    },
  };
  registration.factory(requireStub()).apply(ctx);
  return { registered, sandbox };
}

/** Die Komponente so aufrufen, wie React es täte (Attrappe des Loaders). */
function render(component) {
  return component({});
}

/**
 * Funktionskomponenten auflösen: die React-Attrappe des Loaders ruft sie nicht
 * selbst auf, sie legt nur `{ type, props, children }` an. Der Test soll den
 * Baum sehen, den React sähe — also wird hier expandiert.
 */
function expand(tree) {
  if (tree === null || tree === undefined || typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(expand);
  if (typeof tree.type === 'function') return expand(tree.type(tree.props ?? {}));
  return { ...tree, children: (tree.children ?? []).map(expand) };
}

/** Den sichtbaren Text eines Baums einsammeln. */
function textOf(tree) {
  if (tree === null || tree === undefined) return '';
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return (tree.children ?? []).map(textOf).join('');
}

/** Alle Knöpfe im Baum — die EINEN Wege einer Entscheidung. */
function buttonsOf(tree, out = []) {
  if (tree === null || tree === undefined || typeof tree === 'string') return out;
  if (Array.isArray(tree)) {
    for (const child of tree) buttonsOf(child, out);
    return out;
  }
  if (tree.type === 'button') out.push(tree);
  buttonsOf(tree.children ?? [], out);
  return out;
}

const openProposal = (id, claim, evidence) => ({ id, claim, evidence, status: 'proposed' });
const decidedProposal = (id, claim, status) => ({ id, claim, evidence: 2, status, decidedAt: '2026-10-19T00:00:00.000Z' });

const review = {
  contract: REVIEW_CONTRACT,
  memory: { contract: 'shinon.persona-memory/v1', version: 1 },
  proposals: [
    openProposal('p1', 'Bei "prompter:no_json" zuerst die Ursache prüfen.', 3),
    decidedProposal('p2', 'Schon abgelehnt.', 'rejected'),
  ],
  commitments: [{ id: 'p0', claim: 'Eine bereits angenommene Auflage.', evidence: 4 }],
};

test('Pruef-Panel: Route, Startstand und Vertrag sind auf beiden Seiten dasselbe Literal', () => {
  assert.equal(clientLiteral('REVIEW_ROUTE'), REVIEW_ROUTE, 'die Route driftet');
  assert.equal(clientLiteral('REVIEW_GLOBAL'), REVIEW_GLOBAL, 'der Startstand-Name driftet');
  assert.equal(clientLiteral('REVIEW_CONTRACT'), REVIEW_CONTRACT, 'der Vertragsname driftet');
  assert.equal(clientLiteral('STATE_ROUTE'), hostLiteral('UI_STATE_ROUTE'), 'die Zustands-Route driftet');
  assert.equal(clientLiteral('RELATION_ROUTE'), coreLiteral('RELATION_ROUTE'), 'die Beziehungs-Route driftet');
  assert.equal(clientLiteral('STATE_GLOBAL'), hostLiteral('UI_STATE_GLOBAL'), 'der Zustands-Global driftet');
  // Der Host registriert GET und POST unter DIESER Route — und legt den
  // Startstand in denselben Global-Namen, den das Panel liest.
  assert.match(surface, /path: names\.reviewRoute,[\s\S]*?req\.method === 'GET'[\s\S]*?req\.method !== 'POST'/, 'die Route kennt nicht beide Methoden');
  assert.match(host, /table\.push\(\{ kind: 'global', name: REVIEW_GLOBAL/, 'der Host legt den Startstand nicht in den Global-Namen');
});

test('Pruef-Panel: offene Vorschlaege mit Belegzahl, entschiedene mit ihrem Ausgang', () => {
  const { registered } = mount({ [REVIEW_GLOBAL]: review });
  const panel = registered.find((entry) => entry.options.name === 'main');
  assert.ok(panel, 'das Panel meldet sich nicht im main-Slot an');
  assert.equal(panel.options.key, 'shinon-persona', 'main ist ein keyed-Slot (options.key)');
  assert.equal(registered.some((entry) => entry.options.name === 'sidebar.panellist' && entry.options.id === 'shinon-persona'), false,
    'Persona belegt die Sidebar-Leiste erneut; der Review-Zugang ist im keyed main-Slot');
  const tree = expand(render(panel.component));
  const text = textOf(tree);
  assert.match(text, /1 offen/, 'die Zahl der offenen Vorschlaege fehlt');
  assert.match(text, /prompter:no_json/, 'der offene Vorschlag nennt seinen Grund nicht');
  assert.match(text, /3 Belege/, 'die Belegzahl fehlt');
  // Das Panel muss SAGEN, was entschieden wurde — vorher stand hier nur
  // „1 Auflage · 1 entschieden" und der Nutzer hatte keine Information über
  // seine eigene Entscheidung (Feedback 2026-10-22 am laufenden Host).
  assert.match(text, /Entschieden/, 'die entschiedenen Vorschlaege fehlen ganz');
  assert.match(text, /Schon abgelehnt/, 'der entschiedene Vorschlag nennt seine Behauptung nicht');
  assert.match(text, /abgelehnt/, 'der Ausgang der Entscheidung fehlt');
  assert.match(text, /1 Auflage · 1 entschieden/, 'die angenommene Auflage wird nicht gezaehlt');
  assert.equal(buttonsOf(tree).length, 2, 'nur offene Vorschlaege bieten Wege an');
});

test('Pruef-Panel: Annehmen und Ablehnen sind ein POST an dieselbe Route, mit genau { id, decision }', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const body = options?.method === 'POST' ? { ok: true, proposal: {} } : review;
    return { ok: true, status: 200, json: async () => body };
  };
  const { registered } = mount({ [REVIEW_GLOBAL]: review, fetch });
  const panel = registered.find((entry) => entry.options.name === 'main');
  const [accept, reject] = buttonsOf(expand(render(panel.component)));
  assert.equal(textOf(accept), 'Annehmen');
  assert.equal(textOf(reject), 'Ablehnen');

  await accept.props.onClick();
  await reject.props.onClick();

  const posts = calls.filter((call) => call.options?.method === 'POST');
  assert.equal(posts.length, 2, 'jede Entscheidung ist genau ein POST');
  for (const call of posts) {
    assert.equal(call.url, REVIEW_ROUTE, 'die Entscheidung geht an eine andere Route');
    assert.equal(call.options.headers['content-type'], 'application/json');
  }
  assert.deepEqual(JSON.parse(posts[0].options.body), { id: 'p1', decision: 'accepted' });
  assert.deepEqual(JSON.parse(posts[1].options.body), { id: 'p1', decision: 'rejected' });
  // Der Abruf danach ist ein GET auf dieselbe Route — der Stand kommt vom Host.
  assert.ok(calls.some((call) => call.options?.method !== 'POST' && call.url === REVIEW_ROUTE),
    'nach der Entscheidung wird der Host nicht neu gelesen');
});

test('Pruef-Panel: haengt an der SSE-Zustandsroute statt an einem Abruf-Intervall', () => {
  // Der neue Stand kommt geschoben: dieselbe Verbindung, ein eigenes `review`-
  // Ereignis. Ein Timer waere eine zweite Wahrheit ueber den Stand — und der
  // Grund fuer die Verzoegerung, die das Panel abschaffen soll.
  assert.match(client, /new EventSource\(STATE_ROUTE\)/);
  assert.match(client, /addEventListener\('review'/);
  assert.ok(!/setInterval\s*\(/.test(client), 'das Panel pollt noch');
});

test('Beziehungs-Panel: Stufe sichtbar und als POST auf die bestehende Route setzbar', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ ok: true, level: 'trusted' }) };
  };
  const relation = { levels: ['stranger', 'known', 'trusted', 'anchor'], current: 'known' };
  const { registered } = mount({
    [REVIEW_GLOBAL]: review,
    __shinonPersonaState: { contract: 'shinon.persona-ui/v1', relation },
    fetch,
  });
  const panel = registered.find((entry) => entry.options.name === 'main');
  const tree = expand(render(panel.component));
  assert.match(textOf(tree), /Vertrauensstufe · known/, 'die aktuelle Stufe steht nicht im Panel');

  // Die Stufenliste kommt vom Host, nicht aus einer zweiten Tabelle im Bundle.
  const chips = buttonsOf(tree).filter((button) => ['stranger', 'known', 'trusted', 'anchor'].includes(textOf(button)));
  assert.equal(chips.length, 4, 'die Stufen des Vertrags fehlen im Panel');
  assert.equal(chips.find((button) => textOf(button) === 'known').props.disabled, true, 'die aktuelle Stufe ist ein Ziel');

  const trusted = chips.find((button) => textOf(button) === 'trusted');
  await trusted.props.onClick();
  const posts = calls.filter((call) => call.options?.method === 'POST');
  assert.equal(posts.length, 1, 'ein Klick ist genau ein POST');
  assert.equal(posts[0].url, coreLiteral('RELATION_ROUTE'), 'die Stufe geht an eine andere Route');
  assert.deepEqual(JSON.parse(posts[0].options.body), { level: 'trusted' }, 'die Sitzung erfindet das Panel nicht');
});

test('Pruef-Panel: ein fremdes Dokument im Startstand wird verworfen (fail-closed)', () => {
  const { registered } = mount({ [REVIEW_GLOBAL]: { contract: 'fremd/v1', proposals: [openProposal('x', 'Fremd.', 9)] } });
  const panel = registered.find((entry) => entry.options.name === 'main');
  const text = textOf(render(panel.component));
  assert.match(text, /Auflagen werden geladen/, 'ein fremdes Dokument wird als eigener Stand angezeigt');
  assert.ok(!text.includes('Fremd.'), 'der fremde Vorschlag wird gerendert');
});
