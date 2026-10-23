#!/usr/bin/env node
/**
 * Die Projekt-Anweisung als Pflichtblock — bis in den Runtime-Context.
 *
 * ANLASS (gemessen 2026-10-23, echte Sitzung `session-04a3db92` im Fremdprojekt
 * `codingmon-workspace`): der DSH lud dort `AGENTS.md` des fremden Projekts und
 * stellte es als `<system-reminder>`-Nutzer Nachricht in den Prompt — fremde
 * Anweisungen im eigenen Lauf. Gleichzeitig begann der System-Prompt mit zwei
 * englischen Saetzen (Harness-Identitaet, Modell-Prefix) vor der deutschen
 * Persona: zweisprachig statt einheitlich.
 *
 * DIE ANTWORT hat drei Teile, und dieser Test pinnt alle drei:
 *
 *   1. Der DSH laedt in diesem Profil NUR `SHINON.md` (Profilfragment
 *      `15-anweisungen.yml`): kein `AGENTS.md`, kein `CLAUDE.md`.
 *   2. Die Prompter-Seite liest dieselbe Datei beim Mounten, PRUEFT sie
 *      (lesbar, nicht leer, unter der Byte-Grenze, keine NUL-Bytes) und
 *      KOMPRIMIERT sie deterministisch (Kommentare raus, Leerzeilen falten,
 *      Ueberhang am Abschnittsende schneiden mit Markierung).
 *   3. Was vorliegt, reist als ERSTER Block im Runtime-Context (Pflicht, wenn
 *      vorhanden); was fehlt, ergibt keinen Block (fail-open, mit Grund).
 *
 * Laeuft mit `node --test`; braucht kein node_modules (der Kern ist importfrei),
 * kein `dsh` (die Profilseite wird als Text geprueft, nicht gebootet).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const kern = await import(new URL('../../../packages/prompter/assets/shinon-md.js', import.meta.url).href);
const kanal = await import(new URL('../../../packages/prompter/assets/context-channel.js', import.meta.url).href);

const arbeit = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `shinon-md-${name}-`));
  mkdirSync(dir, { recursive: true });
  return dir;
};

test('der Kern komprimiert deterministisch: Kommentare raus, Leerzeilen falten, Randraum weg', () => {
  const roh = '# Titel  \n\n\n\nText <!-- geheim -->  \nZeile zwei\n\n\n';
  assert.equal(kern.komprimiere(roh), '# Titel\n\nText\nZeile zwei');
});

test('der Kern schneidet Ueberhang am Abschnittsende und markiert den Schnitt', () => {
  const abschnitt = (n) => `## Teil ${n}\n\n${'x'.repeat(1500)}`;
  const roh = [abschnitt(1), abschnitt(2), abschnitt(3), abschnitt(4), abschnitt(5)].join('\n\n');
  assert.ok(roh.length > kern.SHINON_MD_MAX_CHARS, 'Fixture muss ueber der Grenze liegen');
  const text = kern.komprimiere(roh);
  assert.ok(text.length < roh.length, 'es wird gekuerzt');
  assert.match(text, /\[SHINON\.md gekuerzt: \d+ -> \d+ Zeichen\]/, 'der Schnitt ist markiert');
  assert.equal(text, kern.komprimiere(roh), 'zweimal dasselbe: deterministisch');
});

test('fehlende, leere und ausgeschaltete Datei ergeben keinen Block — mit benanntem Grund', () => {
  const dir = arbeit('fehlt');
  for (const [fall, args, grund] of [
    ['fehlt', { root: dir }, 'SHINON_MD_FEHLT'],
    ['aus', { root: dir, mdPath: '' }, 'SHINON_MD_AUS'],
    ['ohne-root', { root: '' }, 'SHINON_MD_KEIN_ROOT'],
  ]) {
    const gelesen = kern.readShinonMd(args);
    assert.equal(gelesen.text, '', `${fall}: kein Text`);
    assert.equal(gelesen.reason, grund, `${fall}: Grund heisst ${grund}`);
    assert.equal(kern.renderShinonBlock(gelesen.text), '', `${fall}: kein Block`);
  }
  const leerDatei = join(dir, 'SHINON.md');
  writeFileSync(leerDatei, '   \n\n');
  assert.equal(kern.readShinonMd({ root: dir }).reason, 'SHINON_MD_LEER');
});

test('eine vorhandene Datei wird geprueft, komprimiert und als Pflichtblock gerendert', () => {
  const dir = arbeit('ok');
  writeFileSync(join(dir, 'SHINON.md'), '# Anweisung\n\nDu antwortest auf Deutsch.');
  const gelesen = kern.readShinonMd({ root: dir });
  assert.equal(gelesen.reason, 'SHINON_MD_OK');
  assert.ok(gelesen.chars > 0 && gelesen.chars <= gelesen.originalChars);
  assert.equal(gelesen.gekuerzt, gelesen.chars < gelesen.originalChars);
  const block = kern.renderShinonBlock(gelesen.text);
  assert.match(block, new RegExp(`^<${kern.SHINON_MD_CONTRACT}>`));
  assert.match(block, /Du antwortest auf Deutsch\./);
});

test('eine zu grosse Datei wird gemeldet, nicht injiziert', () => {
  const dir = arbeit('gross');
  writeFileSync(join(dir, 'SHINON.md'), `# Titel\n\n${'x'.repeat(kern.SHINON_MD_MAX_BYTES)}`);
  const gemeldet = [];
  const gelesen = kern.readShinonMd({ root: dir, warn: (m) => gemeldet.push(m) });
  assert.equal(gelesen.reason, 'SHINON_MD_ZU_GROSS');
  assert.equal(gelesen.text, '');
  assert.equal(gemeldet.length, 1, 'der Befund steht im Log, nicht im Prompt');
});

test('der Runtime-Context traegt die Anweisung als ERSTEN Block — vor Wissen und Brief', () => {
  const texte = [];
  const sp = { context: (eintrag) => { texte.push(eintrag.text({})); return () => {}; } };
  kanal.registerContext(sp, {
    shinon: 'Pflichttext',
    context: () => ({ project: 'p', files: [{ path: 'a.mjs', content: 'x' }], symbols: [], touches: [], dependencies: [], constraints: [] }),
    wissen: () => '<wissen>WB</wissen>',
  });
  const text = String(texte[0]);
  const reihenfolge = [text.indexOf(kern.SHINON_MD_CONTRACT), text.indexOf('shinon.prompter/context-v1'), text.indexOf('WB')];
  assert.ok(reihenfolge.every((p) => p >= 0), 'alle drei Bloecke stehen');
  assert.ok(reihenfolge[0] < reihenfolge[1] && reihenfolge[1] < reihenfolge[2], 'Anweisung zuerst');
});

test('ohne SHINON.md bleibt der Kanal wie zuvor — kein leerer Pflichtblock', () => {
  const texte = [];
  const sp = { context: (eintrag) => { texte.push(eintrag.text({})); return () => {}; } };
  kanal.registerContext(sp, { shinon: null, context: () => null, wissen: () => null });
  assert.equal(String(texte[0]), '', 'kein Block ohne Datei');
});

/**
 * Der WIRKSAME Block: `preset-shinon`. Der Test las am 2026-10-23 zuerst den
 * Wurzel-Eintrag `agent-instructions` und war damit gruen, obwohl der Lauf den
 * Preset-Eintrag benutzte — ein Waechter vor der falschen Tuer. Der Block endet
 * am naechsten Eintrag auf Spalte 0 (`- id:`) oder am Dateiende.
 */
