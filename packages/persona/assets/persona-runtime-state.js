/**
 * Das Gedaechtnis der Persona — Selbstmodell und Langzeitgedaechtnis.
 *
 * WARUM DAS HIER STEHT (Schnitt 2026-10-23): der Host-Eintrag hielt zwei
 * verschiedene Eigentuemer in einer Closure — die Registrierung (Abschnitte,
 * Routen, Pruef-Naht) und diesen Zustand. Der Zustand hat seine eigene Regel:
 * EINMAL je Root laden, im Prozess halten, nach jeder Aenderung EINMAL
 * schreiben. Diese Regel steht jetzt in einer Datei; der Eintrag uebergibt nur
 * noch, was er hat, und bekommt den Zustand zurueck.
 *
 * Die Ablage ist der Project Index Store (`shinon_index_store`), denselben
 * Dienst nutzt das Scoring — die Persona schreibt in EIGENE Namensraeume. Ein
 * fremder Dienst unter dem Namen, ein fehlender Dienst oder eine unlesbare
 * Antwort schalten das Gedaechtnis NICHT still ab: es lebt dann im Prozess,
 * und der Grund steht EINMAL im Log (`warnStoreOnce`).
 *
 * Der Vertrag `shinon.persona-state/unloaded` bleibt die Vorgabe: ein leeres
 * Feld heisst "aus", ein fehlendes "Vorgabe" — der Unterschied ist der Grund,
 * warum ein Profil ohne den Schluessel nicht versehentlich das Gedaechtnis
 * abschaltet, ohne dass jemand es sieht.
 */
import {
  emptySelfModel,
  observeDecision,
  observeError,
  decaySelfModel,
  selfModelSummary,
  selfModelView,
  validateSelfModel,
} from './self-model.js';
import {
  decayMemory,
  emptyMemory,
  memoryView,
  rememberDecision,
  rememberEvent,
  renderCommitments,
  renderMemory,
  selectMemories,
  validateMemory,
} from './memory-core.js';
// Der Vorschlags-Lebenszyklus (Entstehen, Entscheiden, Widerrufen, fremde
// Einreichung) hat einen eigenen Eigentuemer; die Richtung ist EINE.
import { proposeFromMemory, proposeMemory, retractProposal } from './memory-proposals.js';
import { INDEX_STORE_SERVICE, INDEX_STORE_CONTRACT, fingerprintRoot } from '@shinon/seams/core';

/** Der Namensraum des Selbstmodells: ein Projekt, ein Stand. */
export const SELF_MODEL_NAMESPACE = 'shinon.persona-self/v1';

/**
 * Die Id des Dokuments IN der Ablage.
 *
 * Die Ablage haelt Dokumente (memos), keine freien Objekte: `save` schreibt nur
 * records/memos/scorecard/notes, alles andere faellt still weg. Das Selbstmodell
 * reist deshalb als EIN Dokument unter dieser Id — geprueft wird es trotzdem
 * gegen seinen EIGENEN Vertrag.
 */
export const SELF_MODEL_MEMO_ID = 'self-model';

/**
 * Das Langzeitgedaechtnis: eigene Ablage, eigener Namensraum.
 *
 * Nicht derselbe Raum wie das Selbstmodell: das Modell zaehlt Ausgaenge, das
 * Gedaechtnis traegt Ereignisse und Belege. Ein gemeinsames Dokument wuerde beim
 * Schreiben das jeweils andere ueberschreiben.
 */
export const MEMORY_NAMESPACE = 'shinon.persona-memory/v1';
export const MEMORY_MEMO_ID = 'memory';

