/**
 * @shinon/prompter — runtime-state.js (Eigentuemer: ZUSTAND)
 *
 * Was ein Lauf weiss und was er sich merkt: der beim Mounten geladene Zustand
 * (Kontext, Regeln, Karte, Bausteine, Route, Workspace, Gedaechtnis) und die
 * drei Schreibwege, die ihn fortschreiben — Intent-Gedaechtnis, Probe-Journal
 * und der dauerhafte SALVAGED_PROSE-Stand. Hier liegen ALLE Datei- und
 * Dienstberuehrungen des Pakets; die anderen Module bekommen den Zustand
 * fertig und schreiben nichts selbst.
 *
 * Warum das ein eigenes Modul ist: Mount-Reihenfolge, Warnungstexte und die
 * Regel „ein Schreibfehler bricht den Schritt nie" sind EINE Verantwortung.
 * Vorher standen sie zwischen Lauf und Verdrahtung in `index.js` — Zeile fuer
 * Zeile Zustand, Ablauf und Verdrahtung untereinander, ohne Ort, an dem die
 * Grenze zu lesen war.
 *
 * Der Zustand ist ein EINZELNES Objekt (`runtime`), das weitergereicht wird:
 *
 *     runtime
 *       ├── Lauf            turn, trace, budget-Felder (vom Lauf gesetzt)
 *       ├── Gedaechtnis     intentMemory, intentLast, intentMemoryPath
 *       ├── Ablage          salvageState/-Counts, resolveSalvageStore
 *       ├── Bausteine       blocks, learnedPath, noteRules, skillRules
 *       └── Umgebung        context, workspace, route, capabilityMap, abortTable
 *
 * `loadRuntime` ist der einzige Erzeuger; niemand sonst legt Felder an.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { LEARNED_CONTRACT, duplicateVsBlocks, mergeLearnedBlocks, validateBlockCore, validateLearnedFile, validateProposalShell } from './block-review.js';
import { BLOCKS_CONTRACT, BLOCKS_PATH, validateRegistry } from './block-select.js';
import { decay, emptyMemory, feedback, feedbackOf, memorySummary, observe, validateMemory } from './intent-memory.js';
import { appendJsonLine, writeJsonFile } from './learned-store.js';
import { CONTEXT_STATES, INDEX_STORE_CONTRACT, INDEX_STORE_SERVICE, assertVocabulary, contextLabel } from './mode-core.js';
import { parseNote, reviewNotes } from './note-core.js';
import { loadAbortReasons, loadCapabilityMap, loadContext, loadJsonContract, loadNoteRules, loadSkillRules } from './prompt-files.js';
import { SALVAGE_CONTRACT, SALVAGE_MEMO_ID, SALVAGE_NAMESPACE, emptySalvage, salvageCountOf, validateSalvage, withSalvageCount } from './salvage-store.js';
import { readShinonMd } from './shinon-md.js';
import { fingerprintRoot, resolveWorkspaceRoot } from './workspace.js';

/**
 * Eine verworfene One-Shot-Antwort ins Probe-Journal schreiben (JSONL).
 *
 * Das Journal ist die Grundlage, um die Prosa-Rettung gegen ECHTE
 * Enhancer-Antworten zu messen statt gegen fremde Assistenten-Antworten. Ein
 * Schreibfehler darf den Schritt nie brechen; gemeldet wird er einmal.
 */
export function journalRejectedAnswer(runtime, entry) {
  if (typeof runtime.probeJournalPath !== 'string' || runtime.probeJournalPath === '') return;
  try {
    appendJsonLine(runtime.probeJournalPath, { at: new Date().toISOString(), ...entry });
  } catch (error) {
    if (!runtime.journalWarned) {
      runtime.journalWarned = true;
      console.warn(`[shinon-prompter] Probe-Journal nicht schreibbar (${error?.message}) — keine Aufzeichnung`);
    }
  }
}

/**
 * Das Intent-Gedächtnis schreiben — der EINE Schreibweg des Hosts.
 *
 * Ein Schreibfehler darf den Schritt nie brechen: das Gedächtnis ist Erfahrung,
 * kein Vertrag. Er wird EINMAL gemeldet, damit ein kaputter Pfad sichtbar bleibt.
 */
