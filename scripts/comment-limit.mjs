#!/usr/bin/env node
/**
 * comment-limit.mjs — Kanon: kein Kommentar-Block länger als 10 LOC.
 *
 * REGEL (Claim-Matrix 3.3/3.4, 2026-10-17): 10 Zeilen Kommentar an einem Ort
 * sind genug für Warum + Wegweiser. Alles darüber ist Logik am falschen Ort
 * und gehört nach `docs/COMMENT-KANON.md` — mit Zeiger zurück.
 *
 *   node scripts/comment-limit.mjs --check   Liste aller Verstöße (Exit 1)
 * → Kanon: docs/COMMENT-KANON.md#k-6f9132cfce92
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMIT = 10;
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const KANON_REL = 'docs/COMMENT-KANON.md';
const SCOPES = ['packages', 'scripts', 'profiles', 'bin'];

const isComment = (l) => {
  const t = l.trim();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/');
};
/* Ein `*`-Schließer beendet den Lauf: Direkt danach beginnt ein neuer Block
 * (zwei JSDoc-Blöcke hintereinander sind zwei Blöcke, nicht einer — sonst landet
 * der Zeiger hinter einem `*\/` und wird zu Code). `//`-Zeilen sind ausgenommen. */
const isCloser = (l) => {
  const t = l.trim();
  return t !== '/**' && t.startsWith('*') && t.endsWith('*/');
};
/* Zäune sind Eigentum anderer Werkzeuge, keine Prosa: die Zwillings-Marken
 * liest `SOURCE_TWINS`, die Idiom-Marken `npm run idioms`. Ein Kürzen über sie
 * hinweg löscht Code — gemessen 2026-10-17: der Lauf nahm die Marke
 * `#region zwilling:letzte-menschliche-nachricht` mit, die Region fiel weg und
 * `lastHumanMessage` war nicht mehr definiert (61 rote Gate-Tests). Nur
 * `//`-Zeilen zählen: `* Marken im Ziel: …dsh-idiom…` ist Prosa, kein Zaun. */
const isFence = (l) =>
  /^\s*\/\/\s*#(region|endregion)\b/.test(l) || /^\s*\/\/\s*(>>>|<<<)\s*shinon:dsh-idiom\b/.test(l);

const isJavadoc = (block) => block.length > 0 && block[0].trim().startsWith('/**');
const slugOf = (lines) => `k-${createHash('sha1').update(lines.join('\n')).digest('hex').slice(0, 12)}`;

function collectFiles(root) {
  const out = [];
  (function walk(rel) {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const next = join(rel, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'dist', 'vendor', '.git'].includes(e.name)) continue;
        walk(next);
      } else if (/\.(mjs|js)$/.test(e.name)) out.push(next);
    }
  })('.');
  return out.filter((f) => SCOPES.some((s) => f === s || f.startsWith(s + '/'))).sort();
}

/** Alle Verstöße: Blöcke länger als `LIMIT`, Zäune und Marker nie mitgezählt. */
export function scan(root = ROOT) {
  const found = [];
  for (const file of collectFiles(root)) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    let start = -1;
    const flush = (end) => {
      if (start >= 0 && end - start > LIMIT) {
        found.push({ file, a: start, b: end - 1, len: end - start, lines: lines.slice(start, end) });
      }
      start = -1;
    };
    for (let i = 0; i <= lines.length; i++) {
      const line = i < lines.length ? lines[i] : null;
      if (line !== null && isFence(line)) { flush(i); continue; }
      const c = line !== null && isComment(line);
      if (c && start < 0) start = i;
      if (!c) flush(i);
      else if (isCloser(line)) flush(i + 1);
    }
  }
  return found;
}

