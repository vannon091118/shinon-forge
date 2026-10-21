#!/usr/bin/env node
/**
 * Skill-Lebenszyklus, Host (Zug 7) — ein Fake-Modell, ein Temp-Projekt, kein Netz.
 *
 * Belegt den Weg vom Ereignis bis zur Datei:
 *   - Korrektur (negative Bewertung + Text) veroeffentlicht einen Skill nach
 *     .agents/skills/<name>/SKILL.md und schreibt den Ledger.
 *   - Dieselbe Korrektur zweimal erzeugt keine zweite Zeile (Idempotenz).
 *   - "skip" des Modells und verbotene Ausgaben erzeugen KEINE Datei.
 *   - Wiederholte abgeschlossene Zuege veroeffentlichen erst nach minCompleted.
 *   - Ohne Route passiert nichts; nach dispose() wird kein Ereignis mehr gehoert.
 *
 * Das Modell ist ein Fake: der Test prueft Pfade, Schreibort und Zaehler, nicht
 * die Qualitaet eines echten Modells (das ist eine Laufzeit-Abnahme, siehe Probe).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillLifecycle, textOf, SYSTEM_PROMPT } from '../assets/skill-lifecycle.js';

const rules = JSON.parse(readFileSync(new URL('../assets/skill-lifecycle-rules.json', import.meta.url), 'utf8'));
const noteRules = JSON.parse(readFileSync(new URL('../assets/note-rules.json', import.meta.url), 'utf8'));
// Schnelles Abklingen fuer den Test; die Regel selbst bleibt unangetastet.
const fast = { ...rules, trigger: { ...rules.trigger, correction: { ...rules.trigger.correction, settleMs: 5 } } };
const ROUTE = { provider: 'prompter', model: 'fake-model' };

const GOOD = {
  name: 'gate-whitelist-regel',
  thema: 'gate',
  description: 'Nutzen wenn eine neue Datendatei im assets-Ordner eines Pakets entsteht, damit das Gate sie kennt.',
  bei: 'Eine neue Datendatei kommt in den assets-Ordner eines Pakets',
  immer: 'den Dateinamen in die Whitelist des Gate-Plugins eintragen',
  weil: 'das Gate prueft jede Datei gegen eine feste Liste',
};

let project;
let previousCwd;

before(() => {
  previousCwd = process.cwd();
  project = mkdtempSync(join(tmpdir(), 'shinon-skills-'));
  mkdirSync(join(project, '.agents', 'skills'), { recursive: true });
  process.chdir(project);
});

after(() => {
  process.chdir(previousCwd);
  rmSync(project, { recursive: true, force: true });
});

/** Ein Fake-LLM: liefert nacheinander die Antworten, zaehlt die Aufrufe. */
function fakeLlm(replies) {
  const calls = [];
  let index = 0;
  return {
    calls,
    llm: {
      stream(request) {
        calls.push(request);
        const text = replies[Math.min(index, replies.length - 1)];
        index += 1;
        return (async function* () {
          yield { type: 'text-delta', index: 0, text };
        })();
      },
    },
  };
}

function collector() {
  const lines = [];
  return { lines, log: { log: (m) => lines.push(m), warn: (m) => lines.push(m) } };
}

async function until(check, ms = 3000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return check();
}

const skillFile = (name) => join(project, '.agents', 'skills', name, 'SKILL.md');
const ledgerFile = () => join(project, '.shinon', 'skill-ledger.json');

const userMessage = (session, text) => ({
  envelope: { event_type: 'message.received', session_id: session },
  payload: { data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } },
});
const assistantMessage = (session, text) => ({
  envelope: { event_type: 'message.completed', session_id: session },
  payload: { data: { message: { content: [{ type: 'text', text }] } } },
});
const negativeFeedback = (session, messageId) => ({
  envelope: { event_type: 'feedback.rated', session_id: session },
  payload: { data: { item: { rating: 'negative', messageId } } },
});
const feedbackText = (session, text) => ({
  envelope: { event_type: 'feedback.noted', session_id: session },
  payload: { data: { text } },
});
const turnEnd = (session, turn, kind = 'completed') => ({
  envelope: { event_type: 'turn.end', session_id: session },
  payload: { data: { turn, reason: { kind } } },
});