export function persistIntentMemory(runtime, path, memory) {
  if (typeof path !== 'string' || path === '' || memory === null) return;
  try {
    writeJsonFile(path, memory);
  } catch (error) {
    if (!runtime.intentWriteWarned) {
      runtime.intentWriteWarned = true;
      console.warn(`[shinon-prompter] Intent-Gedächtnis nicht schreibbar (${error?.message}) — Zählung nur im Speicher`);
    }
  }
}

/**
 * EINEN Turn ins Gedächtnis verbuchen — Beobachtung, Folge-Rückmeldung, Ablage.
 *
 * Die Rückmeldung kommt aus dem NÄCHSTEN Text derselben Sitzung: „passt" hebt
 * das vorige Pattern, „falsch" senkt es. So wird jede Interaktion Information,
 * ohne dass ein Modell befragt oder der Prompt-Text gespeichert wird.
 */
export function recordIntent(config, runtime, promptText, resolution, sessionId, promptIndex) {
  if (runtime.intentMemory === null) return;
  const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '(ohne sitzung)';
  const previous = runtime.intentLast.get(key) ?? null;
  // EIN Input, EINE Beobachtung: der Hook feuert je SCHRITT, nicht je Turn —
  // ein Werkzeug-Loop saehe denselben Text sonst zehnmal. Die Position der
  // Nachricht ist der stabile Schluessel innerhalb eines Turns; zwischen Turns
  // waechst sie. Gemessen (2026-10-18): 6 Eingaben zaehlten als 26 Laeufe.
  const sameInput = previous !== null
    && previous.index === promptIndex
    && previous.text === promptText
    && Number.isInteger(promptIndex);
  if (sameInput) return;
  const polarity = previous !== null && previous.patternId !== null && previous.patternId !== undefined
    ? feedbackOf(promptText)
    : null;

  let memory = observe(runtime.intentMemory, {
    classification: resolution.classification,
    patternId: resolution.matched ? resolution.patternId : null,
    score: resolution.score ?? 0,
    features: Array.isArray(resolution.features) ? resolution.features : [],
    // Der TEXT geht in das Gedächtnis, nicht in die Ablage: `observe` liest nur
    // die Begriffe und schreibt sie als Klassen-Zählung. Kein Prompt wird gespeichert.
    text: promptText,
  }, new Date().toISOString());
  if (polarity !== null && previous !== null) memory = feedback(memory, previous.patternId, polarity);

  runtime.intentMemory = memory;
  runtime.intentLast.set(key, {
    patternId: resolution.matched ? resolution.patternId : null,
    classification: resolution.classification,
    index: Number.isInteger(promptIndex) ? promptIndex : -1,
    text: promptText,
  });
  persistIntentMemory(runtime, runtime.intentMemoryPath, memory);
}

/**
 * Den dauerhaften SALVAGED_PROSE-Stand EINMAL holen — beim ersten Fall.
 *
 * Warum nicht im `apply`: die Mount-Reihenfolge eines Profils ist keine Zusage.
 * Der erste echte Fall liegt sicher hinter allen Mounts; davor waere „kein
 * Dienst" nur eine Vermutung. Ein fehlender Index ist kein Fehler: dann bleibt
 * der Zaehler im Prozess und es steht EINE Zeile im Log, warum.
 *
 * Die Form wird geprueft wie jede andere gespeicherte Evidenz: fremder Vertrag
 * oder unlesbare Zeilen werden nicht uebernommen, sondern gezaehlt gemeldet.
 */
