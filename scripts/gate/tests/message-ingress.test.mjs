#!/usr/bin/env node
/**
 * Einheitlicher Message-Eingang — der Vertrag von Block 01.
 *
 * Behauptung: jeder Weg, auf dem ein Prompt in den Hauptagenten kommt (UI Send,
 * Enter, followup(), steer(), Warteschlange, headless, SDK, ACP, Befehl), laeuft
 * durch DENSELBEN Runtime-Seam `agent/pre-step` — und der Send-Button enthaelt
 * keine eigene Prompt-Logik.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-38e58c249e52
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dshHarnessDir, dshRoot } from '../../lib/yaml.mjs';
import { loadMatrix } from '../../lib/dsh-versions.mjs';

/**
 * Die Fassung kommt aus der Sollquelle, nicht aus einer zweiten Konstante.
 *
 * Der Seam selbst ist über die Fassungen hinweg unverändert: `send(message,
 * target, wakeup)` mit genau einem `inbox.splice`, genau ein `inbox.claim(`
 * (in preStep) und genau ein `waterfall("agent/pre-step")` im Harness. Weil
 * die Aussagen strukturell sind, hält der Test sie auch nach einem Bump — nur
 * das geladene Paket muss die Sollfassung sein.
 */
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const VERIFIED_DSH_VERSION = loadMatrix(REPO).targets['@deepseek-ai/dsh'];
const root = dshRoot();
assert.ok(root !== null, 'dsh muss im PATH liegen (dshRoot() ist null) — wie beim Profiltest');

/**
 * Ein installiertes DSH-Paket laden: Version plus Quelltext seiner Host-Hälfte.
 *
 * Seit rc.2 hoisted npm nicht mehr jedes Paket nach oben (`dsh-agent-loop`
 * liegt unter `dsh-base`, `dsh-api-session-controller` unter `dsh`). Deshalb
 * wird der Baum abgesucht statt `require.resolve` vom dsh-Paket aus zu rufen —
 * dessen Auflösungskette kennt die Geschwister-Verzeichnisse nicht.
 */
