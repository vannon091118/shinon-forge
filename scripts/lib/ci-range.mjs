/**
 * ci-range.mjs — welcher Bereich geprüft wird, entscheidet Logik, nicht YAML.
 *
 * Der Commit-Wächter muss in CI wissen, welche Commits ein Push oder ein Pull
 * Request mitbringt. Diese Entscheidung stand früher als Shell-`if` im Workflow
 * — also genau dort, wo sie niemand testen kann. Hier ist sie eine reine
 * Funktion: Umgebung rein, Bereich raus.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-aefcb3a7af9b
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

/**
 * Die Verzweigungsbasis eines Branch-Pushes mit der Hauptlinie.
 *
 * Für einen neuen Branch ist `before` der Null-SHA und damit wertlos — aber
 * was der Push HINZUFÜGT, ist trotzdem bestimmbar: alles nach der Merge-Basis
 * mit `origin/main`. Der Klon in CI hat volle Historie (`fetch-depth: 0`),
 * also liegt sie vor. Fehlt sie (Fork ohne Hauptlinie, flacher Klon ohne
 * origin), gibt es keine Basis — dann gilt die volle Historie.
 * → Kanon: docs/COMMENT-KANON.md#k-f1100626103f
 */
function branchBase(tip, git) {
  if (!isResolvable('origin/main', git)) return null;
  try {
    const base = git(['merge-base', 'origin/main', tip]).trim();
    return base !== '' && isResolvable(base, git) ? base : null;
  } catch {
    return null;
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
    // Neuer Branch (Null-SHA als `before`) oder Force-Push auf einen
    // verschwundenen Stand: geprüft wird, was der Push HINZUFÜGT — die Spitze
    // minus der Verzweigungspunkt mit der Hauptlinie. Das ist kein Weniger:
    // die Hauptlinie selbst wurde bei ihrem eigenen Push schon geprüft, und
    // was der Branch hinzufügt, wird vollständig geprüft. (Vorher galt hier
    // die volle Historie — damit war JEDER neue Branch rot, sobald irgendwo in
    // der Vergangenheit ein Commit ohne Trailer stand, und die Schranke war
    // keine Schranke, sondern eine Mauer.) Erst wenn auch die Basis fehlt,
    // gilt weiter die volle Historie (fail-closed).
    const base = branchBase(tip, git);
    if (base !== null && base !== tip) {
      return { range: `${base}..${tip}`, why: 'neuer Branch / Force-Push: Merge-Basis mit origin/main..Spitze' };
    }
    return { range: tip, why: 'neuer Branch / Force-Push / before unbekannt — volle Historie' };
  }

  return { range: tip, why: `${eventName || 'ohne GitHub-Event'} — volle Historie (fail-closed)` };
}
