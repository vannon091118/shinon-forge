/**
 * @shinon/prompter — schema.js
 *
 * Alle Schemastery-Schemas des Pakets: Ergebnis je Modus, MAX-Kontext, Hook-Config.
 * Schemastery ist peerDependency dieses Pakets und wird hier direkt benutzt —
 * importfrei bleiben die reinen Kerne (`note-core.js`, `index-manager.js`), nicht
 * die Vertragsformen.
 */
import z from '@deepseek-ai/schemastery';
import { INDEX_BUDGET_TOKENS, MODES, NOTES_DIR_DEFAULT, SKILLS_DIR_DEFAULT } from './mode-core.js';

/**
 * Der Resultatvertrag (Plan §7), je Modus.
 *
 * `required()` ist hier keine Formalie, sondern trägt die Sicherheit: in
 * Schemastery sind Objekt-Schlüssel **optional**, und ein fehlendes `z.array()`
 * wird still mit `[]` gefüllt (gemessen an 3.18.4). Ohne `required()` würde ein
 * Modell, das `addedRequirements` einfach weglässt, als "nichts hinzugefügt"
 * durchgehen — die Lücke sähe genau wie Compliance aus. Mit `required()` ist ein
 * fehlendes Feld ein Schemafehler und führt zum Roh-Prompt.
 *
 * Für `references` gilt genau das NUR in MAX. Das Feld gehört zum MAX-Auftrag
 * (`references.code`) und wird nur dort gelesen: `acceptance()` prüft jede
 * Referenz gegen den gelieferten Kontext. In MIN und MID bedeutet ein fehlendes
 * Feld nichts, und ein Pflichtfeld kostet dort eine sonst einwandfreie Antwort —
 * gemessen am 2026-10-08: `SCHEMA_INVALID:$.references missing required value`
 * bei `mode=MIN`, der Roh-Prompt galt. Deshalb ist die Pflicht an den Modus
 * gebunden, in dem der Wert konsumiert wird. Was bleibt: ein ANWESENDES, aber
 * falsches Feld (etwa `null`) wird in jedem Modus abgelehnt.
 *
 * `intentClassification` ist keine Empfehlung an das Modell, sondern Daten: nur
 * diese fünf Werte passieren. Eine unbekannte Klasse wird verworfen.
 */
export function resultSchema(mode) {
  return z.object({
    enhancedPrompt: z.string().min(1, 'enhancedPrompt darf nicht leer sein').required(),
    preservedIntent: z.boolean().required(),
    addedRequirements: z.array(z.string()).required(),
    removedRequirements: z.array(z.string()).required(),
    // `uncertainties` und `references` sind AUSKUNFT, keine Zusage: sie duerfen fehlen
    // und zaehlen dann als leer. Gemessen im echten Lauf: das Modell liess `references`
    // weg, und die Folge war nicht „keine Referenzen", sondern
    // `SCHEMA_INVALID:$.references missing required value` — der ganze Vorschlag fiel
    // weg, obwohl Absicht und Anforderungen unveraendert waren. Die
    // SICHERHEITSRELEVANTEN Felder oben bleiben `required()`: ein fehlendes
    // `addedRequirements` darf nicht als „nichts hinzugefuegt" durchgehen — genau
    // diese Luecke schliesst `required()` (siehe der Kommentar ueber dem Schema).
    uncertainties: z.array(z.string()).default([]),
    references: mode === 'MAX' ? z.array(z.string()).required() : z.array(z.string()).default([]),
    intentClassification: z.union([
      z.const('CHAT'),
      z.const('LOOKUP'),
      z.const('TRANSFORM'),
      z.const('MULTI_STEP_TASK'),
      z.const('LONG_RUNNING_GOAL'),
    ]).required(),
  });
}

/** Die drei Verträge, je Modus einmal gebaut — der Modus ist Daten, kein Sonderfall im Rumpf. */
export const RESULT_SCHEMAS = Object.fromEntries(MODES.map((mode) => [mode, resultSchema(mode)]));

/** Der MAX-Vertrag: die strengste Fassung, unter der dieser Export schon stand. */
export const ResultSchema = RESULT_SCHEMAS.MAX;

/**
 * Der MAX-Kontext (Plan §14/§15) als definierter Input.
 *
 * Dieser Block liefert in Phase 3 einen Dummy-Kontext; der Project Index (Phase
 * 4) füllt später dieselbe Form. Deshalb ist sie schon jetzt ein Vertrag mit
 * `required()` überall — eine halb gefüllte Struktur wäre sonst genau die
 * Lücke, die in Phase 2 aufgefallen ist.
 */
export const ContextSchema = z.object({
  project: z.string().min(1).required(),
  files: z.array(z.object({
    path: z.string().min(1).required(),
    content: z.string().required(),
  })).required(),
  symbols: z.array(z.string()).required(),
  constraints: z.array(z.string()).required(),
  touches: z.array(z.string()).required(),
  dependencies: z.array(z.string()).required(),
});