function dshPackage(name) {
  const harness = dshHarnessDir();
  assert.ok(harness !== null, 'der @deepseek-ai-Baum des Installats ist nicht auffindbar');
  const candidates = [join(harness, name.replace(/^@[^/]+\//, ''))];
  for (const entry of readdirSync(harness)) {
    candidates.push(join(harness, entry, 'node_modules', name));
  }
  const dir = candidates.find((candidate) => existsSync(join(candidate, 'package.json')));
  assert.ok(dir !== undefined, `${name} liegt nicht im Installat — dieser Seam-Test braucht das Paket`);
  const sourceFile = join(dir, 'lib/index.js');
  assert.ok(existsSync(sourceFile), `${name}: lib/index.js fehlt`);
  return { dir, version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, text: readFileSync(sourceFile, 'utf8') };
}

/**
 * Den Rumpf einer Methode aus dem Quelltext schneiden. Die Methoden des Loops
 * enden auf einer Zeile, die genau auf ihrer Einrueckungsebene schliesst —
 * verschachtelte Bloecke sind tiefer eingerueckt.
 */
function methodBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Methode fehlt: ${signature}`);
  const end = source.indexOf('\n\t}', start);
  assert.notEqual(end, -1, `Ende der Methode nicht gefunden: ${signature}`);
  return source.slice(start, end);
}

const count = (text, needle) => text.split(needle).length - 1;

/**
 * Die Host-Module eines Pakets: `index.js` plus die `.js`-Dateien in `assets/`.
 *
 * Der Seam-Name ist eine Konstante des Hosts, und seit dem Modulschnitt des
 * Prompters steht sie in `assets/mode-core.js` statt in `index.js`. Geprueft
 * wird deshalb ueber die Module, die das Paket wirklich mitbringt — eine feste
 * Datei waere eine Aussage ueber den Aufbau, nicht ueber den Vertrag.
 */
function hostModules(pkg) {
  const dir = join(REPO, 'packages', pkg);
  const files = [join(dir, 'index.js')];
  const assets = join(dir, 'assets');
  if (existsSync(assets)) {
    for (const entry of readdirSync(assets).sort()) {
      if (entry.endsWith('.js')) files.push(join(assets, entry));
    }
  }
  return files;
}


/**
 * Alle Host-/Client-Haelften des Installats — auch verschachtelte.
 *
 * Seit rc.2 hoisted npm nicht mehr flach: der Agent-Loop liegt unter
 * `dsh-base/node_modules`, der Session-Controller unter `dsh/node_modules`.
 * Ein Scan nur der obersten Ebene saehe 258 Dateien und **keinen** Produzenten
 * des Seams — die Aussage „genau ein waterfall" waere dann ueber den falschen
 * Baum gefallen. Dedupliziert wird ueber Name und Fassung, damit dieselbe
 * Paketfassung nicht doppelt zaehlt.
 */
function harnessHostFiles(harness) {
  const seen = new Map();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      const manifest = join(full, 'package.json');
      if (!existsSync(manifest)) {
        visit(full);
        continue;
      }
      const meta = JSON.parse(readFileSync(manifest, 'utf8'));
      seen.set(`${meta.name}@${meta.version}`, full);
      const nested = join(full, 'node_modules', '@deepseek-ai');
      if (existsSync(nested)) visit(nested);
    }
  };
  visit(harness);
  const files = [];
  for (const dir of seen.values()) {
    for (const rel of ['lib/index.js', 'lib/client.js']) {
      const file = join(dir, rel);
      if (existsSync(file)) files.push(file);
    }
  }
  return files.sort();
}

const loop = dshPackage('@deepseek-ai/dsh-agent-loop');
const controller = dshPackage('@deepseek-ai/dsh-api-session-controller');
const client = readFileSync(join(dshPackage('@deepseek-ai/dsh-client-ui-conversation').dir, 'lib/client.js'), 'utf8');

// ── 1. Die Eingangs-API hat einen einzigen Einfuegepunkt ───────────────────

test('Eingang: followup, steer und inject sind derselbe Weg', () => {
  // Eine Zeile pro Eingangsweg: welche Zielgruppe und ob der Lauf geweckt wird.
  const entryPoints = [
    { name: 'followup() — Send/Enter, neue Runde', signature: 'followup(input) {', call: 'this.send(input, "next-turn", true);' },
    { name: 'steer() — Lenken im laufenden Schritt', signature: 'steer(input) {', call: 'this.send(input, "next-step", true);' },
    { name: 'inject() — Einspeisen ohne Wecken', signature: 'inject(input) {', call: 'this.send(input, "next-step", false);' },
  ];
  for (const { name, signature, call } of entryPoints) {
    assert.ok(methodBody(loop.text, signature).includes(call), `${name}: ${call}`);
  }

  // Der gemeinsame Rumpf: GENAU ein Einfuegepunkt und kein Modellaufruf.
  const send = methodBody(loop.text, 'send(message, target, wakeup) {');
  assert.equal(count(send, 'inbox.'), 1, 'send() fasst die Inbox genau einmal an');
  assert.ok(send.includes('this.inbox.splice('), 'und zwar als splice — der Einfuegepunkt');
  assert.equal(/llm\.|\.stream\(/.test(send), false, 'der Eingang selbst ruft kein Modell');
});

test('Eingang: es gibt genau einen Konsumenten und genau einen Seam', () => {
  // Der Konsument: preStep beansprucht den Batch und dispatcht den Seam.
  assert.equal(count(loop.text, 'inbox.claim('), 1, 'genau ein inbox.claim() im Loop');
  const preStep = methodBody(loop.text, 'async preStep(target, position) {');
  assert.ok(preStep.includes('this.inbox.claim(target, position.turn)'), 'der eine Konsument ist preStep');
  assert.equal(count(preStep, 'waterfall("agent/pre-step"'), 1, 'preStep dispatcht genau einen Seam');

  // Der Seam hat im ganzen installierten Harness genau EINEN Produzenten.
  // Gesucht wird der VOLLSTÄNDIGE @deepseek-ai-Baum (dshHarnessDir), nicht
  // dshRoot(): das ist das dsh-Paket, und dessen eigener Teilbaum enthält den
  // Agent-Loop gar nicht — der Scan zählte dort 18 statt 250+ Pakete und die
  // Aussage "genau ein Produzent" wäre über den falschen Baum gefallen.
  const packages = dshHarnessDir();
  assert.ok(packages !== null, 'der @deepseek-ai-Baum des Installats ist nicht auffindbar (dshHarnessDir() ist null)');
  let files = 0;
  let waterfalls = 0;
  let listeners = 0;
  let mentions = 0;
  for (const file of harnessHostFiles(packages)) {
    files += 1;
    const text = readFileSync(file, 'utf8');
    mentions += count(text, '"agent/pre-step"');
    waterfalls += count(text, 'waterfall("agent/pre-step"');
    listeners += count(text, 'on("agent/pre-step"');
  }
  // Gemessen an 0.2.1-rc.2: 258 Dateien. Die Schwelle ist eine Untergrenze
  // gegen den falschen Baum (dshRoot() zaehlte einst 18), keine Sollzahl.
  assert.ok(files > 200, `zu wenige Dateien gescannt: ${files} in ${packages}`);
  assert.equal(waterfalls, 1, 'genau ein waterfall("agent/pre-step") im Harness');
  assert.equal(mentions, waterfalls + listeners, 'jedes weitere Vorkommen ist ein Listener, keine zweite Quelle');
  assert.ok(listeners >= 10, `erwartet viele Listener, gefunden: ${listeners}`);
});

test('Eingang: der Modellaufruf liegt hinter dem Seam und hinter der Absage', () => {
  // Die Kette des Loops: preStep -> Absage? -> step. Beide Aufrufe je genau
  // einmal, und der Schritt erst NACH der Absagepruefung.
  const turn = methodBody(loop.text, 'async turn() {');
  assert.equal(count(turn, 'await this.preStep('), 1, 'ein preStep pro Schleifendurchlauf');
  assert.equal(count(turn, 'await this.step('), 1, 'ein step pro Schleifendurchlauf');
  const reject = turn.indexOf('if (decision.kind === "reject")');
  const step = turn.indexOf('await this.step(decision)');
  assert.notEqual(reject, -1, 'die Absagepruefung fehlt');
  assert.ok(reject < step, 'der Schritt kommt erst nach der Absagepruefung');

  // Der Modellaufruf des Hauptagenten: genau eine Stelle, und sie liegt in step().
  assert.equal(count(loop.text, 'llm.stream('), 1, 'genau ein Modellaufruf im Loop');
  assert.ok(methodBody(loop.text, 'async step(decision) {').includes('llm.stream('), 'der Modellaufruf liegt in step()');
});

// ── 2. Die Oberflaeche waehlt nur den Weg, nicht den Text ──────────────────

test('Eingang: Send-Button und Enter benutzen dieselbe Uebergabe, ohne Prompt-Logik', () => {
  // Der Client waehlt nur den Zustellweg (queue/steer), nie den Text.
  assert.equal(count(client, 'async send(text) {'), 1, 'genau eine Sendefunktion im Client');
  assert.equal(count(client, 'submit(mode = "queue", source) {'), 1, 'genau eine Submit-Funktion');
  // Genau zwei Aufrufe dieser einen Funktion: der Button und die Eingabetaste.
  assert.equal(count(client, 'keyboard.submit('), 2, 'Button und Enter teilen sich submit()');
  assert.ok(client.includes('keyboard.submit(primarySubmitMode, "click")'), 'der Button geht ueber submit()');
  assert.match(client, /keyboard\.submit\(resolveSubmitMode\([^\n]*"enter"\)/, 'auch Enter geht ueber submit()');

  // Kein Modellzugriff und keine Prompt-Veredelung im Client.
  for (const forbidden of ['llm.stream', 'createUserMessage', '@deepseek-ai/dsh-agent-loop', 'agent/pre-step']) {
    assert.equal(client.includes(forbidden), false, `der Client darf ${forbidden} nicht kennen`);
  }
  assert.ok(client.includes('session.prompt('), 'der Client uebergibt ueber die Prompt-Schnittstelle');
});

test('Eingang: der Host bildet den Weg auf followup oder steer ab', () => {
  // Der einzige Prompt-Eingang des Hosts: Modus entscheidet den Weg, source
  // markiert den Menschen. Genau dieser Marker ist auch unsere Eingangspruefung.
  const prompt = methodBody(controller.text, 'async prompt(request, source) {');
  assert.ok(prompt.includes('createUserMessage({'), 'die Nachricht entsteht an genau dieser Stelle');
  assert.ok(prompt.includes('source'), 'die Herkunft kommt vom Gateway, nicht aus dem Rumpf');
  assert.ok(controller.text.includes('kind: "user"'), 'der UI-Weg ist als menschlich markiert');
  assert.ok(prompt.includes('if (request.mode === "steer") agent.steer(message);'), 'Modus steer -> steer()');
  assert.ok(prompt.includes('else agent.followup(message);'), 'sonst -> followup()');
  assert.ok(prompt.includes('admitPromptContent'), 'Anhaenge werden host-seitig zugelassen, nicht im Client');
});

// ── 3. Unsere Pakete haengen an genau diesem Seam ─────────────────────────

test('Eingang: unsere Pakete registrieren sich auf dem Seam, den der Loop dispatcht', () => {
  // Der Seam-Name wird AUS der installierten Fassung gelesen; nennt DSH ihn
  // spaeter anders, passt unsere Konstante nicht mehr und dieser Test bricht.
  const dispatched = loop.text.slice(loop.text.indexOf('waterfall("agent/pre-step"'));
  const seam = dispatched.slice(dispatched.indexOf('"') + 1, dispatched.indexOf('"', dispatched.indexOf('"') + 1));
  assert.equal(seam, 'agent/pre-step');

  for (const pkg of ['hook', 'prompter']) {
    // Genau EINE Deklaration ueber alle Host-Module des Pakets — ein zweiter Ort
    // waere eine zweite Wahrheit ueber denselben Namen, und der Wert muss der
    // Seam sein, den der installierte Loop wirklich dispatcht.
    const declarations = hostModules(pkg).flatMap((file) => readFileSync(file, 'utf8').match(/export const PRE_STEP_EVENT = '[^']*';/g) ?? []);
    assert.deepEqual(declarations, [`export const PRE_STEP_EVENT = '${seam}';`], `@shinon/${pkg}: PRE_STEP_EVENT muss genau einmal ${seam} sein`);
    // Registriert wird in der Host-Haelfte: `index.js` haengt den Listener an.
    const host = readFileSync(join(REPO, 'packages', pkg, 'index.js'), 'utf8');
    assert.ok(host.includes('ctx.on(PRE_STEP_EVENT'), `@shinon/${pkg}: muss auf dem Seam registrieren`);
  }
});

test('Eingang: der Vertrag gilt fuer die geprueffte Fassung, nicht fuer jede', () => {
  assert.equal(
    loop.version,
    VERIFIED_DSH_VERSION,
    `DSH ${loop.version} ist nicht die geprueffte Fassung (${VERIFIED_DSH_VERSION}) — die Zusagen dieses Tests muessen neu gemessen werden, statt still weiterzugelten`,
  );
});
