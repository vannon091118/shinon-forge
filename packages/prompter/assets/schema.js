/**
 * @shinon/prompter — schema.js
 *
 * Alle Schemastery-Schemas des Pakets: Ergebnis je Modus, MAX-Kontext, Hook-Config.
 * Schemastery ist peerDependency dieses Pakets und wird hier direkt benutzt —
 * importfrei bleiben die reinen Kerne (`note-core.js`), nicht die Vertragsformen.
 */
import z from '@deepseek-ai/schemastery';
import { INDEX_BUDGET_TOKENS, MODES, NOTES_DIR_DEFAULT, SKILLS_DIR_DEFAULT } from './mode-core.js';
import { LEARNED_DEFAULT_PATH } from './block-review.js';
import { SALVAGE_NAMESPACE } from './salvage-store.js';

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
    // KEIN `intentClassification`: die Klasse ist Runtime-Eigentum
    // (`assets/intent-resolver.js`) und darf nicht aus einer Modellantwort
    // kommen — sonst entschiede das Modell ueber das Routing.
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
  /**
   * Name der Umgebungsvariable des EIGENEN One-Shot-Schluessels (Phase 5).
   *
   * Nur der NAME steht hier, nie ein Wert — eine Profildatei ist versioniert
   * (dieselbe Regel wie beim Key-Router). Die Route (`provider`) zeigt auf einen
   * eigenen llm-pi-ai-Eintrag mit diesem apiKeyEnv; der One-Shot laeuft damit
   * ueber einen separaten Schluessel und eine eigene Abrechnung. Leer = der
   * konfigurierte Provider traegt seinen Schluessel selbst (Zustand vor Phase 5).
   */
  providerKeyEnv: z.string().default(''),
  /**
   * Fallback-Route, wenn der eigene Schluessel fehlt (Phase 5).
   *
   * Ohne Schlüssel wäre der One-Shot tot (NO_ROUTE, Roh-Prompt) — obwohl ein
   * benutzbarer Schlüssel fuer die Haupt-Route da ist. Der Host entscheidet das
   * beim Mounten und NUR, wenn dieser Pfad gesetzt ist: ein leerer Wert laesst
   * das Verhalten unveraendert (fail-open in beide Richtungen).
   */
  providerFallback: z.string().default(''),
  /** Modell der Fallback-Route (leer = dasselbe Modell wie oben). */
  modelFallback: z.string().default(''),
  /**
   * Aktiver Workspace (S1) — DIE EINE Quelle der Projektidentität.
   * Leer = Env `SHINON_WORKSPACE_ROOT`, sonst `process.cwd()`. Wer hier einen
   * Pfad nennt, bindet Prompter, Skills und Zettel an genau diesen Ordner;
   * der Project Index bindet seine Datei an dieselbe Root.
   */
  workspaceRoot: z.string().default(''),
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
   * Skill-Lebenszyklus (Zug 7): Kandidaten aus Korrekturen und abgeschlossenen
   * Zuegen. Der Vorgabewert ist AUS: die Defaults rufen nichts auf. Wirksam wird
   * er im Profil (`profiles/shinon/cordis.patch.yml`), wo die Entscheidungen leben.
   */
  skillLifecycle: z.boolean().default(false),
  /** Kanal, auf dem der Host die Session-Ereignisse hoert (wie beim Scoring). */
  eventsChannel: z.string().default('shinon/event'),
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
  /** Harte Obergrenze des One-Shots. Danach gilt der Roh-Prompt. 0 = kein Deckel. */
  timeoutMs: z.number().default(15000),
  /**
   * Der One-Shot laeuft fuer JEDEN Schritt — auch fuer eine Frage oder ein
   * "hallo". Vorgabe ist `true` (Nutzerentscheidung 2026-10-19: der Veredler
   * soll in der Regel immer aktiv sein). `false` stellt den alten Kurzweg
   * wieder her: klare CHAT-/LOOKUP-Turns gehen ohne Modellaufruf durch.
   */
  alwaysEnhance: z.boolean().default(true),
  /**
   * Probe-Journal der VERWORFENEN One-Shot-Antworten (JSONL), relativ zum
   * WORKSPACE. Leer = kein Journal (dann bleibt nur die stderr-Zeile).
   *
   * Der Zweck ist die Messung der Prosa-Rettung gegen echte Enhancer-Antworten
   * statt gegen fremde Assistenten-Antworten. Das Journal enthaelt den
   * Nutzertext und die Antwort im Klartext und gehoert deshalb dem Projekt:
   * es liegt unter `.shinon/`, wird nicht ausgeliefert und ist gitignoriert.
   */
  probeJournalPath: z.string().default('.shinon/one-shot-journal.jsonl'),
  /** Entscheidungen auf `DECISION_CHANNEL` emittieren. */
  trace: z.boolean().default(true),
  /**
   * Intent-Patterns-Datei (relativ zum Paket). Enthält Trigger → Expansion.
   * Leer = keine Intent-Erweiterung.
   */
  intentPatternsPath: z.string().default('./assets/intent-rules.json'),
  /**
   * Ablage des Intent-Gedächtnisses (relativ zum WORKSPACE, nicht zum Host-CWD).
   * Leer = kein Gedächtnis: dann bleibt jede Gewichtung bei 1, und kein Turn
   * schreibt eine Datei. Die Zählung über alle Läufe ist Projektwissen und
   * gehört deshalb zum Projekt, nicht in den Tarball.
   */
  intentMemoryPath: z.string().default('.shinon/intent-memory.json'),
  /**
   * Namensraum des dauerhaften SALVAGED_PROSE-Zaehlers in der Ablage
   * (`shinon_index_store`). Leer = keine Persistenz; dann zaehlt der Prompter
   * nur im Prozess (das Verhalten vor 2026-10-19).
   *
   * Der Zaehler gehoert zum LAUF (Sitzung), nicht zum Workspace — deshalb ein
   * eigener Namensraum und keine Projektdatei; die Ablage ist ohnehin der eine
   * dauerhafte Ort, den dieses Profil schon fuer Scoring und Persona nutzt.
   */
  salvageNamespace: z.string().default(SALVAGE_NAMESPACE),
  /**
   * Ablage gelernter Bausteine (Phase 4), relativ zum ARBEITSVERZEICHNIS.
   *
   * Dieselbe Regel wie Zettel und Skills: Gelerntes gehört dem PROJEKT, nicht
   * dem Tarball. Leer = nicht lesen, nicht schreiben (dann bleibt die
   * Registry, wie sie ausgeliefert wurde).
   */
  blocksLearnedPath: z.string().default(LEARNED_DEFAULT_PATH),
});