function loadSalvage(runtime) {
  if (runtime.salvageLoaded) return;
  runtime.salvageLoaded = true;
  const fallback = (reason) => {
    runtime.salvageState = emptySalvage();
    runtime.salvagePersist = false;
    runtime.warnSalvage(`${reason} — SALVAGED_PROSE zaehlt je Sitzung nur im Prozess`);
  };
  // Leerer Namensraum heisst AUS (dieselbe Regel wie beim Selbstmodell der
  // Persona) — nicht "Vorgabe", sonst schaltete ein Profil ohne den Schluessel
  // die Ablage still ab und niemand saehe den Grund.
  if (runtime.salvageNamespace === '') {
    runtime.salvageState = emptySalvage();
    runtime.salvagePersist = false;
    return;
  }
  const store = runtime.resolveSalvageStore();
  if (store === null) {
    // Ein Profil OHNE Project Index ist der Normalfall, kein Fehler: der
    // Zaehler bleibt dann im Prozess, ohne dass jeder Turn eine Zeile schreibt.
    runtime.salvageState = emptySalvage();
    runtime.salvagePersist = false;
    return;
  }
  let answer;
  try {
    answer = store.load(runtime.salvageNamespace);
  } catch (error) {
    fallback(`Ablage nicht lesbar (${error?.message ?? error})`);
    return;
  }
  if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
    fallback(`Ablage nicht lesbar (${answer?.error ?? 'unbekannte Antwort'})`);
    return;
  }
  const raw = answer.state;
  if (raw === null || raw === undefined) {
    runtime.salvageState = emptySalvage();
    return;
  }
  const memos = Array.isArray(raw?.memos) ? raw.memos : [];
  const memo = memos.find((entry) => entry !== null && typeof entry === 'object' && entry.id === SALVAGE_MEMO_ID) ?? null;
  const checked = validateSalvage(memo === null ? null : memo.salvage);
  runtime.salvageState = checked.state;
  if (checked.foreign) {
    runtime.warnSalvage(`gespeicherter Stand verletzt ${SALVAGE_CONTRACT} — neu begonnen`);
    return;
  }
  if (checked.dropped > 0) {
    console.warn(`[shinon-prompter] ${checked.dropped} unlesbare SALVAGED_PROSE-Sitzungszeilen uebergangen`);
  }
}

/**
 * Den Stand schreiben — EIN Memo im eigenen Raum, keine Projektdatei.
 *
 * Der Schreibweg ist der des Project Index (`shinon_index_store`), derselbe wie
 * Scoring und Persona. Scheitert er, bleibt der Prozesszaehler gueltig; die
 * Warnung nennt den Grund einmal und wiederholt sich nicht bei jedem Turn.
 */
function persistSalvage(runtime) {
  if (runtime.salvagePersist !== true) return;
  if (runtime.salvageState === null || typeof runtime.salvageState !== 'object') return;
  const store = runtime.resolveSalvageStore();
  if (store === null) return;
  let answer;
  try {
    answer = store.save(runtime.salvageNamespace, {
      memos: [{ id: SALVAGE_MEMO_ID, salvage: runtime.salvageState }],
    });
  } catch (error) {
    runtime.warnSalvage(`Ablage nicht beschreibbar (${error?.message ?? error}) — SALVAGED_PROSE bleibt im Prozess`);
    return;
  }
  if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
    runtime.warnSalvage(`Ablage nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'}) — SALVAGED_PROSE bleibt im Prozess`);
  }
}

/**
 * Einen SALVAGED_PROSE-Fall zaehlen — je Sitzung, ueber Neustarts hinweg.
 *
 * Der Zaehler ist die Messung fuer „zu oft": Grund, Zeichenzahl und der
 * wievielte Fall reisen mit dem Datensatz. Die Zahl kommt aus der Ablage und
 * wird dort fortgeschrieben; der Map-Zaehler im Prozess bleibt die Untergrenze,
 * falls ein Schreibvorgang scheitert. Ohne Ablage ist das Verhalten exakt das
 * von vorher (je Sitzung, je Prozess) — nur mit einer Zeile im Log.
 */
export function countSalvage(runtime, sessionId, salvage) {
  const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '(ohne sitzung)';
  loadSalvage(runtime);
  const reason = typeof salvage?.reason === 'string' && salvage.reason !== '' ? salvage.reason : 'NO_JSON';
  const counts = runtime?.salvageCounts instanceof Map ? runtime.salvageCounts : null;
  const inProcess = counts === null ? 0 : (counts.get(key) ?? 0);
  const stored = salvageCountOf(runtime?.salvageState, key);
  const count = Math.max(inProcess, stored) + 1;
  if (counts !== null) counts.set(key, count);
  if (runtime?.salvageState !== null && runtime?.salvageState !== undefined) {
    runtime.salvageState = withSalvageCount(runtime.salvageState, key, reason, new Date().toISOString());
    persistSalvage(runtime);
  }
  return {
    reason,
    chars: Number.isInteger(salvage?.chars) ? salvage.chars : 0,
    answer_chars: Number.isInteger(salvage?.answerChars) ? salvage.answerChars : 0,
    count,
  };
}

