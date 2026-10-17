#!/usr/bin/env node
/**
 * sync-idioms.mjs — der Schreiber für die generierten Plugin-Blöcke.
 *
 * Die eine Quelle ist `scripts/lib/plugin-idioms.mjs`; dieses Skript setzt ihren
 * Text in die markierten Regionen der Pakete. Von Hand geändert wird zwischen
 * den Marken nichts — wer den Baustein ändern will, ändert die Quelle und lässt
 * diesen Lauf darüber.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-55ab40e6406a
 */
import * as repo from './lib/repo.mjs';
import {
  applyIdioms,
  HALVES,
  idiomIssues,
  regionCount,
  regionFiles,
  SOURCE_FILE,
} from './lib/plugin-idioms.mjs';

const ROOT = repo.ROOT;
const CHECK = process.argv.includes('--check');
const summary = `${regionCount(ROOT)} Blöcke in ${regionFiles(ROOT).length} Dateien`;

function allIssues() {
  return HALVES.flatMap((half) => idiomIssues(ROOT, half));
}

function report(issues) {
  if (issues.length === 0) return false;
  console.error(`💥 ${issues.length} Befund(e) gegen ${SOURCE_FILE}:`);
  for (const issue of issues) console.error(`   - ${issue}`);
  return true;
}

if (CHECK) {
  const issues = allIssues();
  if (report(issues)) process.exit(1);
  console.log(`✅ ${summary} deckungsgleich mit ${SOURCE_FILE}`);
  process.exit(0);
}

const { changed, failed } = applyIdioms(ROOT);
if (failed.length) {
  report(failed);
  process.exit(1);
}
console.log(
  changed.length === 0
    ? `✅ ${summary} waren schon deckungsgleich — keine Datei angefasst`
    : `✍️  ${changed.length} Datei(en) geschrieben: ${changed.join(', ')}`,
);

const issues = allIssues();
if (report(issues)) process.exit(1);
console.log(`✅ ${summary} deckungsgleich mit ${SOURCE_FILE}`);