function ensureKanon(root) {
  const file = join(root, KANON_REL);
  if (existsSync(file)) return { file, text: readFileSync(file, 'utf8') };
  mkdirSync(join(root, 'docs'), { recursive: true });
  const head = `# Kommentar-Kanon — der Überhang aus dem Code\n\n> **Status:** current — kanonische Ablage aller Kommentar-Blöcke, die 10 LOC überstiegen. **Stand:** 2026-10-17\n> **Regel:** \`node scripts/comment-limit.mjs --check\`. Gekürzte Blöcke tragen einen Zeiger \`→ Kanon: docs/COMMENT-KANON.md#<anker>\`; der Anker ist ein Inhalts-Hash, damit wortgleiche Spiegel denselben Zeiger bekommen.\n`;
  return { file, text: head };
}

/** Die gekürzte Fassung eines Blocks: höchstens `LIMIT` Zeilen, inklusive Zeiger. */
export function trimBlock(lines, slug) {
  const pointer = `${isJavadoc(lines) ? ' *' : '//'} → Kanon: ${KANON_REL}#${slug}`;
  if (isJavadoc(lines)) {
    // Öffner + 7 schließerfreie Inhalt + Zeiger + synthetischer Schließer = 10.
    const content = lines.slice(1).filter((l) => !isCloser(l)).slice(0, LIMIT - 3);
    return [lines[0], ...content, pointer, ' */'];
  }
  if (isCloser(lines[lines.length - 1])) {
    // Ein Lauf, der auf `*/` endet, muss eines behalten — sonst schluckt die
    // Kürzung den Blockabschluss und der Folgetext wird Kommentar.
    return [...lines.slice(0, LIMIT - 2), pointer, ' */'];
  }
  return [...lines.slice(0, LIMIT - 1), pointer];
}

/** Kürzt alle Verstöße und schreibt den Überhang in den Kanon; gibt die Zahl zurück. */
export function fixAll(root = ROOT) {
  const violations = scan(root);
  if (violations.length === 0) return 0;
  const kanon = ensureKanon(root);
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of byFile) {
    // Von unten nach oben: ein splice verschiebt nur Zeilen unterhalb der
    // Schnittstelle — höhere Blöcke zuerst hält alle tieferen Indizes gültig.
    list.sort((x, y) => y.a - x.a);
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    for (const v of list) {
      const slug = slugOf(v.lines);
      lines.splice(v.a, v.b - v.a + 1, ...trimBlock(v.lines, slug));
      const where = `${file}:${v.a + 1}–${v.b + 1}`;
      if (!kanon.text.includes(`{#${slug}}`)) {
        kanon.text += `\n## Kanon ${slug} {#${slug}}\n\nFundstellen: ${where}\n\nVolltext des gekürzten Blocks (Stand 2026-10-17):\n\n\`\`\`\n${v.lines.join('\n')}\n\`\`\`\n`;
      } else if (!kanon.text.includes(where)) {
        const anchor = `## Kanon ${slug} {#${slug}}\n\nFundstellen: `;
        kanon.text = kanon.text.replace(anchor, `${anchor}${where}, `);
      }
    }
    writeFileSync(join(root, file), lines.join('\n'));
  }
  writeFileSync(kanon.file, kanon.text);
  return violations.length;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  if (process.argv.slice(2).includes('--fix')) {
    const count = fixAll();
    console.log(count === 0 ? '✅ Kanon: nichts zu kürzen.' : `✅ Kanon: ${count} Blöcke gekürzt, Überhang in ${KANON_REL}.`);
  } else {
    const all = scan();
    if (all.length === 0) { console.log(`✅ Kanon: kein Kommentar-Block über ${LIMIT} LOC.`); process.exit(0); }
    console.error(`💥 Kanon: ${all.length} Kommentar-Blöcke über ${LIMIT} LOC:`);
    for (const v of all.slice(0, 40)) console.error(`   - ${v.file}:${v.a + 1}–${v.b + 1} (${v.len} LOC)`);
    if (all.length > 40) console.error(`   … +${all.length - 40} weitere`);
    console.error('Reparatur: node scripts/comment-limit.mjs --fix');
    process.exit(1);
  }
}
