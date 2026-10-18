/**
 * docs-status — jede getrackte Markdown-Datei traegt den Statusblock.
 *
 * Zwei Ausnahmen, beide begruendet: `docs/archive/` traegt den Archiv-Banner
 * (historische Fassung, keine aktuelle Quelle), `vendor/` ist unveraendert
 * uebernommener Fremdtext mit sha256 im MANIFEST. Alles andere wird geprueft —
 * auch die Skills unter `.agents/`, die den Status bisher nicht trugen.
 * `ctx.root` ist das Root-MANIFEST, nicht der Pfad; der Pfad kommt aus repo.ROOT.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'docs-status';

const EXEMPT = [/^docs\/archive\//, /^vendor\//];

export function check(ctx) {
  const root = ctx.repo.ROOT;
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !EXEMPT.some((re) => re.test(file)));
  const issues = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    if (!/^> \*\*Status:\*\*/m.test(text)) {
      issues.push(`${file}: Statusblock fehlt — erwartet wird "> **Status:** <wert> — <Satz> · **Stand:** YYYY-MM-DD" unter der ersten Ueberschrift`);
    }
  }
  return issues;
}