/**
 * Hook-Konfiguration (Schemastery).
 *
 * `provider`/`model` sind der Route-Schluessel des One-Shots und kommen aus dem
 * Profil, nicht aus dem Paket. Bleiben sie leer, gibt es keinen Aufrufweg — das
 * wird gemeldet (`NO_ROUTE`), nicht stillschweigend als Erfolg verbucht.
 *
 * `contextPath` ist der definierte Kontext-Input fuer MAX: eine JSON-Datei in der
 * Form von `ContextSchema`, relativ zum Paket aufgeloest. Leer heisst nicht mehr
 * „MAX gibt es nicht": dann wird der Project Index gefragt (`INDEX_SERVICE`),
 * und MAX gilt, wenn eine der beiden Quellen einen Kontext liefert. Der
 * Entscheidungsdatensatz nennt, WELCHE (`context_source`). Eine konfigurierte,
 * aber kaputte Datei sperrt MAX dagegen weiterhin (`CONTEXT_INVALID`) — eine
 * ausdrueckliche Angabe, die nicht stimmt, darf nicht stillschweigend auf eine
 * andere Quelle ausweichen.
 */
export const Config = z.object({
  /** DSH-Event-Namen, auf die sich der Enhancer registriert. */
  observeEvents: z.array(z.string()).default(['agent/pre-step']),
  /** Prompt-Modus. MAX braucht einen gelieferten Kontext. */
  mode: z.union([z.const('MIN'), z.const('MID'), z.const('MAX')]).default('MIN'),
  /** LLM-Route des One-Shot-Childs (leer = nicht konfiguriert). */
  provider: z.string().default(''),
  /** Modell des One-Shot-Childs (leer = nicht konfiguriert). */
  model: z.string().default(''),
  /** Kontext-Quelle fuer MAX (leer = kein Kontext, MAX wird abgelehnt). */
  contextPath: z.string().default(''),
  /**
   * Verzeichnis der Zettel (Zug 4), relativ zum ARBEITSVERZEICHNIS des Laufs.
   *
   * Nicht relativ zum Paket: die Zettel gehoeren dem PROJEKT, an dem gearbeitet
   * wird, nicht dem Tarball. Ein ausgerolltes Paket liegt unter `node_modules` —
   * dort schreibt kein Modell. Leer heisst: nicht lesen (dann laedt kein Zettel,
   * und der Entscheidungsdatensatz sagt das mit `notes: null`).
   */
  notesPath: z.string().default(NOTES_DIR_DEFAULT),
  /**
   * Verzeichnis der Skills (Zug 6), relativ zum ARBEITSVERZEICHNIS.
   *
   * Dieselbe Regel wie die Zettel: die Skills gehoeren dem PROJEKT, nicht dem
   * Tarball. Leer heisst: keine Skills laden (fail-open, `skills: null`).
   */
  skillsPath: z.string().default(SKILLS_DIR_DEFAULT),
  /**
   * Budget des Index-Kontexts. Der Enhancer deckelt selbst — der Wert aus dem
   * Profil gilt, das Paket hat nur einen Vorgabewert.
   */
  indexBudgetTokens: z.number().default(INDEX_BUDGET_TOKENS),
  /**
   * Obergrenze der Antwort. 0 = kein Limit (unbegrenzte Thinking-Tokens);
   * die DSH-GenerateOptions-Datei kennt kein `maxTokens: undefined`, aber
   * das Fehlen des Felds ist die saubere „kein Limit"-Form.
   */
  maxTokens: z.number().default(1200),
  /** Deterministisch: derselbe Prompt soll denselben Vorschlag ergeben. */
  temperature: z.number().default(0),
  /** Harte Obergrenze des One-Shots. Danach gilt der Roh-Prompt. */
  timeoutMs: z.number().default(15000),
  /** Entscheidungen auf `DECISION_CHANNEL` emittieren. */
  trace: z.boolean().default(true),
  /**
   * Runtime-Index aktivieren: der Prompter pflegt SEINEN EIGENEN Index
   * (hash-basiert, JSON-persistiert) statt sich auf den Project Index zu
   * verlassen. MAX nutzt ihn als Kontextquelle, wenn der Project Index nicht
   * verfuegbar ist.
   */
  autoIndex: z.boolean().default(false),
  /**
   * Verzeichnis, das bei aktiviertem `autoIndex` indiziert wird (relativ zum
   * ARBEITSVERZEICHNIS). Leer = kein Auto-Index.
   */
  indexSourcePath: z.string().default(''),
  /**
   * Pfad der Runtime-Index-Datei (relativ zum ARBEITSVERZEICHNIS). Leer =
   * kein Persistenz, Index lebt nur solange die Sitzung.
   */
  indexStoragePath: z.string().default(''),
  /**
   * Maximal dateien im Runtime-Index-Kontext. Verhindert explosionsartige
   * Kontextblöcke bei breiten Suchbegriffen.
   */
  indexMaxFiles: z.number().default(20),
  /**
   * Intent-Patterns-Datei (relativ zum Paket). Enthält Trigger → Expansion.
   * Leer = keine Intent-Erweiterung.
   */
  intentPatternsPath: z.string().default('./assets/intent-rules.json'),
});


