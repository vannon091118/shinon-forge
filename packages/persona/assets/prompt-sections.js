/**
 * prompt-sections.js — WELCHE Abschnitte die Persona in den Prompt legt.
 *
 * Eigentuemer-Grenze (2026-10-23): diese Datei besitzt die Liste (Name, Anker,
 * Text) und ihre Registrierung am System-Prompt. Sie entscheidet NICHT, ob die
 * Persona spricht (das ist `session-scope.js`) und nicht, WAS im Text steht
 * (Config, Runtime, Block-Daten).
 *
 * Die Anker sind Zahlen — `atPrefix`/`atSuffix` kommen aus dem Dienst, die
 * Zwischenwerte sind Abstaende. Sie stehen hier als EINE Liste, damit die
 * Reihenfolge an einem Ort lesbar ist statt ueber den Aufrufer verteilt.
 */
import { registerLiveContext } from './live-context.js';

/**
 * Die Abschnittsliste bauen. Reine Zusammenstellung: jeder Text ist entweder ein
 * fertiger String (wird beim Registrieren durch das Gate geschuetzt) oder eine
 * Funktion (bringt ihren Scope selbst mit).
 */
export function buildSectionPlan({ atPrefix, atSuffix, config, workflowText, gated, runtime, projectContextText = null }) {
  const sections = [
    ['shinon:identity', atPrefix, config.identity],
    ['shinon:epistemic', atPrefix + 1, config.epistemic],
    ['shinon:change-classes', 1000, gated(config.changeClasses, 'changeClasses')],
    ['shinon:determinism', 1100, gated(config.determinism, 'determinism')],
    ['shinon:workaround', 1300, config.workaround],
    ['shinon:report', atSuffix - 1, config.report],
  ];
  if (config.alwaysKnowIdentity) sections.push(['shinon:identity-overview', atPrefix + 3, config.identityOverview]);
  // Der Arbeitsablauf beschreibt, WIE gearbeitet wird — darum steht er in JEDEM Modus.
  sections.push(['shinon:workflow', atPrefix + 5, workflowText]);
  // Das Selbstmodell steht HINTER der Identitaet: gelernte Selbstkenntnis.
  if (runtime.selfModelNamespace() !== '') sections.push(['shinon:self-model', atSuffix - 6, runtime.selfModelText]);
  // Das Gedaechtnis steht VOR dem Selbstmodell: erst was ich erlebt habe, dann
  // was ich daraus belegt weiss. Beide fallen weg, wenn es nichts zu sagen gibt.
  if (runtime.memoryNamespace() !== '') {
    sections.push(['shinon:memory', atSuffix - 8, runtime.memoryText]);
    sections.push(['shinon:commitments', atSuffix - 7, runtime.commitmentsText]);
  }
  // Projekt-Kontext (Zug 9): projektspezifische Daten aus dem Sitzungs-
  // Workspace. Das Lesen mit Cache macht der Aufrufer (er kennt den Pfad).
  if (projectContextText !== null) sections.push(['shinon:project-context', atPrefix + 10, projectContextText]);
  return sections;
}

/**
 * Die Liste am Prompt registrieren und den Trigger-Abschnitt lebendig halten.
 *
 * Zurueck kommen `renderTrigger` (der Aufrufer haelt das letzte Triggerwort) und
 * `dispose` — EINE Aufraeumliste, in der Reihenfolge der Registrierung.
 */
export function registerSections(sp, sections, deps) {
  const disposers = [];
  for (const [name, order, text] of sections) {
    // Eine Funktion wird erst bei der Assembly ausgewertet und bringt ihren
    // Scope selbst mit; ein String wird durch `gated` geschuetzt.
    if (typeof text === 'function') {
      disposers.push(sp.section({ name, order, text }));
      continue;
    }
    if (typeof text !== 'string' || text.trim() === '') continue;
    disposers.push(sp.section({ name, order, text: deps.gated(text) }));
  }
  let triggerDisposer = null;
  const renderTrigger = () => {
    if (typeof triggerDisposer === 'function') triggerDisposer();
    const text = deps.triggerText();
    triggerDisposer = text === null
      ? null
      : sp.section({ name: 'shinon:identity-trigger', order: deps.atPrefix + 4, text: deps.gated(text) });
  };
  renderTrigger();

  // Der EINZIGE dynamische Zustand: eine Runtime-Context-Nachricht, die pro Schritt
  // den vorherigen Stand ERSETZT (Anti-Drift-Satz des DSH) — Stimmung, Ton, User-Lage.
  disposers.push(registerLiveContext(sp, {
    contract: deps.contract,
    state: () => deps.persona.snapshot(),
    tone: deps.tone,
    userMood: deps.userMood,
    spricht: deps.spricht,
  }));

  disposers.push(() => {
    if (typeof triggerDisposer === 'function') triggerDisposer();
  });
  return {
    renderTrigger,
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  };
}