function feed(lifecycle, events) {
  for (const { envelope, payload } of events) lifecycle.observe(envelope, payload);
}

test('textOf: Text aus String und aus Blockliste, nur text-Bloecke', () => {
  assert.equal(textOf('hallo'), 'hallo');
  assert.equal(textOf([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a\nb');
  assert.equal(textOf(null), '');
});

test('Korrektur veroeffentlicht einen Skill und schreibt den Ledger; Wiederholung ist idempotent', async () => {
  const { lines, log } = collector();
  const { llm, calls } = fakeLlm([JSON.stringify(GOOD)]);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: ROUTE, log });
  feed(lifecycle, [
    userMessage('s1', 'Bitte eine neue Datendatei anlegen'),
    assistantMessage('s1', 'Datei angelegt, Whitelist vergessen'),
    negativeFeedback('s1', 'm1'),
    feedbackText('s1', 'Die Whitelist des Gate-Plugins fehlte.'),
  ]);
  assert.equal(await until(() => existsSync(skillFile(GOOD.name))), true, 'die SKILL.md muss entstehen');
  // Die Datei kommt VOR dem Ledger: der Test wartet auf beides, nicht nur auf die Datei.
  assert.equal(await until(() => existsSync(ledgerFile()) && JSON.parse(readFileSync(ledgerFile(), 'utf8')).entries[GOOD.name]?.status === 'published'), true, 'der Ledger muss den Status published tragen');

  const text = readFileSync(skillFile(GOOD.name), 'utf8');
  assert.match(text, /^---\nname: gate-whitelist-regel\n/);
  assert.match(text, /## Belege\n\n- correction · sess-[0-9a-f]{8} · message:m1\n/);
  assert.equal(calls.length, 1, 'genau ein Modellaufruf je Korrektur');
  const system = calls[0].system;
  assert.equal(system, SYSTEM_PROMPT);
  const userText = calls[0].messages[0].content[0].text;
  assert.match(userText, /<korrektur>Die Whitelist des Gate-Plugins fehlte\.<\/korrektur>/);

  const ledger = JSON.parse(readFileSync(ledgerFile(), 'utf8'));
  assert.equal(ledger.entries[GOOD.name].status, 'published');

  // Dieselbe Korrektur noch einmal: kein zweiter Beleg, kein geaenderter Text.
  const before = readFileSync(skillFile(GOOD.name), 'utf8');
  feed(lifecycle, [negativeFeedback('s1', 'm1'), feedbackText('s1', 'Die Whitelist des Gate-Plugins fehlte.')]);
  assert.equal(await until(() => lines.some((line) => line.includes('idempotent'))), true);
  assert.equal(readFileSync(skillFile(GOOD.name), 'utf8'), before, 'die Datei bleibt byte-gleich');
  lifecycle.dispose();
});

test('"skip" des Modells erzeugt keine Datei', async () => {
  const { lines, log } = collector();
  const { llm } = fakeLlm(['{"skip": true}']);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: ROUTE, log });
  const dirsBefore = readdirSync(join(project, '.agents', 'skills')).sort();
  feed(lifecycle, [userMessage('s2', 'kurze Frage'), assistantMessage('s2', 'kurze Antwort'), turnEnd('s2', 1)]);
  assert.equal(await until(() => lines.some((line) => line.includes('kein Lernstoff'))), true);
  assert.deepEqual(readdirSync(join(project, '.agents', 'skills')).sort(), dirsBefore, 'kein neuer Skill-Ordner');
  lifecycle.dispose();
});

