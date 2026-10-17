#!/usr/bin/env node
/**
 * scripts/backup-retention.mjs — die Aufbewahrungsregel des Sicherungsordners.
 *
 * Warum es dieses Werkzeug gibt: eine Sicherung, die niemand aufräumt, wächst
 * unbegrenzt und wird irgendwann selbst zum Problem. Aber „aufräumen" ohne
 * Regel ist gefährlich: wer die falsche Datei löscht, merkt es erst, wenn er
 * sie braucht. Deshalb steht die Regel hier EINMAL, schriftlich, und jede
 * Anwendung protokolliert sich.
 * → Kanon: docs/COMMENT-KANON.md#k-465b4232cadc
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as paths from './lib/paths.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`💥 backup-retention: --${name} braucht einen Wert`);
    process.exit(2);
  }
  return value;
};
const has = (name) => args.includes(`--${name}`);

const USAGE = `Aufruf: node scripts/backup-retention.mjs [Optionen]
  --dir DIR        Sicherungsordner (Default <dataDir>/backup)
  --keep N         so viele der jüngsten Sicherungen bleiben (Default 5)
  --max-age TAGE   ältere Sicherungen werden entfernt (Default 30)
  --dry-run        nur zeigen, nichts löschen
  --json           Ergebnis als JSON auf stdout
  --quiet          keine Fortschrittszeilen`;

if (has('help')) {
  console.log(USAGE);
  process.exit(0);
}

const DIR = resolve(flag('dir', join(paths.dataDir(), 'backup')));
const KEEP = Number(flag('keep', '5'));
const MAX_AGE_DAYS = Number(flag('max-age', '30'));
const DRY_RUN = has('dry-run');
const JSON_OUT = has('json');
const QUIET = has('quiet');
const LOG_FILE = join(paths.logDir(), 'backup-retention.jsonl');
const POLICY_FILE = join(DIR, 'KEEP.md');
const DAY_MS = 24 * 60 * 60 * 1000;

const say = (line = '') => {
  if (!QUIET && !JSON_OUT) console.log(line);
};

if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.error('💥 backup-retention: --keep muss eine ganze Zahl ≥ 1 sein');
  process.exit(2);
}
if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS < 1) {
  console.error('💥 backup-retention: --max-age muss mindestens 1 Tag sein');
  process.exit(2);
}
if (!existsSync(DIR)) {
  console.error(`💥 backup-retention: ${DIR} existiert nicht — nichts zu tun, nichts angelegt`);
  process.exit(2);
}

/** Dateinamen, die als Sicherung zählen — alles andere ist kein Kandidat. */
const BACKUP_PATTERN = /\.(?:tar\.gz|tgz|tar|zip|sqlite|db)$/i;

const entries = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const file = join(DIR, entry.name);
    const stats = statSync(file);
    return { name: entry.name, file, bytes: stats.size, mtimeMs: stats.mtimeMs, isBackup: BACKUP_PATTERN.test(entry.name) };
  });
const backups = entries.filter((entry) => entry.isBackup).sort((a, b) => b.mtimeMs - a.mtimeMs);
const others = entries.filter((entry) => !entry.isBackup);

const now = Date.now();
const protectedNewest = backups[0] ?? null;
const ageLimitMs = now - MAX_AGE_DAYS * DAY_MS;
/** Der Plan: beides sind Obergrenzen — zu viele ODER zu alt, und die jüngste nie. */
const plan = backups
  .filter((entry) => entry.name !== protectedNewest?.name)
  .filter((entry, index) => index >= KEEP || entry.mtimeMs < ageLimitMs)
  .map((entry) => ({
    ...entry,
    reason: entry.mtimeMs < ageLimitMs ? `älter als ${MAX_AGE_DAYS} Tage` : `nicht unter den jüngsten ${KEEP}`,
  }));
const keepers = backups.filter((entry) => !plan.some((planned) => planned.name === entry.name));

say(`🗄  Sicherungsordner: ${DIR}`);
say(`   Regel: höchstens die jüngsten ${KEEP}, nichts älter als ${MAX_AGE_DAYS} Tage, jüngste Sicherung unantastbar`);
say(`   Gefunden: ${backups.length} Sicherung(en), ${others.length} andere Datei(en)`);
for (const entry of keepers) say(`   ✓ bleibt  ${entry.name}`);
for (const entry of plan) say(`   ${DRY_RUN ? '– würde' : '🗑 entfernt'}  ${entry.name} (${entry.reason}, ${(entry.bytes / 1024 / 1024).toFixed(1)} MB)`);
for (const entry of others) say(`   · unberührt ${entry.name}`);

