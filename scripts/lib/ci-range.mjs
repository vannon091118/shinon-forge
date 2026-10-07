/**
 * ci-range.mjs — welcher Bereich geprüft wird, entscheidet Logik, nicht YAML.
 *
 * Der Commit-Wächter muss in CI wissen, welche Commits ein Push oder ein Pull
 * Request mitbringt. Diese Entscheidung stand früher als Shell-`if` im Workflow
 * — also genau dort, wo sie niemand testen kann. Hier ist sie eine reine
 * Funktion: Umgebung rein, Bereich raus.
 *
 * Die eine Regel, die zählt: **dieser Resolver wird nie enger.** Kann der
 * Bereich nicht bestimmt werden (erster Push eines Branches, Force-Push,
 * flacher Klon, unbekanntes Event), ist das Ergebnis die volle Historie der
 * Spitze. Lieber zu viel geprüft als zu wenig — ein Wächter, der im Zweifel
 * weniger prüft, ist kein Wächter.
 *
 * `git` wird injiziert (Liste von Argumenten → stdout), damit die Funktion ohne
 * Repository testbar bleibt.
 */
import { existsSync, readFileSync } from 'node:fs';

/** Der Null-SHA, den GitHub bei einem neuen Branch als `before` schickt. */
export const ZERO_SHA = /^0+$/;

/** Ist diese Revision im Repository auflösbar? */
export function isResolvable(rev, git) {
  if (!rev) return false;
  try {
    git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function readEvent(env, fs) {
  if (!env.GITHUB_EVENT_PATH) return {};
  try {
    if (!fs.existsSync(env.GITHUB_EVENT_PATH)) return {};
    return JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Den Prüfbereich ableiten.
 *
 * @param {Record<string, string|undefined>} env GitHub-Umgebung.
 * @param {(args: string[]) => string} git Git-Aufruf (wirft bei Fehler).
 * @param {{ existsSync: Function, readFileSync: Function }} [fs]
 * @returns {{ range: string, why: string }} Eine Revision („volle Historie")
 *          oder ein rev-range; `why` beschreibt die Entscheidung fürs Log.
 */
export function resolveCiRange(env, git, fs = { existsSync, readFileSync }) {
  const eventName = env.GITHUB_EVENT_NAME ?? '';
  const sha = env.GITHUB_SHA ?? '';
  const tip = sha && isResolvable(sha, git) ? sha : 'HEAD';
  const event = readEvent(env, fs);

  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    const base = event?.pull_request?.base?.sha ?? '';
    const head = sha || event?.pull_request?.head?.sha || '';
    const headOk = !head || isResolvable(head, git);
    if (base && !ZERO_SHA.test(base) && isResolvable(base, git) && headOk) {
      return { range: `${base}..${head || tip}`, why: 'Pull Request: Basis..Head' };
    }
    return { range: tip, why: 'PR-Basis nicht auflösbar — volle Historie statt Teilbereich' };
  }

  if (eventName === 'push') {
    const before = event?.before ?? '';
    if (before && !ZERO_SHA.test(before) && isResolvable(before, git)) {
      return { range: `${before}..${tip}`, why: 'Push: before..after' };
    }
    return { range: tip, why: 'neuer Branch / Force-Push / before unbekannt — volle Historie' };
  }

  return { range: tip, why: `${eventName || 'ohne GitHub-Event'} — volle Historie (fail-closed)` };
}
