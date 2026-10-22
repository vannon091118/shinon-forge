/**
 * diary.mjs — das Dev-Tagebuch und sein Riegel.
 *
 * Die Geschichte des Repos ist eine eigene Zustaendigkeit: sie prueft Kapitel,
 * Anker und Belege in `docs/TAGEBUCH.md`. Sie stand bis 2026-10-20 in
 * `repo.mjs`; dort haette sie den Vertrags-Datei-Eigentuemer fuer eine reine
 * Doku-Regel wachsen lassen. Richtung: `repo.mjs` kennt dieses Modul nicht.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(file, 'utf8');

/** Das Dev-Tagebuch — die erzaehlte Timeline, die sich selbst prueft. */
export const DIARY_FILE = 'docs/TAGEBUCH.md';

/** Praefixe, die als Beleg zaehlen — und deshalb im Baum existieren muessen. */
const DIARY_PATH_PREFIXES = ['packages/', 'scripts/', 'docs/', 'profiles/', 'bin/', '.github/', 'vendor/', 'assets/'];
/** Dateien im Root tragen keinen Praefix, sind aber genauso Belege. */
const DIARY_ROOT_FILES = new Set(['package.json', 'package-lock.json', 'AGENTS.md', 'README.md', 'IDEA.md', 'LICENSE']);

const diaryPath = (token) => DIARY_ROOT_FILES.has(token) || DIARY_PATH_PREFIXES.some((prefix) => token.startsWith(prefix));

/**
 * Die Commit-Tabelle als `sha datum`-Zeilen — oder der Grund, warum es sie nicht gibt.
 *
 * Ein flacher Klon und ein Baum ohne `.git` (Fixture, Tarball, Distributionsisolat)
 * koennen die Anker nicht pruefen. Das ist ein sichtbarer Skip, kein stiller Erfolg:
 * der Aufrufer meldet ihn, und in CI traegt der Static-Gate-Zweig `fetch-depth: 0`.
 */
