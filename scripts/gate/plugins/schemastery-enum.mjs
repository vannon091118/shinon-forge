/**
 * schemastery-enum — `z.enum` gibt es im deklarierten Schemastery nicht.
 *
 * `AGENTS.md` sagt: die deklarierte Fassung hat kein `z.enum`; Modell-Enums
 * laufen als `z.union([z.const('a'), z.const('b')])`. Eine Regel ohne Riegel ist
 * ein Wunsch — dieses Plugin prüft die Host-Hälften (`packages/<dir>/index.js`),
 * denn nur dort wird der Schemastery-`z` importiert.
 *
 * ZWEI GRENZEN, die der Riegel bewusst zieht:
 *   1. Nur `index.js`. `assets/*.js` darf `zod` benutzen (`zod` hat `z.enum`);
 *      ein Treffer dort wäre ein Fehlalarm, kein Befund.
 *   2. Kommentare zählen nicht. Zwei Host-Hälften ERKLÄREN heute, warum sie kein
 *      `z.enum` benutzen — dieser Satz ist die Begründung, nicht der Verstoß.
 *      Blockkommentare werden deshalb zeichengleich durch Leerraum ersetzt, damit
 *      die gemeldete Zeilennummer die echte bleibt.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'schemastery-enum';

/** Code ohne Kommentare, mit unveränderten Zeilenumbrüchen. */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function check(ctx) {
  const issues = [];
  for (const pkg of ctx.packages) {
    const file = join(ctx.root, 'packages', pkg.dir, 'index.js');
    if (!existsSync(file)) continue;
    const lines = withoutComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (!/\bz\.enum\s*\(/.test(line)) return;
      issues.push(`packages/${pkg.dir}/index.js:${index + 1}: z.enum ist im deklarierten Schemastery nicht vorhanden — z.union([z.const('a'), z.const('b')]) verwenden`);
    });
  }
  return issues;
}
