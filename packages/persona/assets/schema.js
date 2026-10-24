/**
 * @shinon/persona — schema.js
 *
 * Der Plugin-Vertrag als SCHEMA: welche Felder die Persona kennt und was ihre
 * Vorgaben sind. Eigentuemer-Grenze (Schnitt 2026-10-24): die Vorgaben sind
 * DATEN (Texte aus `assets/prompts.json`, Workflow aus `assets/workflow.js`,
 * Namensraeume aus dem Zustand), das Schema steht hier, und der Eintrag bietet
 * es als `Config` an — dieselbe Teilung wie bei `@shinon/prompter`. Der Grund
 * ist der Eigentuemer: ein paar Dutzend Zeilen Schema sind kein Verhalten.
 */
import z from '@deepseek-ai/schemastery';
import { promptText } from './prompt-text.js';
import { WORKFLOW } from './workflow.js';
import { TRIGGERS } from './interaction-core.js';
import { MEMORY_NAMESPACE, SELF_MODEL_NAMESPACE } from './persona-runtime-state.js';

const DEFAULTS = Object.freeze({
  identity: promptText('persona-identity'),
  epistemic: promptText('persona-epistemic'),
  changeClasses: promptText('persona-change-classes'),
  determinism: promptText('persona-determinism'),
  report: promptText('persona-report'),
  workaround: promptText('persona-workaround'),
  identityOverview: promptText('persona-identity-overview'),
});

export const Config = z.object({
  /** Identität + Ton. Leer = Abschnitt entfällt. */
  identity: z.string().default(DEFAULTS.identity),
  /** Epistemische Haltung (Evidenz, Widerspruch, Unsicherheit). */
  epistemic: z.string().default(DEFAULTS.epistemic),
  /** Änderungsklassen + Golden-Test-Disziplin. */
  changeClasses: z.string().default(DEFAULTS.changeClasses),
  /** Determinismus-Regeln für Seed-/RNG-Systeme. */
  determinism: z.string().default(DEFAULTS.determinism),
  /** Reportformat. */
  report: z.string().default(DEFAULTS.report),
  /** Blockiert heißt nicht Endstation — Workaround-Haltung. */
  workaround: z.string().default(DEFAULTS.workaround),
  /** Der Arbeitsablauf — LAGE, PLAN, HANDELN, PRUEFEN, BERICHTEN. */
  workflow: z.string().default(WORKFLOW),
  /** Materialübersicht fuer Selbstauskünfte. Nie die Antwort selbst. */
  identityOverview: z.string().default(DEFAULTS.identityOverview),
  /** Triggerwoerter, die eine Selbstauskunft auslösen. */
  identityTriggers: z.array(z.string()).default([...TRIGGERS]),
  /** Selbstauskunft-Übersicht dauerhaft in den Prompt legen. */
  alwaysKnowIdentity: z.boolean().default(true),
  /** Zustandsvertrag (Baseline, Übergänge, Stimmen). */
  statePath: z.string().default('./assets/persona-state.json'),
  /** Kanal, auf dem der Event-Spine seine Envelopes emittiert. */
  eventsChannel: z.string().default('shinon/event'),
  /**
   * Pfad zur Projekt-Kontextdatei (relativ zum ARBEITSVERZEICHNIS).
   *
   * Diese Datei enthält projekt-spezifische Kontextinformationen aus dem
   * Workspace der laufenden Sitzung. Sie wird als separater Abschnitt
   * injiziert — Workspace-Daten, keine Anweisung. Leer = nicht laden.
   */
  projectContextPath: z.string().default(''),
  /**
   * Der Workspace, in dessen Namen die Persona spricht (absolut oder relativ zu
   * `process.cwd()`). Leer = aus `SHINON_WORKSPACE_ROOT`, sonst unklar = keine Persona.
   */
  workspaceRoot: z.string().default(''),
  /**
   * Der Namensraum des Selbstmodells in der dauerhaften Ablage des Project
   * Index (`shinon_index_store`). Leer = kein Gedaechtnis ueber Neustarts: das
   * Modell lebt dann nur im Prozess, und die Ablage bekommt keine Zeile.
   */
  selfModelNamespace: z.string().default(SELF_MODEL_NAMESPACE),
  /**
   * Der Namensraum des Langzeitgedaechtnisses (Ereignisse, Belege, Vorschlaege).
   * Leer = kein Gedaechtnis: die Persona bleibt dann bei Identitaet und Zustand.
   */
  memoryNamespace: z.string().default(MEMORY_NAMESPACE),
  /**
   * Wo die IDENTITAET spricht: `workspace` (Vorgabe, jede zugewiesene
   * Sitzung und jeder deklarierte Boot) oder `global` (zusaetzlich auch
   * ohne jede Zuweisung — die Entscheidung des Deployments). Projekt-Kontext
   * und projektspezifische Daten bleiben in beiden Faellen am Sitzungs-
   * Workspace und werden nie global.
   */
  identityScope: z.union([z.const('workspace'), z.const('global')]).default('workspace'),
});
