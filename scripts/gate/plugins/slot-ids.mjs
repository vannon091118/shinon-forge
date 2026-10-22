/**
 * slot-ids — Slot-IDs im Browser folgen `<name>-<purpose>` (`AGENTS.md`).
 *
 * Der Riegel liest `packages/<dir>/client.js`, denn nur dort wird ein Slot
 * registriert. Geprüft werden die Felder `id` und `key` (nicht `name`: das ist
 * der DSH-Slot, in den jemand einhängt, nicht der Eintrag, den das Paket
 * besitzt). Ein Wert darf als Literal dastehen oder in einer Datei-Konstante
 * liegen — beides wird aufgelöst, sonst wäre die halbe Bake ungeprüft.
 *
 * Zwei Befunde, jede mit einem echten Fehlerbild dahinter:
 *   1. Form: ein Eintrag ohne `shinon-`-Präfix oder mit Großbuchstaben ist in
 *      `__shinonPlugins` nicht wiederzufinden und wird beim nächsten Panel
 *      stillschweigend verfehlt.
 *   2. Nicht auflösbar: ein Bezeichner, den die Datei nicht als String-Literal
 *      definiert, ist zur Prüfzeit unbekannt — fail-closed, nicht „egal".
 *
 * Was hier BEWUSST nicht geprüft wird: dieselbe ID in zwei Slots. Ein Panel
 * hängt legitim an `main` UND an `sidebar.panellist` (derselbe Eintrag, zwei
 * Plätze) — das ist eine Eigentumsfrage je Slot und steht in T2-9, nicht hier.
 *
 * Kommentare zählen nicht: `markers/client.js` zeigt in einer Erklärung, wie
 * eine Registrierung aussieht.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'slot-ids';

/** Die Form: kleingeschriebene Kebab-ID, die mit `shinon-` beginnt. */
export const SLOT_ID_FORM = /^shinon-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Der Text des ersten Arguments von `slots.register(`, klammergenau. */
function firstArgument(text, from) {
  let depth = 1;
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(from, index);
    }
  }
  return text.slice(from);
}

/** Alle `id`/`key`-Paare einer Client-Hälfte, Bezeichner aufgelöst. */
export function slotIds(text) {
  const code = withoutComments(text);
  const constants = new Map();
  for (const match of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'/g)) {
    constants.set(match[1], match[2]);
  }
  const found = [];
  for (const match of code.matchAll(/slots\.register\(/g)) {
    const argument = firstArgument(code, match.index + 'slots.register('.length);
    for (const field of argument.matchAll(/\b(id|key)\s*:\s*([^,\n}]+)/g)) {
      const raw = field[2].trim();
      if (/^'[^']*'$/.test(raw)) {
        found.push({ field: field[1], value: raw.slice(1, -1), resolved: true });
        continue;
      }
      found.push(constants.has(raw)
        ? { field: field[1], value: constants.get(raw), resolved: true }
        : { field: field[1], value: raw, resolved: false });
    }
  }
  return found;
}

export function check(ctx) {
  // `ctx.root` ist das Manifest, `ctx.repo.ROOT` der Pfad — die Verwechslung ist
  // im Gate schon einmal teuer gewesen, deshalb steht sie hier ausdrücklich.
  const root = typeof ctx.root === 'string' ? ctx.root : ctx.repo.ROOT;
  const issues = [];
  for (const pkg of ctx.packages) {
    const file = join(root, 'packages', pkg.dir, 'client.js');
    if (!existsSync(file)) continue;
    for (const slot of slotIds(readFileSync(file, 'utf8'))) {
      const where = `packages/${pkg.dir}/client.js: ${slot.field}`;
      if (!slot.resolved) {
        issues.push(`${where} ${slot.value} ist keine Zeichenkette — die Form ist zur Prüfzeit nicht entscheidbar`);
        continue;
      }
      if (!SLOT_ID_FORM.test(slot.value)) {
        issues.push(`${where} = ${slot.value} folgt nicht \`shinon-<name>-<purpose>\` (klein, mit Bindestrich)`);
      }
    }
  }
  return issues;
}