/**
 * Die WIRKSAME Route des One-Shots — einmal beim Mounten entschieden (Phase 5).
 *
 * Der eigene Schluessel (Namen-Feld `providerKeyEnv`, nie ein Wert) erlaubt dem
 * One-Shot eine getrennte Route und Abrechnung. Fehlt die Variable, faellt die
 * Route auf die konfigurierte Alternative zurueck — sonst waere der Enhancer
 * tot, obwohl ein Schluessel fuer die Haupt-Route da ist. Fehlt BEIDES, giltt
 * die Primärroute: dann meldet der Enhancer `NO_ROUTE` und der Roh-Prompt gilt
 * (fail-open, unveraendert). Rein: config + Umgebung, kein Modell, kein Netz.
 */
export function effectiveRoute(config) {
  const primary = { provider: config.provider, model: config.model };
  if (typeof config.providerKeyEnv !== 'string' || config.providerKeyEnv === '') return primary;
  const ownKey = process.env[config.providerKeyEnv];
  if (typeof ownKey === 'string' && ownKey !== '') return primary;
  if (typeof config.providerFallback !== 'string' || config.providerFallback === '') return primary;
  return {
    provider: config.providerFallback,
    model: typeof config.modelFallback === 'string' && config.modelFallback !== '' ? config.modelFallback : config.model,
  };
}

/**
 * EINEN Baustein vorschlagen, prüfen, aktivieren (Phase 4) — fail-closed.
 *
 * Der Agent schlägt aus Erfahrung vor (Zettel-Hülle + Block-Kern); der Host
 * prüft die Hülle wie jeden Zettel (`parseNote` + `reviewNotes`: zu spitz mit
 * Datum/Sitzung/Absolutpfad, zu breit, doppelt) und den Kern gegen aktive
 * Bausteine (bekannte id, geteilte Begriffe plus Themenmarke). Nur was beides
 * besteht, landet in der Projekt-Ablage und mischt sich neu ein. Jeder Fehler
 * ist ein Befund, nie ein Wurf — die Aktivierung bleibt aus, statt zu raten.
 */
export function proposeBlock(config, runtime, proposal) {
  try {
    const shell = validateProposalShell(proposal);
    if (!shell.ok) return { ok: false, findings: [shell.reason] };
    const core = validateBlockCore(proposal?.block);
    if (!core.ok) return { ok: false, findings: [core.reason] };
    const active = runtime.blocks?.blocks ?? [];
    if (active.some((entry) => entry.id === core.block.id)) {
      return { ok: false, findings: [`DOPPELT:bekannte-id:${core.block.id}`] };
    }
    if (runtime.noteRules === null) return { ok: false, findings: ['KEINE_REGELN'] };
    const parsed = parseNote(
      JSON.stringify({ contract: 'shinon.skill-note/v1', version: 1, ...shell.shell }),
      runtime.noteRules.format,
    );
    if (!parsed.ok) return { ok: false, findings: [`FORM_FEHLER:${parsed.reason}`] };
    const review = reviewNotes([{ file: `vorschlag:${core.block.id}`, note: parsed.note }], runtime.noteRules);
    const findings = [
      ...review.map((finding) => `${finding.finding}: ${finding.detail}`),
      ...duplicateVsBlocks(shell.shell, active, runtime.noteRules.review?.duplicate ?? {}),
    ];
    if (findings.length > 0) return { ok: false, findings };
    const path = runtime.learnedPath;
    if (typeof path !== 'string' || path === '') {
      return { ok: false, findings: ['KEINE_ABLAGE'] };
    }
    // Dieselbe Regel wie Zettel und Skills: ein absoluter Pfad bleibt absolut.
    const file = isAbsolute(path) ? path : join(process.cwd(), path);
    let current = [];
    try {
      const checked = validateLearnedFile(JSON.parse(readFileSync(file, 'utf8')));
      if (checked.foreign || checked.dropped > 0) return { ok: false, findings: [`ABLAGE_UNGUELTIG:${checked.foreign ? 'FREMDER_VERTRAG' : checked.dropped}`] };
      current = checked.blocks;
    } catch (error) {
      if (error?.code !== 'ENOENT') return { ok: false, findings: [`ABLAGE_UNLESBAR:${error?.message ?? error}`] };
    }
    const next = [...current.filter((entry) => entry.id !== core.block.id), core.block];
    // Der eine Schreibweg (assets/learned-store.js): die Host-Komposition
    // bleibt frei von Dateisystem-Aufrufen, und die Zusage hat eine Adresse.
    writeJsonFile(file, { contract: LEARNED_CONTRACT, blocks: next });
    if (runtime.blocks !== null) {
      const merged = mergeLearnedBlocks(runtime.blocks.blocks, next);
      const check = validateRegistry({ contract: BLOCKS_CONTRACT, blocks: merged });
      if (!check.ok) return { ok: false, findings: [`ZUSAMMENFUEHRUNG_UNGUELTIG:${check.reason}`] };
      runtime.blocks = { ...runtime.blocks, blocks: merged };
    }
    console.log(`[shinon-prompter] Baustein gelernt: ${core.block.id}`);
    return { ok: true, findings: [], block: core.block.id };
  } catch (error) {
    return { ok: false, findings: [`FEHLER:${error?.message ?? error}`] };
  }
}


