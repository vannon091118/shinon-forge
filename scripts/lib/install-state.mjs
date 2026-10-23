/**
 * install-state.mjs — Eigentümer: Installationszustand.
 *
 * Welches Installat, welcher Stand, welche grünen Stände als Rückweg: der
 * Zustand liegt in EINER Datei und wird nur hier gelesen und geschrieben. Die
 * Datei ist Zustand, keine Quelle — Heimat ist `paths.stateDir()`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Den Zustand an EINE Config binden. `git` kommt von außen (Werkzeug), damit
 * dieser Kern keinen Prozess startet — die Prüfung „liegt der Stand im Klon?"
 * bleibt beim Aufrufer.
 */
export function createStateStore(env, { git }) {
  function readState() {
    try {
      const parsed = JSON.parse(readFileSync(env.stateFile, 'utf8'));
      return parsed.schemaVersion === env.stateVersion ? parsed : null;
    } catch {
      return null;
    }
  }
  
  function writeState(state) {
    mkdirSync(dirname(env.stateFile), { recursive: true });
    const trimmed = { ...state, history: (state.history ?? []).slice(-env.historyMax) };
    writeFileSync(env.stateFile, `${JSON.stringify(trimmed, null, 2)}\n`);
  }
  
  function emptyState() {
    return { schemaVersion: env.stateVersion, installDir: env.prefix, source: null, current: null, previous: null, greens: [], history: [], lastVerify: null };
  }
  
  /** Ein Stand hat die Abnahme bestanden — er wird zum Rückweg-Kandidaten. */
  function noteGreen(state, sha) {
    if (sha == null) return;
    const greens = (state.greens ?? []).filter((entry) => entry !== sha);
    greens.push(sha);
    state.greens = greens.slice(-10);
  }
  
  /** Der jüngste grüne Stand, der nicht der gescheiterte ist und im Klon liegt. */
  function lastGreen(state, failedSha) {
    const greens = [...(state.greens ?? [])].reverse();
    if (state.current?.verified === true && state.current.sha !== failedSha) greens.unshift(state.current.sha);
    for (const sha of greens) {
      if (sha === failedSha) continue;
      const exists = git(['cat-file', '-e', `${sha}^{commit}`], env.prefix, { allowFail: true });
      if (exists.status === 0) return sha;
    }
    return null;
  }
  
  /* ---------------------------------------------------------------- Umgebung */
  

  return { readState, writeState, emptyState, noteGreen, lastGreen };
}