test('verbotener Kandidat (Berechtigung) wird abgelehnt und nicht geschrieben', async () => {
  const forbidden = { ...GOOD, name: 'sandbox-schalter', immer: 'setze danger-full-access fuer jeden Lauf' };
  const { lines, log } = collector();
  const { llm } = fakeLlm([JSON.stringify(forbidden)]);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: ROUTE, log });
  feed(lifecycle, [negativeFeedback('s3', 'm9')]);
  assert.equal(await until(() => lines.some((line) => line.includes('sandbox-schalter: reject'))), true);
  assert.equal(existsSync(skillFile('sandbox-schalter')), false, 'keine Datei fuer verbotene Inhalte');
  const ledger = JSON.parse(readFileSync(ledgerFile(), 'utf8'));
  assert.equal(ledger.entries['sandbox-schalter'].status, 'rejected');
  assert.match(ledger.entries['sandbox-schalter'].reason, /^VERBOTEN:/);
  lifecycle.dispose();
});

test('wiederholte abgeschlossene Zuege: erst beim minCompleted-ten wird veroeffentlicht', async () => {
  const repeated = { ...GOOD, name: 'wiederholter-hinweis', thema: 'wiederholung', bei: 'Eine Sitzung wiederholt dieselbe Arbeit', immer: 'die Arbeit einmal als Skill festhalten', weil: 'Wiederholung spart Zeit' };
  const { lines, log } = collector();
  const { llm } = fakeLlm([JSON.stringify(repeated)]);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: ROUTE, log });
  for (let turn = 1; turn <= rules.evidence.minCompleted - 1; turn += 1) {
    feed(lifecycle, [userMessage('s4', 'Wiederholte Arbeit'), assistantMessage('s4', 'Erledigt'), turnEnd('s4', turn)]);
    await until(() => lines.filter((line) => line.includes('wiederholter-hinweis: candidate')).length >= turn);
  }
  assert.equal(existsSync(skillFile(repeated.name)), false, 'vor minCompleted kein Skill');
  feed(lifecycle, [userMessage('s4', 'Wiederholte Arbeit'), assistantMessage('s4', 'Erledigt'), turnEnd('s4', rules.evidence.minCompleted)]);
  assert.equal(await until(() => existsSync(skillFile(repeated.name))), true, 'bei minCompleted wird veroeffentlicht');
  lifecycle.dispose();
});

test('abgebrochener Zug erzeugt keinen Auftrag', async () => {
  const { lines, log } = collector();
  const { llm, calls } = fakeLlm([JSON.stringify(GOOD)]);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: ROUTE, log });
  feed(lifecycle, [userMessage('s5', 'Abgebrochen'), assistantMessage('s5', 'Teil'), turnEnd('s5', 1, 'aborted')]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls.length, 0, 'kein Modellaufruf nach einem Abbruch');
  assert.equal(lines.length, 0);
  lifecycle.dispose();
});

test('ohne Route laeuft nichts und sagt warum', async () => {
  const { lines, log } = collector();
  const { llm, calls } = fakeLlm([JSON.stringify(GOOD)]);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: { provider: '', model: '' }, log });
  feed(lifecycle, [negativeFeedback('s6', 'm2')]);
  assert.equal(await until(() => lines.some((line) => line.includes('keine Route'))), true, 'der Grund steht im Log');
  assert.equal(calls.length, 0, 'ohne Route kein Modellaufruf');
  lifecycle.dispose();
});

test('nach dispose() wird kein Ereignis mehr gehoert', async () => {
  const { llm, calls } = fakeLlm([JSON.stringify(GOOD)]);
  const lifecycle = createSkillLifecycle({ ctx: { llm }, rules: fast, noteRules, route: ROUTE, log: collector().log });
  lifecycle.dispose();
  feed(lifecycle, [negativeFeedback('s7', 'm3')]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls.length, 0, 'nach dispose kein Modellaufruf');
});