/**
 * Den Zustand bauen — EINMAL je Host, alles Weitere holt der Eintrag hier ab.
 *
 * `deps` sind die Entscheidungen, die der Eintrag schon getroffen hat: welcher
 * Workspace deklariert ist, ob die Persona fuer einen Root spricht, wie die
 * Assembly ihren Workspace nennt und wie ein Aenderungs-Signal an die Panels
 * geht. Diese Datei entscheidet nichts davon selbst; sie haelt nur den Stand.
 *
 * @param {object} deps
 * @param {object} deps.config       die Schemastery-Werte des Hosts
 * @param {object} deps.ctx          der Cordis-Kontext (nur `get` fuer die Ablage)
 * @param {object} deps.sessionRoot  AsyncLocalStorage mit dem cwd des Schritts
 * @param {string|null} deps.declaredRoot  der beim Boot deklarierte Workspace
 * @param {Function} deps.speaksForRoot    spricht die Persona fuer diesen Root?
 * @param {Function} deps.speaksForSession spricht sie fuer die Assembly-Sitzung?
 * @param {Function} deps.rootOfAssembly   der Workspace aus der Assembly
 * @param {object} deps.promptText   der Text der letzten Menschen-Nachricht
 * @param {Function} deps.onChange   meldet jede Aenderung (Panels, Pruef-Stand)
 * @returns {object} die Abfragen, die der Eintrag braucht
 */