export function diaryHistory(root = ROOT) {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (shallow === 'true') return { skip: 'flacher Klon — git log reicht nicht bis zum ersten Commit' };
    const log = execFileSync('git', ['log', '--date=short', '--pretty=%H %ad'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { log };
  } catch (error) {
    return { skip: `kein git-Log lesbar (${error.code ?? error.message})` };
  }
}

/** Kapitel als `{ title, date, body }`; `date` ist null bei den Sachkapiteln. */
function diaryChapters(text) {
  const chapters = [];
  let current = null;
  for (const line of text.split('\n')) {
    const head = /^## (.+)$/.exec(line);
    if (head) {
      current = { title: head[1].trim(), date: /^(\d{4}-\d{2}-\d{2}) — /.exec(head[1].trim())?.[1] ?? null, body: '' };
      chapters.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  return chapters;
}

/** Ein SHA im Log — exakt oder als eindeutiger Praefix (das Tagebuch darf 7 Zeichen zitieren). */
function diarySha(token, dates) {
  if (dates.has(token)) return token;
  const hits = [...dates.keys()].filter((sha) => sha.startsWith(token));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Der Riegel gegen ein verrottendes Tagebuch.
 *
 * Das Dokument ist erzaehlte Geschichte, keine Liste — deshalb prueft dieser Schritt
 * nicht die Prosa, sondern ihre Verankerung:
 *
 *   1. Fuer JEDEN Tag, an dem das Repo Commits hat, gibt es genau ein Tageskapitel.
 *   2. Jedes Tageskapitel traegt eine `**Anker:**`-Zeile mit echtem SHA (oder Bereich),
 *      und jeder genannte SHA hat genau das Datum des Kapitels.
 *   3. Jedes Kapitel nennt mindestens einen Pfad, den es heute noch gibt — „erledigt"
 *      ohne Datei ist eine Behauptung.
 *   4. Der Abschnitt „Was die Akten falsch behaupten" existiert und hat Tabellenzeilen,
 *      die je einen echten SHA und einen existierenden Pfad nennen.
 *
 * Ohne git (Fixture, Isolat) endet der Schritt leer — der Aufrufer zeigt den Skip.
 *
 * @returns {string[]} Befunde; leer heisst: die Timeline haelt.
 */
export function diaryIssues(root = ROOT, options = {}) {
  const issues = [];
  let text;
  try {
    text = read(join(root, DIARY_FILE));
  } catch {
    return [`${DIARY_FILE} fehlt`];
  }
  if (!/^> \*\*Status:\*\*/m.test(text)) issues.push(`${DIARY_FILE}: Statusblock fehlt`);

  const history = options.log === undefined ? diaryHistory(root) : { log: options.log };
  if (history.skip) return issues;

  const dates = new Map();
  for (const line of history.log.split('\n')) {
    const [sha, date] = line.trim().split(/\s+/);
    if (/^[0-9a-f]{7,40}$/.test(sha ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) dates.set(sha, date);
  }
  const days = new Set(dates.values());
  const chapters = diaryChapters(text);
  const dated = chapters.filter((chapter) => chapter.date !== null);
  const seen = new Set();

  for (const chapter of dated) {
    if (seen.has(chapter.date)) issues.push(`${chapter.date}: zweites Tageskapitel („${chapter.title}")`);
    seen.add(chapter.date);
    if (!days.has(chapter.date)) issues.push(`${chapter.date}: Kapitel ohne Commit an diesem Tag`);
    if (chapter.body.trim().length < 200) issues.push(`${chapter.date}: Kapitel ist leer (${chapter.body.trim().length} Zeichen)`);

    const anchor = chapter.body.split('\n').find((line) => line.startsWith('**Anker:**'));
    if (!anchor) {
      issues.push(`${chapter.date}: keine **Anker:**-Zeile`);
      continue;
    }
    const tokens = [...anchor.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
    let shas = 0;
    for (const token of tokens) {
      const range = /^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/.exec(token);
      if (range) {
        shas += 1;
        const [from, to] = range.slice(1).map((part) => diarySha(part, dates));
        for (const [part, sha] of [[range[1], from], [range[2], to]]) {
          if (sha === null) {
            issues.push(`${chapter.date}: Anker ${part} steht in keinem Commit`);
            continue;
          }
          if (dates.get(sha) !== chapter.date) {
            issues.push(`${chapter.date}: Anker ${part} ist vom ${dates.get(sha)}`);
          }
        }
        if (from !== null && to !== null && options.log === undefined) {
          try {
            execFileSync('git', ['merge-base', '--is-ancestor', from, to], { cwd: root, stdio: 'ignore' });
          } catch {
            issues.push(`${chapter.date}: Anker ${range[1]}..${range[2]} laeuft rueckwaerts`);
          }
        }
        continue;
      }
      if (!/^[0-9a-f]{7,40}$/.test(token)) continue;
      shas += 1;
      const sha = diarySha(token, dates);
      if (sha === null) issues.push(`${chapter.date}: Anker ${token} steht in keinem Commit`);
      else if (dates.get(sha) !== chapter.date) issues.push(`${chapter.date}: Anker ${token} ist vom ${dates.get(sha)}`);
    }
    if (shas === 0) issues.push(`${chapter.date}: Anker nennt keinen SHA`);

    const paths = tokens.filter(diaryPath);
    if (paths.length === 0) issues.push(`${chapter.date}: Anker nennt keinen Pfad`);
    for (const path of paths) {
      if (!existsSync(join(root, path))) issues.push(`${chapter.date}: Beleg ${path} existiert nicht`);
    }
  }

  for (const day of days) if (!seen.has(day)) issues.push(`${day}: kein Tageskapitel fuer einen Tag mit Commits`);

  const claims = chapters.find((chapter) => chapter.title.startsWith('Was die Akten falsch behaupten'));
  if (!claims) {
    issues.push(`Abschnitt „Was die Akten falsch behaupten" fehlt`);
  } else {
    const rows = claims.body.split('\n').filter((line) => line.startsWith('|') && !/^\|[-\s|]+\|$/.test(line) && !line.startsWith('| Behauptung'));
    if (rows.length < 6) issues.push(`„Was die Akten falsch behaupten": nur ${rows.length} Zeilen (mindestens 6)`);
    for (const row of rows) {
      const cited = [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
      const rowShas = cited.filter((token) => /^[0-9a-f]{7,40}$/.test(token));
      const rowPaths = cited.filter(diaryPath);
      if (rowShas.length === 0) issues.push(`Akten-Zeile ohne SHA: ${row.slice(0, 60)}…`);
      for (const sha of rowShas) if (diarySha(sha, dates) === null) issues.push(`Akten-Zeile nennt unbekannten SHA ${sha}`);
      // Eine Quelle darf verschwunden sein (das ist ja der Befund) — aber die Zeile
      // muss sich an MINDESTENS einem Pfad beweisen, den es heute noch gibt.
      if (!rowPaths.some((path) => existsSync(join(root, path)))) {
        issues.push(`Akten-Zeile ohne lebenden Pfad: ${row.slice(0, 60)}…`);
      }
    }
  }

  return issues;
}
