/**
 * session-scope.js — fuer WEN die Persona in diesem Schritt spricht.
 *
 * Eigentuemer-Grenze (2026-10-23): der Sitzungs-Scope ist eine eigene Rechnung,
 * unabhaengig davon, welche Abschnitte es gibt. Er entscheidet ueber den
 * Assembly-Kontext, nicht ueber den Prozess: der Workspace kommt aus
 * `agent.session.header.cwd`, nie aus `process.cwd()`.
 *
 * GEMESSEN 2026-10-18 in `@deepseek-ai/dsh-agent-loop/lib/index.js:907`:
 * `systemPrompt.assemble(...)` laeuft VOR dem Wasserfall `agent/pre-step`. Der
 * AsyncLocalStorage aus dem Pre-Step kann die Assembly deshalb NIE erreichen —
 * der Abschnittstext wird schon vorher ausgewertet. Die Assembly uebergibt ihr
 * `context` aber an jede Textfunktion (`section.text(context)`), und darin steht
 * der Agent samt Sitzung. Das ist der belastbare Weg: der cwd kommt aus der
 * Assembly, nicht aus der Zeit.
 */
import { isAbsolute, join } from 'node:path';
import { sectionApplies } from './interaction-core.js';

/**
 * Der Workspace, für den die Persona spricht — AUSDRÜCKLICH benannt, nie geraten.
 *
 * Gemessen 2026-10-17: `process.cwd()` ist der HOST (bei `DSH_HOME=$PWD` also das
 * Shinon-Repo), nicht der Workspace der Session. Wer daraus den Projektscope
 * ableitet, injiziert Shinon-Persona in fremde Projekte. Deshalb: explizite Config
 * (`workspaceRoot`) oder `SHINON_WORKSPACE_ROOT`; fehlt beides, ist der Scope
 * UNKLAR und die Persona bleibt aus (fail-closed, nicht fail-open).
 *
 * WARUM DER ANDERE NAME: `@shinon/seams` hat die EINE Workspace-Aufloesung
 * (`resolveWorkspaceRoot`) — die faellt auf `cwd` zurueck, weil Prompter und
 * Project Index den Projektbaum BRAUCHEN. Hier ist der Rueckfall genau der
 * Fehler (fremde Persona in fremden Projekten), also ist das eine andere Regel
 * mit anderem Ergebnis. Zwei Regeln tragen nicht denselben Namen: ein Gate-Schritt
 * (`hostMirrorIssues`) macht eine zweite `resolveWorkspaceRoot`-Definition rot.
 */
export function declaredWorkspaceRoot(config) {
  const declared = typeof config.workspaceRoot === 'string' ? config.workspaceRoot.trim() : '';
  if (declared !== '') return isAbsolute(declared) ? declared : join(process.cwd(), declared);
  const fromEnv = (process.env.SHINON_WORKSPACE_ROOT ?? '').trim();
  if (fromEnv !== '') return isAbsolute(fromEnv) ? fromEnv : null;
  return null;
}

/**
 * @param {object} options
 * @param {string|null} options.declaredRoot  ausdruecklich deklarierter Root (oder null)
 * @param {boolean} options.globalIdentity    Entscheidung des Deployments (`identityScope: global`)
 * @param {object} options.sessionRoot        AsyncLocalStorage des Sitzungs-Schritts
 * @param {object} options.contract           Zustandsvertrag (fuer die Abschnitts-Gates)
 * @param {object} options.promptText         Halter des Nachrichtentexts
 * @param {() => object|null} options.getDecision  zuletzt erkannte Auftragsklasse
 */
export function createSessionScope({ declaredRoot, globalIdentity, sessionRoot, contract, promptText, getDecision }) {
  const rootOfAssembly = (assemblyCtx) => {
    const agent = assemblyCtx?.agent;
    const fromAgent = agent?.session?.header?.cwd ?? agent?.session?.cwd;
    if (typeof fromAgent === 'string' && fromAgent !== '') return fromAgent;
    const fromStore = sessionRoot.getStore()?.root;
    if (typeof fromStore === 'string' && fromStore !== '') return fromStore;
    return null;
  };
  let spokenFor = null;
  /** Spricht die Persona fuer diesen Root? Jeder zugewiesene Root ja — die
   * Persoenlichkeit ist global, nur der Projekt-Kontext bleibt je Workspace. */
  const speaksForRoot = (root) => typeof root === 'string' && root !== '';
  /** Projekt-Kontext kommt aus dem Sitzungs-Workspace — dessen eigene Datei, nie global. */
  const projectsForSession = (assemblyCtx) => {
    const root = rootOfAssembly(assemblyCtx) ?? declaredRoot ?? '';
    return typeof root === 'string' && root !== '';
  };
  const speaksForSession = (assemblyCtx) => {
    const root = rootOfAssembly(assemblyCtx);
    if (root !== null) {
      if (spokenFor !== root) {
        spokenFor = root;
        console.log(`[shinon-persona] Sitzung ${root} — Persona aktiv`);
      }
      return true;
    }
    // Ohne Sitzungsangabe (Tests, direkte Assembly) gilt die Deklaration —
    // und im globalen Deployment die Entscheidung des Deployments.
    if (globalIdentity) return true;
    return declaredRoot !== null;
  };
  // Gate: ein fachlicher Abschnitt steht nur, wenn die Nachricht seine Marken nennt (fail-open).
  const gated = (text, name = null) => (assemblyCtx) => (
    speaksForSession(assemblyCtx) && (name === null || sectionApplies(contract, name, promptText.valueFor(assemblyCtx), getDecision()?.classification ?? null)) ? text : ''
  );

  return { rootOfAssembly, speaksForRoot, projectsForSession, speaksForSession, gated };
}