function presetBlock(patch) {
  const start = patch.indexOf('id: preset-shinon');
  if (start < 0) return '';
  const rest = patch.slice(start);
  const next = rest.indexOf('\n- id: ');
  return next < 0 ? rest : rest.slice(0, next);
}

test('das Profil laedt nur SHINON.md — kein AGENTS.md, kein CLAUDE.md', () => {
  const patch = readFileSync(join(ROOT, 'profiles/shinon/cordis.patch.yml'), 'utf8');
  const eintrag = presetBlock(patch);
  assert.notEqual(eintrag, '', 'preset-shinon steht im Patch');
  assert.match(eintrag, /instructionFileCandidates: \['SHINON\.md'\]/);
  assert.ok(!/AGENTS\.md/.test(eintrag), 'kein AGENTS.md in agent-instructions');
  assert.ok(!/CLAUDE\.md/.test(eintrag), 'kein CLAUDE.md in agent-instructions');
});

test('das Profil schaltet die englische Harness-Identitaet aus und setzt einen deutschen Prefix', () => {
  const patch = readFileSync(join(ROOT, 'profiles/shinon/cordis.patch.yml'), 'utf8');
  const eintrag = patch.slice(patch.indexOf('- id: system-prompt'));
  assert.match(eintrag, /includeHarnessIdentity: false/);
  assert.match(eintrag, /personaPrefix: \|/);
  const prefix = eintrag.slice(eintrag.indexOf('personaPrefix: |'));
  assert.match(prefix, /ausschliesslich auf Deutsch/);
  assert.ok(!/You are an AI agent/.test(prefix), 'kein englischer Satz im Prefix');
});

test('das Preset selbst traegt den deutschen Prefix und keine englische Identitaet', () => {
  // Der Wurzel-Eintrag `system-prompt` ist NICHT der wirksame: das Preset
  // ersetzt `persona` und `agent-instructions`. Der Test prueft deshalb den
  // Block, den der Lauf liest (Beleg: Dump mit `id: preset-shinon`).
  const patch = readFileSync(join(ROOT, 'profiles/shinon/cordis.patch.yml'), 'utf8');
  const eintrag = presetBlock(patch);
  assert.notEqual(eintrag, '', 'preset-shinon steht im Patch');
  assert.ok(!/You are a coding agent/.test(eintrag), 'kein englischer Persona-Prefix im Preset');
  assert.match(eintrag, /prefix: Du bist ein Programmier-Agent/, 'deutscher Persona-Prefix im Preset');
});
