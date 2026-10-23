/**
 * Der Profilpatch aus geordneten Fragmenten.
 *
 * WARUM: `profiles/shinon/cordis.patch.yml` ist EIN Dokument mit 17 Eintraegen
 * und langen Begruendungen. Als ein 737-Zeilen-Block ist jede Aenderung ein
 * Konflikt mit jeder anderen; die Reihenfolge der Eintraege ist dagegen
 * bedeutungstragend (der spaetere Eintrag gewinnt, `insert`-Listen haengen an
 * ihrer Stelle). Dieses Werkzeug macht die Reihenfolge explizit: die Fragmente
 * unter `profiles/shinon/fragments/` werden in lexikographischer Reihenfolge
 * bytegleich aneinandergehaengt. Die Datei selbst bleibt das Ergebnis — wer sie
 * von Hand editiert, verliert die Aenderung beim naechsten Lauf.
 *
 * Aufruf:
 *   node scripts/profile-patch.mjs           schreibt cordis.patch.yml
 *   node scripts/profile-patch.mjs --check   Exit 1 bei Drift, schreibt nichts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const FRAGMENT_DIR = new URL('profiles/shinon/fragments/', ROOT);
const TARGET = new URL('profiles/shinon/cordis.patch.yml', ROOT);

/** Die Fragmente, in der Reihenfolge, in der sie gelten. */
export function fragmentNames() {
  return readdirSync(FRAGMENT_DIR)
    .filter((name) => name.endsWith('.yml'))
    .sort();
}

/** Der zusammengesetzte Patch — die EINE Ableitung, die auch der Check liest.
 *
 * Die Fragmente werden BYTEGLEICH aneinandergehaengt, ohne Trimmen und ohne
 * eingefuegten Trenner: die Leerzeile zwischen zwei Bloecken ist Inhalt, kein
 * Stil. Nur so ist `--check` eine echte Gleichheit und nicht eine Normalform,
 * die einen fehlenden Abstand still reparieren wuerde.
 */
export function composePatch() {
  const parts = fragmentNames().map((name) => readFileSync(join(FRAGMENT_DIR.pathname, name), 'utf8'));
  return parts.join('');
}

export function patchDrift() {
  const current = readFileSync(TARGET, 'utf8');
  const composed = composePatch();
  if (current === composed) return null;
  const currentLines = current.split('\n');
  const composedLines = composed.split('\n');
  const at = currentLines.findIndex((line, index) => line !== composedLines[index]);
  return {
    line: at === -1 ? Math.min(currentLines.length, composedLines.length) + 1 : at + 1,
    expected: composedLines[at] ?? '<EOF>',
    actual: currentLines[at] ?? '<EOF>',
  };
}

const check = process.argv.includes('--check');
const drift = patchDrift();
if (check) {
  if (drift) {
    console.error(`profile-patch: Drift ab Zeile ${drift.line}`);
    console.error(`  Soll: ${drift.expected}`);
    console.error(`  Ist:  ${drift.actual}`);
    console.error('  Repair: npm run profile:patch');
    process.exit(1);
  }
  console.log(`profile-patch: ${fragmentNames().length} Fragmente, bytegleich`);
} else {
  writeFileSync(TARGET, composePatch());
  console.log(`profile-patch: ${fragmentNames().length} Fragmente -> profiles/shinon/cordis.patch.yml`);
}