/**
 * Den Zustand EINES Mounts aufbauen: alles, was beim Start gelesen wird, an
 * einem Ort, mit genau einer Warnung je Defekt. Der Rueckgabewert ist das
 * Objekt, das Lauf und Verdrahtung teilen.
 *
 * Die Index-Faehigkeit wird hier bewusst NICHT geprueft: sie wird je Schritt
 * ueber `ctx.get` geholt, weil Dienste in Fiber-Reihenfolge erscheinen und ein
 * Blick beim Mounten sie faelschlich als abwesend saehe.
 */
export function loadRuntime(ctx, config) {
  let context = null;
  let contextState = 'absent';
  if (config.contextPath !== '') {
    try {
      context = loadContext(config.contextPath);
      contextState = 'loaded';
    } catch (error) {
      contextState = 'invalid';
      console.error(`[shinon-prompter] Kontext nicht verwendbar (${error?.message}) — MAX bleibt gesperrt`);
    }
  }

  // Der Zustand wird hier EINMAL gegen sein Vokabular geprueft: danach ist
  // `contextState` ein bekannter Wert, und `contextLabel` braucht keinen Fallback.
  // Die Zettel-Regeln werden EINMAL beim Mounten geladen (wie der Kontext):
  // eine fehlende Regeldatei sperrt das Lesen der Zettel, nicht den Enhancer.
  // Was sie nicht sperrt, ist ein Zettel: ohne Regeln laedt keiner.
  let noteRules = null;
  if (config.notesPath !== '') {
    try {
      noteRules = loadNoteRules();
    } catch (error) {
      console.error(`[shinon-prompter] Zettel-Regeln nicht verwendbar (${error?.message}) — es wird kein Zettel geladen`);
    }
  }

  // Die Faehigkeitskarte wird EINMAL beim Mounten geladen: sie ist eine Landkarte,
  // kein Live-Index. Ist sie defekt, bleibt der Aufgabenbrief weg und der Enhancer
  // laeuft weiter — der Grund steht im Log, nicht in einem stillen Fallback.
  const capabilityRead = loadCapabilityMap();
  if (capabilityRead.map === null) {
    console.warn(`[shinon-prompter] Faehigkeitskarte nicht verwendbar (${capabilityRead.reason}${capabilityRead.detail === undefined ? '' : `: ${capabilityRead.detail}`}) — kein Aufgabenbrief`);
    for (const issue of capabilityRead.issues) console.warn(`[shinon-prompter] Faehigkeitskarte: ${issue}`);
  }
  const capabilityMap = capabilityRead;

  // Die Abbruch-Regeln werden EINMAL geladen: sie sind DATEN, kein Code. Ein
  // neuer Grund ist ein Eintrag in `abort-reasons.json`; die Klassifikation
  // selbst liegt in `assets/abort-core.js`, nicht hier. Ein Defekt sperrt die
  // Quote, nicht den Enhancer — aber er wird gemeldet.
  const abortRead = loadAbortReasons();
  if (abortRead.table === null) {
    console.warn(`[shinon-prompter] Abbruch-Regeln nicht verwendbar (${abortRead.reason}${abortRead.detail === undefined ? '' : `: ${abortRead.detail}`}) — Abbrüche bleiben unklassifiziert`);
  }

  // Die Skill-Regeln werden ebenfalls EINMAL beim Mounten geladen. Ein fehlendes
  // .agents/skills/ ist KEIN Defekt: Skills gehören dem Projekt, nicht dem
  // Enhancer, und ein Projekt ohne Skills läuft einfach ohne Skill-Block (fail-open).
  let skillRules = null;
  if (config.skillsPath !== '') {
    try {
      skillRules = loadSkillRules();
    } catch (error) {
      console.error(`[shinon-prompter] Skill-Regeln nicht verwendbar (${error?.message}) — kein Skill wird geladen`);
    }
  }

  // S1: DIE EINE Workspace-Identität — explizite Config > Env > cwd.
  // Prompter und Project Index hängen am selben aktiven Workspace; cwd allein
  // bestimmt nie still die Projektidentität. Quelle, Pfad und Budget stehen im
  // Mount-Log und in jedem Entscheidungsdatensatz (Provenienz ohne Inhalte).
  const _ws = resolveWorkspaceRoot({ configRoot: config.workspaceRoot ?? '', env: process.env });
  const _fp = fingerprintRoot(_ws.root);
  const workspace = { ..._fp, source: _ws.source };
  console.log(`[shinon-prompter] Workspace: ${workspace.root} (id ${workspace.rootId}, quelle ${workspace.source})`);

  // SHINON.md (Pflichtblock, wenn vorhanden): die EINZIGE Anweisungsdatei aus
  // dem Projekt — gelesen, geprueft und komprimiert, wie ein Zettel, aber ohne
  // Relevanzranking: was da steht, gilt. Fehlt die Datei, laeuft der Schritt
  // ohne sie weiter (fail-open); was schiefgeht, steht im Log mit Grund.
  let shinonText = null;
  let shinonMdReason = 'SHINON_MD_AUS';
  if (typeof config.shinonMdPath === 'string' && config.shinonMdPath !== '') {
    try {
      const gelesen = readShinonMd({
        mdPath: config.shinonMdPath,
        root: workspace.root,
        warn: (message) => console.warn(`[shinon-prompter] ${message}`),
        log: (message) => console.log(`[shinon-prompter] ${message}`),
      });
      shinonMdReason = gelesen.reason;
      shinonText = gelesen.text === '' ? null : gelesen.text;
    } catch (error) {
      console.error(`[shinon-prompter] SHINON.md nicht verwendbar (${error?.message}) — kein Anweisungsblock`);
      shinonMdReason = 'SHINON_MD_UNLESBAR';
    }
  }

  // MAX-Quellen (S1): konfigurierte Datei > Project Index. Der Project Index
  // traegt den Baum ohnehin (eigener Host, eigener Dienst); ein zweiter Index
  // im Prompter waere dieselbe Arbeit mit anderem Speicherformat.

  // Intent-Patterns (Zug 8): Trigger → Expansion, nur wenn aktiviert.
  let intentRules = null;
  if (config.intentPatternsPath !== '') {
    try {
      intentRules = loadJsonContract(config.intentPatternsPath, 'shinon.intent-rules/v1', (parsed) => parsed);
      console.log(`[shinon-prompter] Intent-Patterns geladen (${intentRules.patterns.length} Patterns)`);
    } catch (error) {
      console.warn(`[shinon-prompter] Intent-Patterns nicht ladbar (${error?.message}) — keine Expansion`);
    }
  }

  assertVocabulary('context state', contextState, CONTEXT_STATES);
  // Narrative-Lage (Zug 6): der Composite der Narrative Engine kommt auf einem
  // EIGENEN Kanal. Der Prompter hält den letzten und gibt ihn in den Stand;
  // ohne Composite kein <narrative>-Element. Er interpretiert ihn nicht um.
  // Baustein-Registry (Phase 1/2): reine Daten, einmal beim Mounten geladen
  // und geprüft. Fehlt sie, fehlt die Auswahl — nicht der Enhancer (fail-open).
  let blocks = null;
  try {
    const loaded = loadJsonContract(BLOCKS_PATH, BLOCKS_CONTRACT, (parsed) => parsed);
    const check = validateRegistry(loaded);
    if (!check.ok) {
      console.error(`[shinon-prompter] Baustein-Registry unbrauchbar (${check.reason}) — ohne Auswahl`);
    } else {
      blocks = loaded;
      console.log(`[shinon-prompter] Baustein-Registry geladen (${blocks.blocks.length} Bausteine)`);
    }
  } catch (error) {
    console.warn(`[shinon-prompter] Baustein-Registry nicht ladbar (${error?.message}) — ohne Auswahl`);
  }

  // Gelernte Bausteine (Phase 4): Projekt-Ablage über der Paket-Registry.
  // Fehlt sie, steht die Registry wie ausgeliefert; ist sie kaputt, fällt sie
  // mit Zählung weg statt zu raten (fail-closed, wie überall in dieser Schicht).
  let learnedBlocks = [];
  if (typeof config.blocksLearnedPath === 'string' && config.blocksLearnedPath !== '') {
    try {
      const learnedFile = isAbsolute(config.blocksLearnedPath)
        ? config.blocksLearnedPath
        : join(process.cwd(), config.blocksLearnedPath);
      const raw = readFileSync(learnedFile, 'utf8');
      const checked = validateLearnedFile(JSON.parse(raw));
      if (checked.foreign) {
        console.warn(`[shinon-prompter] Gelernte Bausteine fremd (${config.blocksLearnedPath}) — ohne Gelernte`);
      } else {
        learnedBlocks = checked.blocks;
        if (checked.dropped > 0) {
          console.warn(`[shinon-prompter] ${checked.dropped} unlesbare gelernte Bausteine uebergangen`);
        }
        if (learnedBlocks.length > 0) console.log(`[shinon-prompter] Gelernte Bausteine geladen (${learnedBlocks.length})`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[shinon-prompter] Gelernte Bausteine nicht lesbar (${error?.message}) — ohne Gelernte`);
      }
    }
  }
  if (blocks !== null && learnedBlocks.length > 0) {
    const merged = mergeLearnedBlocks(blocks.blocks, learnedBlocks);
    const check = validateRegistry({ contract: BLOCKS_CONTRACT, blocks: merged });
    if (!check.ok) {
      console.error(`[shinon-prompter] Zusammenführung unbrauchbar (${check.reason}) — ohne Gelernte`);
    } else {
      blocks = { ...blocks, blocks: merged };
    }
  }

  // Route (Phase 5): eigener Schluessel des One-Shots, sonst Fallback — EINMAL
  // beim Mounten entschieden, nicht je Schritt (die Umgebung ist beim Start die
  // Quelle, nicht waehrend des Laufs).
  const route = effectiveRoute(config);
  const ownKeyMissing = config.providerKeyEnv !== '' && process.env[config.providerKeyEnv] === undefined && route.provider !== config.provider;
  if (ownKeyMissing) {
    console.warn(`[shinon-prompter] Eigener Schluessel fehlt (${config.providerKeyEnv}) — One-Shot faellt auf ${route.provider}/${route.model} zurueck`);
  }

  // Intent-Gedächtnis: einmal beim Mounten geladen, je Turn verbucht, nach dem
  // Turn geschrieben. Fehlt die Datei, ist das kein Fehler — der erste Lauf
  // legt sie an. Ein fremder Vertrag wird nicht übernommen (fail-closed).
  let intentMemory = null;
  let intentMemoryPath = '';
  if (typeof config.intentMemoryPath === 'string' && config.intentMemoryPath !== '') {
    intentMemoryPath = isAbsolute(config.intentMemoryPath) ? config.intentMemoryPath : join(workspace.root, config.intentMemoryPath);
    try {
      const checked = validateMemory(JSON.parse(readFileSync(intentMemoryPath, 'utf8')));
      if (checked.foreign) {
        console.warn(`[shinon-prompter] Intent-Gedächtnis fremd (${config.intentMemoryPath}) — neuer Stand`);
        intentMemory = emptyMemory(new Date().toISOString());
      } else {
        intentMemory = decay(checked.memory);
        if (checked.dropped > 0) console.warn(`[shinon-prompter] ${checked.dropped} unlesbare Intent-Einträge übergangen`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[shinon-prompter] Intent-Gedächtnis nicht lesbar (${error?.message}) — neuer Stand`);
      }
      intentMemory = emptyMemory(new Date().toISOString());
    }
  }

  // Probe-Journal (2026-10-19): die verworfenen One-Shot-Antworten, relativ zum
  // WORKSPACE — wie das Intent-Gedaechtnis. Leer = kein Journal.
  let probeJournalPath = '';
  if (typeof config.probeJournalPath === 'string' && config.probeJournalPath !== '') {
    probeJournalPath = isAbsolute(config.probeJournalPath) ? config.probeJournalPath : join(workspace.root, config.probeJournalPath);
  }
  const runtime = { context, contextState, noteRules, skillRules, capabilityMap, abortTable: abortRead.table, intentRules, intentMemory, intentMemoryPath, probeJournalPath, journalWarned: false, intentLast: new Map(), intentWriteWarned: false, turn: null, trace: [], blocks, learnedPath: config.blocksLearnedPath ?? '', route, narrative: null, workspace, lastBudgetTokens: null, lastContextChars: null, lastContextFiles: null, lastShinonText: shinonText, shinonMdReason, salvageCounts: new Map(), salvageNamespace: typeof config.salvageNamespace === 'string' ? config.salvageNamespace : SALVAGE_NAMESPACE, salvageState: null, salvageLoaded: false, salvagePersist: true, salvageWarned: false };
  // Die Ablage kommt ueber dieselbe optionale Naht wie der Kontext: `ctx.get`,
  // kein `inject` — ein Profil ohne Project Index montiert den Prompter weiter.
  // Ein ERFOLGREICH gefundener Dienst wird gemerkt; ein fehlender nicht, denn
  // er kann spaeter im Boot erscheinen (Mount-Reihenfolge ist keine Zusage).
  let salvageStore = null;
  runtime.warnSalvage = (message) => {
    if (runtime.salvageWarned) return;
    runtime.salvageWarned = true;
    console.warn(`[shinon-prompter] ${message}`);
  };
  runtime.resolveSalvageStore = () => {
    if (salvageStore !== null) return salvageStore;
    let found = null;
    try {
      found = typeof ctx?.get === 'function' ? ctx.get(INDEX_STORE_SERVICE) ?? null : null;
    } catch (error) {
      runtime.warnSalvage(`Ablage nicht abfragbar (${error?.message ?? error}) — SALVAGED_PROSE zaehlt je Sitzung nur im Prozess`);
      return null;
    }
    if (
      found !== null &&
      (found.contract !== INDEX_STORE_CONTRACT || typeof found.load !== 'function' || typeof found.save !== 'function')
    ) {
      runtime.warnSalvage(`fremder Dienst unter ${INDEX_STORE_SERVICE} (Vertrag ${String(found?.contract)}) — SALVAGED_PROSE zaehlt je Sitzung nur im Prozess`);
      return null;
    }
    salvageStore = found;
    return salvageStore;
  };
  if (intentMemory !== null) {
    const summary = memorySummary(intentMemory);
    console.log(`[shinon-prompter] Intent-Gedächtnis: ${summary.runs} Läufe, ${summary.matched} Treffer, ${summary.patterns} Patterns, ${summary.unmatched} ohne Treffer, Lexikon ${summary.terms} Begriffe (${summary.classifiedTerms} eingeordnet), ${summary.unclaimed} unbeansprucht`);
  }
  return runtime;
}
