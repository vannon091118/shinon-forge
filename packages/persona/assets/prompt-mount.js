/**
 * prompt-mount.js — wie die Abschnitte der Persona an den `systemPrompt`-Dienst
 * kommen, und woher der Projekt-Kontext fuer sie kommt.
 *
 * Eigentuemer-Grenze (Schnitt 2026-10-24): `prompt-sections.js` besitzt die
 * Liste der Abschnitte und ihre Registrierung, dieser Kern besitzt den MOUNT —
 * die Pruefung des fremden Dienstes, die Lebensdauer am Fiber (`child.effect`),
 * den Projekt-Kontext (ein Cache je Montage) und die eine Logzeile. Der Eintrag
 * ruft nur noch `mountPromptSections(child, …)`.
 *
 * Der Kontext wird JE ASSEMBLY gelesen, nicht je Prozess: der Workspace ist eine
 * Eigenschaft der Sitzung, und eine gecachte Datei aus einem fremden Projekt
 * waere ein zweiter Kontext.
 */
import { readProjectContext } from './project-context.js';
import { buildSectionPlan, registerSections } from './prompt-sections.js';

export function mountPromptSections(child, {
  config,
  contract,
  persona,
  runtime,
  gated,
  projectsForSession,
  rootOfAssembly,
  declaredRoot,
  workflowText,
  tone,
  userMood,
  spricht,
  triggerText,
  onRenderTrigger = () => {},
  log = console,
}) {
  const sp = child?.systemPrompt;
  // Fail-loud statt Throw im inject-Callback: ein fremder Dienst ohne die beiden
  // Methoden wuerde hier sonst werfen, und der Fehler faellt INNERHALB des
  // Callbacks an, nicht beim Abschnitt. Kein Abschnitt ist besser als ein halb
  // registrierter Prompt.
  if (typeof sp?.getSectionOrder !== 'function' || typeof sp?.section !== 'function') {
    log.error('[shinon-persona] systemPrompt-Dienst ohne getSectionOrder/section — Abschnitte NICHT registriert');
    return null;
  }
  const atPrefix = sp.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX');
  const atSuffix = sp.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX');

  const contextPath = typeof config.projectContextPath === 'string' ? config.projectContextPath : '';
  const projectContextText = contextPath === '' ? null : (() => {
    const cache = new Map();
    return (assemblyCtx) => {
      if (!projectsForSession(assemblyCtx)) return '';
      return readProjectContext({
        contextPath,
        root: () => rootOfAssembly(assemblyCtx) || declaredRoot,
        declaredRoot,
        cache,
        warn: (message) => log.warn(`[shinon-persona] ${message}`),
        log: (message) => log.log(`[shinon-persona] ${message}`),
      });
    };
  })();

  const sections = buildSectionPlan({ atPrefix, atSuffix, config, workflowText, gated, runtime, projectContextText });
  child.effect(() => {
    const registered = registerSections(sp, sections, { gated, atPrefix, contract, persona, tone, userMood, spricht, triggerText });
    onRenderTrigger(registered.renderTrigger);
    return registered.dispose;
  });
  log.log(`[shinon-persona] ${sections.length} Prompt-Abschnitte registriert; der dynamische Zustand steht einmal im Live-Block`);
  return sections;
}