const deleted = [];
const failures = [];
for (const entry of plan) {
  if (DRY_RUN) {
    deleted.push({ name: entry.name, bytes: entry.bytes, reason: entry.reason });
    continue;
  }
  try {
    rmSync(entry.file, { force: true });
    deleted.push({ name: entry.name, bytes: entry.bytes, reason: entry.reason });
  } catch (error) {
    failures.push({ name: entry.name, error: error.message });
  }
}

const record = {
  schemaVersion: 1,
  at: new Date().toISOString(),
  dir: DIR,
  dryRun: DRY_RUN,
  keep: KEEP,
  maxAgeDays: MAX_AGE_DAYS,
  found: backups.length,
  kept: keepers.map((entry) => ({ name: entry.name, bytes: entry.bytes, mtime: new Date(entry.mtimeMs).toISOString() })),
  deleted: deleted.map((entry) => ({ ...entry, reason: entry.reason })),
  untouched: others.map((entry) => entry.name),
  freedBytes: deleted.reduce((sum, entry) => sum + entry.bytes, 0),
  failures,
};

mkdirSync(join(DIR), { recursive: true });
writeFileSync(POLICY_FILE, policyText(record));
mkdirSync(paths.logDir(), { recursive: true });
const logLine = `${JSON.stringify(record)}\n`;
const previous = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : '';
writeFileSync(LOG_FILE, previous + logLine);

say(`\n${DRY_RUN ? '🧪 Trockenlauf' : '✅ Lauf'} — ${deleted.length} entfernt, ${keepers.length} behalten, ${(record.freedBytes / 1024 / 1024).toFixed(1)} MB frei`);
say(`   Protokoll: ${LOG_FILE}`);
say(`   Regel steht in: ${POLICY_FILE}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`   ⚠️  ${failure.name}: ${failure.error}`);
  process.exit(1);
}
if (JSON_OUT) console.log(JSON.stringify(record));
process.exit(0);

/** Die geltende Regel als Text — im Ordner, damit sie ohne Code lesbar ist. */
function policyText(entry) {
  const list = (items) => (items.length === 0 ? '_keine_' : items.map((item) => `- \`${item.name}\``).join('\n'));
  return `# Aufbewahrung im Sicherungsordner

> **Status:** generiert — geschrieben von \`scripts/backup-retention.mjs\`, nicht von Hand ändern.
> **Letzter Lauf:** ${entry.at}${entry.dryRun ? ' (Trockenlauf — nichts gelöscht)' : ''}

## Regel

1. Höchstens die **jüngsten ${entry.keep}** Sicherungen bleiben (Obergrenze der Anzahl).
2. Entfernt wird auch alles, was **älter als ${entry.maxAgeDays} Tage** ist — selbst wenn
dadurch weniger als ${entry.keep} übrig bleiben.
3. Die **jüngste Sicherung wird nie gelöscht** — auch nicht an der Altersgrenze.
4. Angefasst werden nur Archive (\`.tar.gz\`, \`.tgz\`, \`.tar\`, \`.zip\`, \`.sqlite\`, \`.db\`).
   Protokolle und Notizen bleiben liegen.
5. Jeder Lauf schreibt eine Zeile nach \`<stateDir>/logs/backup-retention.jsonl\`.

## Letzter Lauf

Behalten (${entry.kept.length}):
${list(entry.kept)}

Entfernt (${entry.deleted.length}), ${(entry.freedBytes / 1024 / 1024).toFixed(2)} MB frei:
${entry.deleted.length === 0 ? '_keine_' : entry.deleted.map((item) => `- \`${item.name}\` — ${item.reason}`).join('\n')}

Unberührt (${entry.untouched.length}): ${entry.untouched.length === 0 ? '_keine_' : entry.untouched.map((name) => `\`${name}\``).join(', ')}

Wiederherstellen aus einer Sicherung: \`tar xzf <archiv> -C <ziel>\`. Fehlt die gewünschte
Sicherung, sagt das Protokoll, wann und warum sie entfernt wurde.
`;
}