export function createPersonaRuntime(deps) {
  const {
    config,
    ctx,
    sessionRoot,
    declaredRoot,
    speaksForRoot,
    speaksForSession,
    rootOfAssembly,
    promptText,
    onChange = () => {},
  } = deps;

  // Ein Modell JE ROOT: die Ablage gehoert dem Projekt, nicht dem Prozess.
  const selfModels = new Map();

  let storeWarned = false;

  /** Die Ablage holen: EIN Dienst, EIN Vertrag — sonst kein Gedaechtnis. */
  const warnStoreOnce = (reason) => {
    if (storeWarned) return;
    storeWarned = true;
    console.warn(`[shinon-persona] Selbstmodell nur im Speicher: ${reason}`);
  };

  const resolveStore = () => {
    let found = null;
    try {
      found = typeof ctx?.get === 'function' ? ctx.get(INDEX_STORE_SERVICE) ?? null : null;
    } catch (error) {
      warnStoreOnce(`Ablage nicht abfragbar (${error?.message ?? error})`);
      return null;
    }
    if (found === null) return null;
    if (
      found.contract !== INDEX_STORE_CONTRACT ||
      typeof found.load !== 'function' ||
      typeof found.save !== 'function'
    ) {
      warnStoreOnce(`fremder Dienst unter ${INDEX_STORE_SERVICE} (Vertrag ${String(found?.contract)})`);
      return null;
    }
    return found;
  };

  // Ein FEHLENDES Feld heisst "Vorgabe", ein LEERES heisst "aus". Der
  // Unterschied zaehlt: sonst schaltete ein Profil ohne den Schluessel das
  // Gedaechtnis still ab, und niemand saehe den Grund.
  const selfModelNamespace = (root = declaredRoot) => { const base = typeof config.selfModelNamespace === 'string' ? config.selfModelNamespace : SELF_MODEL_NAMESPACE;
    return base === '' || typeof root !== 'string' || root === '' ? base : `${base}/${fingerprintRoot(root).rootId}`; };

  /** Den Stand EINMAL schreiben — dieselbe Ablage wie das Scoring, eigener Raum. */
  const persistSelfModel = (entry) => {
    if (entry.namespace === '') return;
    const store = resolveStore();
    if (store === null) {
      warnStoreOnce('kein Index-Dienst');
      return;
    }
    let answer;
    try {
      answer = store.save(entry.namespace, {
        memos: [{ id: SELF_MODEL_MEMO_ID, model: entry.model }],
      });
    } catch (error) {
      warnStoreOnce(`nicht beschreibbar (${error?.message ?? error})`);
      return;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      warnStoreOnce(`nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
  };

  /** Das Modell eines Roots laden — einmal je Root, danach aus dem Speicher. */
  const selfModelOf = (root) => {
    const known = selfModels.get(root);
    if (known !== undefined) return known;
    const namespace = selfModelNamespace(root);
    let model = emptySelfModel(new Date().toISOString());
    if (namespace !== '') {
      const store = resolveStore();
      if (store === null) warnStoreOnce('kein Index-Dienst');
      else {
        let answer;
        try {
          answer = store.load(namespace);
        } catch (error) {
          warnStoreOnce(`nicht lesbar (${error?.message ?? error})`);
        }
        const ok = answer !== null && typeof answer === 'object' && answer.ok === true;
        const memos = ok && Array.isArray(answer.state?.memos) ? answer.state.memos : [];
        const raw = memos.find((memo) => memo?.id === SELF_MODEL_MEMO_ID)?.model ?? null;
        if (raw !== null) {
          const checked = validateSelfModel(raw);
          if (checked.foreign) console.warn(`[shinon-persona] Selbstmodell fremd (${namespace}) — neuer Stand`);
          else {
            model = decaySelfModel(checked.model);
            if (checked.dropped > 0) console.warn(`[shinon-persona] ${checked.dropped} unlesbare Selbstmodell-Eintraege uebergangen`);
          }
        } else if (!ok && answer !== null && answer !== undefined) {
          warnStoreOnce(`nicht lesbar (${answer?.error ?? 'unbekannte Antwort'})`);
        }
      }
    }
    const entry = { model, namespace };
    selfModels.set(root, entry);
    const view = selfModelView(model);
    if (view !== null && view.runs > 0) {
      console.log(`[shinon-persona] Selbstmodell geladen: ${view.runs} Laeufe, ${view.limits.length} Grenzen, ${view.questions.length} offene Fragen`);
    }
    return entry;
  };

  /** EINEN Beleg verbuchen — die einzige Stelle, die das Modell veraendert. */
  const observeInto = (kind, payload) => {
    const root = sessionRoot.getStore()?.root || declaredRoot;
    if (!speaksForRoot(root)) return;
    const entry = selfModelOf(root);
    const now = new Date().toISOString();
    entry.model = kind === 'decision'
      ? observeDecision(entry.model, payload, now)
      : observeError(entry.model, payload, now);
    persistSelfModel(entry);
    onChange();
  };

  /** Der Abschnittstext: belegt, begrenzt — leer, solange nichts belegt ist. */
  const selfModelText = (assemblyCtx) => {
    if (!speaksForSession(assemblyCtx)) return '';
    const root = rootOfAssembly(assemblyCtx) || declaredRoot;
    if (typeof root !== 'string' || root === '') return '';
    if (selfModelNamespace(root) === '') return '';
    return selfModelSummary(selfModelOf(root).model) ?? '';
  };

  // ── Das Langzeitgedächtnis ────────────────────────────────────────────────
  // Ereignisse und Entscheidungen werden zu belegten Erinnerungen. Die Ablage
  // ist dieselbe wie beim Selbstmodell, der Namensraum ein eigener: ein
  // gemeinsames Dokument wuerde beim Schreiben das jeweils andere ersetzen.
  const memoryNamespace = () => (
    typeof config.memoryNamespace === 'string' ? config.memoryNamespace : MEMORY_NAMESPACE
  );
  let memoryDoc = null;
  // Die Sitzung des zuletzt gesehenen Ereignisses — das Panel kennt keine Id.
  let lastSessionId = '';
  let memoryWarned = false;
  const warnMemoryOnce = (reason) => {
    if (memoryWarned) return;
    memoryWarned = true;
    console.warn(`[shinon-persona] Gedaechtnis nur im Speicher: ${reason}`);
  };

  /** Das Gedaechtnis EINMAL laden — danach lebt es im Prozess, bis der Host endet. */
  const ensureMemory = (now = null) => {
    if (memoryDoc !== null) return memoryDoc;
    memoryDoc = emptyMemory(now);
    if (memoryNamespace() === '') return memoryDoc;
    const store = resolveStore();
    if (store === null) { warnMemoryOnce('kein Index-Dienst'); return memoryDoc; }
    let answer;
    try {
      answer = store.load(memoryNamespace());
    } catch (error) {
      warnMemoryOnce(`nicht lesbar (${error?.message ?? error})`);
      return memoryDoc;
    }
    const ok = answer !== null && typeof answer === 'object' && answer.ok === true;
    const memos = ok && Array.isArray(answer.state?.memos) ? answer.state.memos : [];
    const raw = memos.find((memo) => memo?.id === MEMORY_MEMO_ID)?.memory ?? null;
    if (raw !== null) {
      const checked = validateMemory(raw);
      if (checked.foreign) console.warn(`[shinon-persona] Gedaechtnis fremd (${memoryNamespace()}) — neuer Stand`);
      else {
        memoryDoc = decayMemory(checked.memory).memory;
        if (checked.dropped > 0) console.warn(`[shinon-persona] ${checked.dropped} unlesbare Gedaechtnis-Eintraege uebergangen`);
        const view = memoryView(memoryDoc);
        if (view !== null && view.entries > 0) {
          console.log(`[shinon-persona] Gedaechtnis geladen: ${view.entries} Erinnerungen, ${view.limits} Grenzen, ${view.proposals} offene Vorschlaege`);
        }
      }
    } else if (!ok && answer !== null && answer !== undefined) {
      warnMemoryOnce(`nicht lesbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
    return memoryDoc;
  };

  const persistMemoryDoc = () => {
    if (memoryNamespace() === '' || memoryDoc === null) return;
    const store = resolveStore();
    if (store === null) { warnMemoryOnce('kein Index-Dienst'); return; }
    let answer;
    try {
      answer = store.save(memoryNamespace(), { memos: [{ id: MEMORY_MEMO_ID, memory: memoryDoc }] });
    } catch (error) {
      warnMemoryOnce(`nicht beschreibbar (${error?.message ?? error})`);
      return;
    }
    if (answer === null || typeof answer !== 'object' || answer.ok !== true) {
      warnMemoryOnce(`nicht beschreibbar (${answer?.error ?? 'unbekannte Antwort'})`);
    }
  };

  /** EIN Ereignis oder EINE Entscheidung — die einzige Stelle, die Erinnerungen schreibt. */
  const rememberInto = (kind, record) => {
    const root = sessionRoot.getStore()?.root || declaredRoot;
    if (!speaksForRoot(root) || memoryNamespace() === '') return;
    const now = new Date().toISOString();
    const scope = typeof root === 'string' && root !== '' ? root : 'global';
    const doc = ensureMemory(now);
    const result = kind === 'decision'
      ? rememberDecision(doc, record, { scope, now })
      : rememberEvent(doc, record, { scope, now });
    if (!result.changed) return;
    // Alterung und Vorschlag gehoeren in DENSELBEN Schreibvorgang: sonst laege
    // ein Beleg ohne Alterung in der Ablage und ein Vorschlag ohne Beleg.
    const aged = decayMemory(result.memory);
    const proposed = proposeFromMemory(aged.memory, { now });
    memoryDoc = { ...proposed.memory, lastSeen: now };
    persistMemoryDoc();
    onChange();
  };

  const memoryText = (assemblyCtx) => {
    if (!speaksForSession(assemblyCtx) || memoryNamespace() === '') return '';
    const root = rootOfAssembly(assemblyCtx) || declaredRoot;
    const doc = ensureMemory(null);
    const entries = selectMemories(doc, { scope: typeof root === 'string' ? root : 'global', prompt: promptText.value() });
    return renderMemory(doc, { entries }) ?? '';
  };

  const commitmentsText = (assemblyCtx) => {
    if (!speaksForSession(assemblyCtx) || memoryNamespace() === '') return '';
    const root = rootOfAssembly(assemblyCtx) || declaredRoot;
    const scope = typeof root === 'string' && root !== '' ? root : 'global';
    return renderCommitments(ensureMemory(null), scope) ?? '';
  };

  /**
   * Ein FREMDER Vorschlag (Lernpruefer) — die Persona prueft und entscheidet.
   *
   * Der Reviewer hat kein Schreibrecht: er reicht Vorschlag, Begruendung und
   * Quellen ein, mehr nicht. Die Pruefung (Vertrag, Groesse, Duplikat,
   * Geheimnis, Kapazitaet) liegt im Kern; hier steht nur, in WESSEN Gedaechtnis
   * er faellt — der Workspace der laufenden Sitzung, nie ein globaler Topf.
   */
  const proposeInto = (payload) => {
    const root = sessionRoot.getStore()?.root || declaredRoot;
    if (!speaksForRoot(root)) return { ok: false, reason: 'FREMDER_WORKSPACE' };
    if (memoryNamespace() === '') return { ok: false, reason: 'GEDAECHTNIS_AUS' };
    const now = new Date().toISOString();
    const scope = typeof root === 'string' && root !== '' ? root : 'global';
    const result = proposeMemory(ensureMemory(now), { ...(payload ?? {}), scope }, now);
    if (!result.ok) return { ok: false, reason: result.reason, id: result.id ?? null };
    memoryDoc = { ...result.memory, lastSeen: now };
    persistMemoryDoc();
    onChange();
    return { ok: true, id: result.id, status: result.status, scope };
  };

  /** Eine angenommene Auflage zuruecknehmen — derselbe Eigentuemer, derselbe Weg. */
  const revokeInto = (id) => {
    const now = new Date().toISOString();
    const result = retractProposal(ensureMemory(now), id, now);
    if (!result.ok) return { ok: false, error: result.error };
    memoryDoc = { ...result.memory, lastSeen: now };
    persistMemoryDoc();
    onChange();
    return { ok: true, proposal: result.proposal };
  };


  return {
    /** Der Namensraum des Selbstmodells fuer diesen Root (leer = aus). */
    selfModelNamespace,
    /** Der Namensraum des Gedaechtnisses (leer = aus). */
    memoryNamespace,
    /** Der Prompt-Abschnitt des Selbstmodells — leer, solange nichts belegt ist. */
    selfModelText,
    /** Der Prompt-Abschnitt der Erinnerungen. */
    memoryText,
    /** Der Prompt-Abschnitt der uebernommenen Auflagen. */
    commitmentsText,
    /** EINEN Beleg verbuchen (Entscheidung oder Fehler). */
    observe: observeInto,
    /** Einen fremden Vorschlag pruefen und annehmen (Naht des Lernpruefers). */
    propose: proposeInto,
    /** Eine angenommene Auflage zuruecknehmen. */
    revoke: revokeInto,
    /** EIN Ereignis oder EINE Entscheidung erinnern. */
    remember: rememberInto,
    /** Das Gedaechtnis laden (einmal) und zurueckgeben. */
    memory: ensureMemory,
    /** Das Gedaechtnis ersetzen — die Pruef-Naht entscheidet, nicht der Eintrag. */
    setMemory: (memory) => { memoryDoc = memory; },
    /** Den ersetzten Stand EINMAL schreiben. */
    persistMemory: persistMemoryDoc,
    /** Was das Panel ueber Selbstmodell und Gedaechtnis sieht: Zahlen, nie Prompt-Text. */
    panel: (root) => {
      const entry = typeof root === 'string' && root !== '' ? selfModels.get(root) ?? null : null;
      const doc = ensureMemory(null);
      return {
        self: entry === null ? null : selfModelView(entry.model),
        memory: memoryView(doc),
        proposals: (doc.proposals ?? []).filter((proposal) => proposal.status === 'proposed').length,
      };
    },
    /** Die Sitzung des zuletzt gesehenen Ereignisses — das Panel kennt keine Id. */
    get lastSessionId() { return lastSessionId; },
    set lastSessionId(value) { lastSessionId = value; },
  };
}
