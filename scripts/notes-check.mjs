#!/usr/bin/env node
/**
 * notes-check.mjs — die Prüfung der Zettel (Zug 4).
 *
 * Liest `generated-skills/` (der Pfad steht in den Regeln, nicht hier) und
 * meldet die drei Befunde des Veredlers: zu spitz, zu breit, doppelt. Geprüft
 * wird mit DENSELBEN reinen Funktionen, die der Veredler benutzt
 * (`packages/prompter/assets/note-core.js`) — ein zweiter Prüfer wäre ein
 * zweiter Maßstab, und dann gäbe es keinen.
 * → Kanon: docs/COMMENT-KANON.md#k-c669b42ee6d9
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNote, reviewNotes } from '../packages/prompter/assets/note-core.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULES_PATH = join(ROOT, 'packages/prompter/assets/note-rules.json');

let rules;
try {
  rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
} catch (error) {
  console.error(`notes-check: Regeln nicht lesbar (${RULES_PATH}): ${error?.message ?? error}`);
  process.exit(2);
}
if (rules?.contract !== 'shinon.note-rules/v1') {
  console.error(`notes-check: fremder Vertrag ${JSON.stringify(rules?.contract)} in ${RULES_PATH}`);
  process.exit(2);
}

const extension = rules.format?.extension ?? '.json';
// Ein Argument ersetzt das Verzeichnis — kein zweiter Weg, dasselbe Prüfwerk
// an einer anderen Sammlung (so prueft der Gate-Test die Fail-Richtung an einer
// Fixture, statt sie am echten Verzeichnis zu behaupten).
const dir = process.argv[2] === undefined ? join(ROOT, rules.format?.dir ?? 'generated-skills') : resolve(process.argv[2]);

let names;
try {
  names = readdirSync(dir);
} catch (error) {
  console.error(`notes-check: Verzeichnis nicht lesbar (${dir}): ${error?.code ?? error}`);
  process.exit(2);
}

const entries = [];
const broken = [];
for (const name of names.filter((entry) => entry.endsWith(extension)).sort()) {
  let text;
  try {
    text = readFileSync(join(dir, name), 'utf8');
  } catch (error) {
    broken.push(`${name}: nicht lesbar (${error?.code ?? error})`);
    continue;
  }
  const parsed = parseNote(text, rules.format ?? {});
  if (!parsed.ok) {
    broken.push(`${name}: ${parsed.reason}`);
    continue;
  }
  entries.push({ file: name, note: parsed.note });
}

const findings = reviewNotes(entries, rules);
for (const brokenFile of broken) console.error(`❌ kein Zettel — ${brokenFile} (diese Datei laedt nie)`);
for (const finding of findings) {
  console.error(`❌ ${finding.finding} — ${finding.file} (${finding.detail})`);
}

const counts = findings.reduce((all, finding) => {
  all[finding.finding] = (all[finding.finding] ?? 0) + 1;
  return all;
}, {});
const summary = Object.entries(counts).map(([finding, count]) => `${finding}: ${count}`).join(', ');
console.log(
  findings.length === 0 && broken.length === 0
    ? `✅ Zettel: ${entries.length} geprüft, kein Befund (${dir})`
    : `⚠️  Zettel: ${entries.length} geprüft, ${broken.length} ungelesen${summary === '' ? '' : `, ${summary}`}`,
);
process.exit(findings.length === 0 && broken.length === 0 ? 0 : 1);
