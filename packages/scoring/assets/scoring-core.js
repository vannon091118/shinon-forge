/**
 * @shinon/scoring — reiner Kern (assets/scoring-core.js).
 *
 * KEINE Bare- und keine node:-Imports: nur dann läuft der Replay-Test in CI ohne
 * node_modules — dieselbe Regel wie bei `@shinon/events` (Vertrag als Daten) und
 * `@shinon/codingmon` (assets/mechanik.js). Ein relativer Import auf den
 * Schwesterkern `assets/signal-translate.js` ist erlaubt (er ist genauso rein).
 * `index.js` re-exportiert beide Kerne, die Host-Anbindung bleibt dort.
 *
 * replay(Anfangszustand, Event-Strom) → { scorecard, injection, digest }.
 * Rein und deterministisch: kein Math.random, kein Date.now, kein Modell.
 * Unbekanntes ändert nichts (fail-closed); gezählt wird es trotzdem.
 */

import { firstDefined, readPath, translateSignal } from './signal-translate.js';

/** Vier Nachkommastellen nach jedem Event: kein Float-Rauschen im Golden-Wert. */
export function round4(value) {
  return Number(Number(value).toFixed(4));
}

/** Kanonisches JSON: Schlüssel rekursiv sortiert — gleiche Eingabe, gleicher Digest. */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * cyrb53 als Hex-String (16 Stellen): deterministischer Digest ohne Imports.
 * Zwei 32-Bit-Läufe über denselben Text — keine Zufallsquelle beteiligt.
 */
export function stableHash(text) {
  const input = String(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const half = (value) => (value >>> 0).toString(16).padStart(8, '0');
  return `${half(h1)}${half(h2)}`;
}

/**
 * Eine Dimension der Scorecard lesen. Reine Funktion: Unbekanntes ergibt null
 * (fail-closed: kein Raten, kein Default).
 */
export function readScore(scorecard, dimension) {
  if (scorecard === null || typeof scorecard !== 'object') return null;
  if (typeof dimension !== 'string' || dimension.trim() === '') return null;
  const value = scorecard.dimensions?.[dimension] ?? scorecard.scores?.[dimension];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Anfangszustand aus dem Vertrag: Roh- und veröffentlichte Werte sind gleich. */
export function initialState(scoring) {
  const scores = {};
  for (const [name, dimension] of Object.entries(scoring?.dimensions ?? {})) {
    scores[name] = dimension?.initial ?? 0;
  }
  return {
    scores: { ...scores },
    published: { ...scores },
    relation: scoring?.relation?.initial ?? null,
    signals: 0,
    ignored: 0,
    signalsSincePublish: 0,
  };
}

function clamp(value, dimension) {
  const min = typeof dimension?.min === 'number' ? dimension.min : 0;
  const max = typeof dimension?.max === 'number' ? dimension.max : 1;
  return Math.min(max, Math.max(min, value));
}

function snapshotScores(state) {
  return { ...state.scores };
}

/**
 * Ein Event, ein Übergang. Reihenfolge pro Event: prüfen (Typ, Payload,
 * Relation) — dann erst mutieren (Decay, Delta, Kühlen). Eine fehlgeschlagene
 * Prüfung lässt den Zustand byte-identisch.
 *
 * `event.weight` skaliert das Delta (Vorgabe 1). Der Faktor kommt aus der
 * Signaltabelle (Stärke → Faktor) und wird hier angewandt — nicht als zweite
 * Delta-Tabelle, sondern als Multiplikator auf den Vertragswert. Ein Ereignis
 * ohne `weight` verhält sich damit exakt wie vorher (der Golden-Replay der
 * Fixture bleibt unverändert).
 */
export function applyEvent(contracts, state, event) {
  const scoring = contracts?.scoring ?? {};
  const type = typeof event?.type === 'string' ? event.type : null;
  const payload = event?.payload !== null && typeof event?.payload === 'object' ? event.payload : {};
  const definition = type !== null ? scoring.events?.[type] : undefined;

  const untouched = (reason) => ({
    state: {
      scores: { ...state.scores },
      published: { ...state.published },
      relation: state.relation,
      signals: state.signals,
      ignored: state.ignored + 1,
      signalsSincePublish: state.signalsSincePublish,
    },
    changed: false,
    reason,
  });

  if (typeof definition !== 'object' || definition === null) return untouched('UNKNOWN_EVENT');
  for (const key of definition.payload ?? []) {
    const value = payload[key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return untouched(`MISSING_PAYLOAD:${key}`);
    }
  }
  if (definition.relation === true && !(scoring.relation?.levels ?? []).includes(payload.relation)) {
    return untouched(`UNKNOWN_RELATION:${String(payload.relation)}`);
  }

  // Mutieren: erst vergessen (langsam, Richtung initial), dann das Delta.
  const rate = typeof scoring.decay?.rate === 'number' ? scoring.decay.rate : 0;
  const weight = typeof event?.weight === 'number' && Number.isFinite(event.weight) ? event.weight : 1;
  const scores = {};
  for (const [name, dimension] of Object.entries(scoring.dimensions ?? {})) {
    const initial = dimension?.initial ?? 0;
    const current = typeof state.scores[name] === 'number' ? state.scores[name] : initial;
    const delta = (typeof definition.delta?.[name] === 'number' ? definition.delta[name] : 0) * weight;
    scores[name] = clamp(round4(current + (initial - current) * rate + delta), dimension);
  }

  const next = {
    scores,
    published: { ...state.published },
    relation: definition.relation === true ? payload.relation : state.relation,
    signals: state.signals + 1,
    ignored: state.ignored,
    signalsSincePublish: state.signalsSincePublish + 1,
  };

  // Kühlen: veröffentlichen nur alle cooling.interval Signale.
  const interval = scoring.cooling?.interval ?? 1;
  if (Number.isInteger(interval) && interval >= 1 && next.signalsSincePublish >= interval) {
    next.published = snapshotScores(next);
    next.signalsSincePublish = 0;
  }
  return { state: next, changed: true, reason: type };
}

/**
 * Trigger in Reihenfolge: der erste passende feuert. Bedingungen lesen die
 * VERÖFFENTLICHTEN Werte; der Skill muss im Technik-Profil stehen, sonst wird
 * der Trigger übersprungen.
 */
export function evaluateTriggers(contracts, scorecard) {
  const triggers = contracts?.triggers?.triggers ?? [];
  const skills = contracts?.profile?.skills ?? [];
  const published = scorecard?.published ?? {};
  for (const trigger of triggers) {
    if (typeof trigger?.id !== 'string' || typeof trigger?.skill !== 'string') continue;
    if (!skills.includes(trigger.skill)) continue;
    if (typeof trigger.dimension === 'string') {
      const value = published[trigger.dimension];
      if (typeof value !== 'number') continue;
      if (trigger.op === 'below' && !(value < trigger.threshold)) continue;
      if (trigger.op === 'above' && !(value > trigger.threshold)) continue;
      if (trigger.op !== 'below' && trigger.op !== 'above') continue;
    }
    if (typeof trigger.relation === 'string' && scorecard?.relation !== trigger.relation) continue;
    if (trigger.dimension === undefined && trigger.relation === undefined) continue;
    return { trigger: trigger.id, skill: trigger.skill, text: trigger.text ?? '', reason: `TRIGGER:${trigger.id}` };
  }
  return { trigger: null, skill: null, text: '', reason: 'NO_TRIGGER' };
}

/**
 * Der Replay: Anfangszustand + Event-Strom → Scorecard + Injektion + Digest.
 * Der Digest läuft über Vertrag, Anfang und Strom — gleicher Strom bei gleichem
 * Start ergibt dieselbe Scorecard, dieselbe Injektion, denselben Digest.
 */
export function replay(contracts, initial, stream) {
  const scoring = contracts?.scoring ?? {};
  let state = {
    scores: { ...(initial?.scores ?? {}) },
    published: { ...(initial?.published ?? {}) },
    relation: initial?.relation ?? null,
    signals: initial?.signals ?? 0,
    ignored: initial?.ignored ?? 0,
    signalsSincePublish: initial?.signalsSincePublish ?? 0,
  };
  for (const event of stream ?? []) {
    state = applyEvent(contracts, state, event).state;
  }
  const scorecard = {
    scores: { ...state.scores },
    published: { ...state.published },
    relation: state.relation,
    signals: state.signals,
    ignored: state.ignored,
  };
  const injection = evaluateTriggers(contracts, scorecard);
  const digest = `sc_${stableHash(canonicalize({ contract: scoring.contract ?? null, initial, stream }))}`;
  return { scorecard, injection, digest };
}

// Die Uebersetzung selbst lebt in `signal-translate.js` — dieser Kern liest nur
// ihre Namen (relativer Import, kein bare Import). Die oeffentliche Flaeche
// bleibt dieselbe: wer `createSignalCollector` hier importiert, bekommt ihn.
export { readPath, normalizeTokens, overlapOf, humanText, strengthFactor, translateSignal } from './signal-translate.js';

/**
 * Die Tendenz aus dem Protokoll ableiten — rein und datengetrieben.
 *
 * Warum das hier steht und nicht in der Persona: die Tendenz ist eine Aussage
 * ueber das PROTOKOLL (was ist passiert), nicht ueber den Ton (wie klingt das).
 * Wer sie liest — Prompter, Persona — entscheidet ueber die Wirkung; hier steht
 * nur die Rechnung. Kein `Math.random`, kein `Date.now`, kein Modell: dieselben
 * Zeilen ergeben dieselbe Tendenz.
 *
 * Was die Regeln liefern (`assets/tendency-rules.json`):
 *   classes   — welche Signale eine Klasse speisen und welchen Pol sie traegt
 *   levels    — Anteil → Wort, absteigend; die letzte Stufe traegt 0
 *   stances   — geordnete Bedingungen ueber diese Worte; die erste passende gilt
 *   minSignals— darunter wird NICHTS behauptet (fail-closed, kein Duennschluss)
 *
 * ZWEI ZAHLEN, nicht eine: `signals` ist das GANZE Protokoll (ehrliche Summe),
 * `counted` ist die Evidenzlage, auf der die Anteile und die Mindestevidenz
 * rechnen — naemlich die Zeilen, die eine Klasse auch liest. Eine Zeile aus
 * einer aelteren Regel (ein Signal, das heute keine Klasse fuehrt) darf die
 * Anteile nicht verwaessern, aber sie darf auch keine Haltung erzeugen; sie
 * steht als `unmatched` sichtbar da. Zurueckgenommenes zaehlt gar nicht mit:
 * ein Widerruf nimmt die Zeile aus dem Protokoll, und was nicht mehr dasteht,
 * faerbt die Tendenz nicht.
 * @param tendency - der Vertrag `assets/tendency-rules.json`.
 * @param records - die Protokollzeilen des Sammlers (`kind: 'score'`).
 * @returns { contract, ready, signals, counted, unmatched, counts, shares, levels, stance, reason }
 */
export function deriveTendency(tendency, records = []) {
  const classes = Array.isArray(tendency?.classes) ? tendency.classes : [];
  const levels = Array.isArray(tendency?.levels) ? tendency.levels : [];
  const stances = Array.isArray(tendency?.stances) ? tendency.stances : [];
  const minSignals = typeof tendency?.minSignals === 'number' && Number.isFinite(tendency.minSignals) ? tendency.minSignals : Infinity;

  const members = new Map();
  for (const klass of classes) {
    if (klass === null || typeof klass !== 'object' || typeof klass.id !== 'string') continue;
    members.set(klass.id, new Set(Array.isArray(klass.signals) ? klass.signals : []));
  }

  const counts = {};
  for (const id of members.keys()) counts[id] = 0;
  let signals = 0;
  let counted = 0;
  for (const record of records ?? []) {
    if (record?.kind !== 'score' || typeof record?.signal !== 'string') continue;
    signals += 1;
    let read = false;
    for (const [id, set] of members) {
      if (!set.has(record.signal)) continue;
      counts[id] += 1;
      read = true;
    }
    if (read) counted += 1;
  }

  const shares = {};
  const levelOf = {};
  for (const [id, count] of Object.entries(counts)) {
    const share = counted === 0 ? 0 : round4(count / counted);
    shares[id] = share;
    levelOf[id] = levels.find((level) => typeof level?.minShare === 'number' && share >= level.minShare)?.id ?? null;
  }

  const ready = counted >= minSignals;
  let stance = null;
  if (ready) {
    for (const candidate of stances) {
      const when = candidate?.when;
      const matches =
        when === undefined ||
        (when !== null && typeof when === 'object' && Object.entries(when).every(([id, level]) => levelOf[id] === level));
      if (matches) {
        stance = candidate?.id ?? null;
        break;
      }
    }
  }

  return {
    contract: typeof tendency?.contract === 'string' ? tendency.contract : null,
    ready,
    signals,
    counted,
    unmatched: signals - counted,
    counts: { ...counts },
    shares,
    levels: levelOf,
    stance,
    reason: ready ? null : `THIN_EVIDENCE:${counted}/${minSignals}`,
  };
}

/**
 * Der Sammler: haelt das Protokoll der Signale und den Zustand je Sitzung.
 *
 * Zustand je Sitzung ist das, was ein Signal braucht — nichts weiter: die
 * zuletzt gesehene Frage (fuer die Wiederholung) und zwei Zaehler fuer die Spur.
 * `forgetSession` raeumt ihn auf, ein neues `session.created` schliesst die
 * Sitzung ab (der Merkzettel geht, es entsteht KEINE leere Huelle — eine Huelle
 * ohne Inhalt waere nur Ballast, der sich ueber die Laufzeit ansammelt), und
 * `closeAllSessions` schliesst alle offenen, wenn der Host endet. DSH kennt im
 * Spine kein Sitzungsende-Ereignis — das ist eine benannte Luecke, und deshalb
 * ist der PROZESS die Grenze: was der Host noch weiss, schliesst er selbst ab,
 * statt eine Ereignisform zu erfinden, die es nicht gibt.
 *
 * Die Tafel entsteht aus dem Protokoll: `replay` ueber alle Zeilen. Ein Widerruf
 * ist damit exakt — die Zeile faellt weg, der Rest wird neu gerechnet, und altes
 * Evidence verblasst weiter nach dem Vertrag. Genau diese Eigenschaft traegt den
 * Neustart: das Protokoll ist die Wahrheit, die Tafel ist daraus hergeleitet,
 * und was nicht mehr im Protokoll steht, zaehlt auch nach dem Laden nicht mehr.
 *
 * WAS HIER NICHT HINEINGEHOERT: das Schreiben. Der Sammler kennt keine Datei,
 * keine Datenbank und keine Zeit. Er MELDET seinen Stand (`onPersist`) — wohin
 * er geht, entscheidet der Host. Ein reiner Kern, der den Rueckruf nicht
 * bekommt, verhaelt sich exakt wie vorher (er rechnet im Speicher).
 *
 * EINE HUELLE OHNE INHALT IST KEIN ZUSTAND: im Speicher entsteht fuer jede
 * Sitzung, die ein Ereignis hatte, ein Merkzettel (auch ohne Frage — die
 * Zaehler brauchen ihn). Geschrieben wird er nur, wenn er eine Frage kennt: er
 * ist sonst nur Ballast, der sich ueber die Laufzeit zu einer Zeile je Sitzung
 * summierte, und er sagt nichts, was nicht schon "kein Merkzettel" sagt.
 */
export function createSignalCollector({ contracts, rules, onPersist = null } = {}) {
  const initial = initialState(contracts?.scoring ?? {});
  const sessions = new Map();
  let records = [];
  let notes = 0;
  let dropped = 0;
  const stats = { observed: 0, scored: 0, retracted: 0, noted: 0, silent: 0, reasons: {} };
  // Die Zuordnung lebt im Prozess: so viele Antworten merkt sich eine Sitzung,
  // aeltere fallen weg (dieselbe Bauform wie die Baustein-Deckel). Kein Deckel
  // auf SIGNALE — nur auf die Kennungen, die ein Urteil braucht.
  const MAX_ANSWERS = 200;

  const count = (reason) => {
    stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
  };

  const sessionOf = (sessionId) => {
    let state = sessions.get(sessionId);
    if (state === undefined) {
      // `answers` ist die Zuordnung, die ein Urteil pruefbar macht: die
      // Kennungen der Antworten, die DIESE Sitzung gesehen hat (SH-LEARN-01).
      state = { id: sessionId, previousQuestion: '', questions: 0, signals: 0, answers: new Set() };
      sessions.set(sessionId, state);
    }
    return state;
  };

  const scorecard = () => replay(contracts, initial, records.map((record) => record.event)).scorecard;

  /**
   * Die Merkzettel, die einen Stand SIND — Hüllen ohne Frage zaehlen nicht.
   * Die Antwort-Kennungen bleiben hier draussen: sie sind Prozesswissen (welche
   * Antwort habe ich gesehen), kein dauerhafter Zustand — eine `Set` waere im
   * JSON ohnehin leer, und ein Merkzettel ohne Frage ist nur Ballast.
   */
  const memoList = () =>
    [...sessions.values()]
      .filter((state) => state.previousQuestion !== '')
      .map((state) => ({ id: state.id, previousQuestion: state.previousQuestion, questions: state.questions, signals: state.signals }));

  /**
   * Den Stand melden. Reine Weitergabe: der Kern kopiert, der Host schreibt.
   * Der Grund (`why`) steht mit dabei, damit im Protokoll nachlesbar ist,
   * WELCHE Aenderung den Schreibvorgang ausgeloest hat — sonst waere eine
   * Schreibspur ohne Anlass.
   */
  const persist = (why) => {
    if (typeof onPersist !== 'function') return;
    onPersist({
      why,
      records: records.map((record) => ({ ...record })),
      memos: memoList(),
      scorecard: scorecard(),
      notes,
    });
  };

  return {
    observe(envelope, payload) {
      stats.observed += 1;
      const sessionId = typeof envelope?.session_id === 'string' ? envelope.session_id : '';

      // Die ANTWORT der Sitzung merken (SH-LEARN-01): `assistant/message` traegt
      // `message.id`, genau die Kennung, die `feedback/message-put` als
      // `item.messageId` zurueckgibt. Nur eine so gesehene Antwort ist ein
      // pruefbarer Gegenstand fuer ein Urteil.
      if (envelope?.event_type === 'message.completed' && sessionId !== '') {
        const answerId = firstDefined(readPath(payload, 'message.id'), readPath(payload, 'data.message.id'), readPath(payload, 'id'));
        if (typeof answerId === 'string' && answerId !== '') {
          const state = sessionOf(sessionId);
          if (state.answers.size >= MAX_ANSWERS) {
            const oldest = state.answers.values().next();
            if (!oldest.done) state.answers.delete(oldest.value);
          }
          state.answers.add(answerId);
        }
      }

      // Ein neues Sitzungsereignis schliesst die Sitzung ab: der Merkzettel
      // geht, und es wird KEINE leere Huelle angelegt — die wieder anzulegen
      // hiesse, sie fuer immer zu behalten. Gemeldet wird nur, wenn wirklich
      // etwas wegfiel: ein abgeschlossenes Nichts ist keine Aenderung.
      const sessionCreated = envelope?.event_type === 'session.created' && sessionId !== '';
      const sessionEnded = sessionCreated && sessions.delete(sessionId);
      const session = sessionId === '' || sessionCreated ? {} : sessionOf(sessionId);

      const outcome = translateSignal(envelope, payload, rules, session);
      if (outcome.reason !== null) count(outcome.reason);
      const memoChanged = sessionId !== '' && outcome.question !== undefined;
      if (memoChanged) {
        session.previousQuestion = outcome.question;
        session.questions += 1;
      }

      if (outcome.kind === 'note') {
        stats.noted += 1;
        notes += 1;
        persist('note');
        return { outcome, removed: 0, scorecard: scorecard() };
      }
      if (outcome.kind === 'retract' && outcome.subject !== null) {
        const before = records.length;
        records = records.filter((record) => !(record.session_id === sessionId && record.subject === outcome.subject));
        stats.retracted += 1;
        if (sessionId !== '') session.signals += 1;
        persist('retract');
        return { outcome, removed: before - records.length, scorecard: scorecard() };
      }
      if (outcome.kind === 'score' && outcome.event !== null) {
        if (outcome.replaces === true && outcome.subject !== null) {
          records = records.filter(
            (record) => !(record.session_id === sessionId && record.subject === outcome.subject && record.kind === 'score'),
          );
        }
        records.push({
          session_id: sessionId,
          subject: outcome.subject,
          signal: outcome.signal,
          kind: 'score',
          factor: outcome.factor,
          event: outcome.event,
          detail: outcome.detail,
        });
        stats.scored += 1;
        if (sessionId !== '') session.signals += 1;
        persist('score');
        return { outcome, removed: 0, scorecard: scorecard() };
      }
      // Kein Signal, aber moeglicherweise ein neuer Merkzettel oder eine
      // geschlossene Sitzung: auch das ist Zustand und wird gemeldet.
      if (memoChanged) persist('memo');
      else if (sessionEnded) persist('session');
      stats.silent += 1;
      return { outcome, removed: 0, scorecard: scorecard() };
    },
    /**
     * Den Stand aus der Ablage uebernehmen — nur beim Start, und fail-closed.
     *
     * Nur was die Form einer Protokollzeile hat, wird uebernommen; alles andere
     * wird GEZAEHLT (`rejected`) und fallengelassen. Ein fremder oder kaputter
     * Stand darf keine Tafel ergeben, die niemand gerechnet hat — aber er darf
     * auch nicht still verschwinden. Was hier hereinkommt, ist bereits geprueft
     * (`translateSignal` hat die Ereignisform erzeugt), deshalb ist die Pruefung
     * eine Formpruefung und keine zweite Auslegung.
     */
    hydrate(state) {
      const rawRecords = Array.isArray(state?.records) ? state.records : [];
      const rawMemos = Array.isArray(state?.memos) ? state.memos : [];
      let kept = 0;
      let rejected = 0;
      const next = [];
      // Welche Antworten ein frueherer Host schon bewertet hat, bleibt
      // zuordenbar: die Betreffe der Zeilen sind die Kennungen der Antworten.
      const knownAnswers = new Map();
      for (const record of rawRecords) {
        if (typeof record?.event?.type !== 'string' || typeof record?.session_id !== 'string') {
          rejected += 1;
          continue;
        }
        const subject = typeof record.subject === 'string' ? record.subject : null;
        if (subject !== null) {
          if (!knownAnswers.has(record.session_id)) knownAnswers.set(record.session_id, new Set());
          knownAnswers.get(record.session_id).add(subject);
        }
        next.push({
          session_id: record.session_id,
          subject,
          signal: typeof record.signal === 'string' ? record.signal : null,
          kind: 'score',
          factor: typeof record.factor === 'number' && Number.isFinite(record.factor) ? record.factor : 1,
          event: record.event,
          detail: record.detail !== null && typeof record.detail === 'object' ? record.detail : {},
          // Der Altstand kennt keine Herkunft: er bleibt lesbar, traegt aber
          // `null` und lernt damit keine Bausteine (fail-closed, kein Nachtrag).
          basis: record.basis !== null && typeof record.basis === 'object' ? record.basis : null,
        });
        kept += 1;
      }
      records = next;
      sessions.clear();
      for (const memo of rawMemos) {
        if (typeof memo?.id !== 'string' || memo.id === '') {
          rejected += 1;
          continue;
        }
        sessions.set(memo.id, {
          id: memo.id,
          previousQuestion: typeof memo.previousQuestion === 'string' ? memo.previousQuestion : '',
          questions: Number.isFinite(memo.questions) ? memo.questions : 0,
          signals: Number.isFinite(memo.signals) ? memo.signals : 0,
          answers: new Set(knownAnswers.get(memo.id) ?? []),
        });
      }
      // Eine Sitzung ohne Merkzettel kennt trotzdem Antworten: die Betreffe
      // ihrer Zeilen sind die Zuordnung, die ein spaetes Urteil nach dem
      // Neustart braucht (SH-LEARN-01). Diese Huelle traegt keine Frage und
      // wird deshalb NIE geschrieben (memoList verlangt eine Frage) — sie ist
      // Prozesswissen aus dem Protokoll, kein zweiter Zustand.
      for (const [id, answers] of knownAnswers) {
        if (sessions.has(id)) continue;
        sessions.set(id, { id, previousQuestion: '', questions: 0, signals: 0, answers: new Set(answers) });
      }
      if (Number.isFinite(state?.notes)) notes = state.notes;
      dropped += rejected;
      return { records: kept, memos: memoList().length, rejected };
    },
    /** Die Tafel, wie sie aus dem Protokoll folgt (inkl. Injektion und Digest). */
    result() {
      return replay(contracts, initial, records.map((record) => record.event));
    },
    scorecard,
    injection() {
      return replay(contracts, initial, records.map((record) => record.event)).injection;
    },
    records: () => records.map((record) => ({ ...record })),
    /**
     * Die Zeile zu EINEM Betreff — die Antwort auf „was gilt fuer diese Aufgabe?".
     *
     * Das ist die Leseseite der Nachrechnung: der Betreff (Sitzung + Kennung,
     * `turn:`-Praefix eingeschlossen) reist mit jeder Zeile, deshalb trifft
     * spaete Kritik dieselbe Aufgabe wie das fruehe Urteil — und ein zweites
     * Urteil ZU DERSELBEN Antwort ersetzt die erste Zeile, statt eine zweite
     * daneben zu legen (siehe `observe`). Der Widerruf braucht genau dieselbe
     * Zuordnung; ohne Betreff gibt es keine Zuordnung, dann steht hier null.
     */
    judgementOf(subject) {
      if (typeof subject !== 'string' || subject === '') return null;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (records[index].subject === subject) return { ...records[index] };
      }
      return null;
    },
    session: (sessionId) => (sessions.has(sessionId) ? { ...sessions.get(sessionId) } : null),
    sessions: () => [...sessions.keys()],
    /** Der ganze Stand — genau die Form, die die Ablage traegt. */
    state: () => ({
      records: records.map((record) => ({ ...record })),
      memos: memoList(),
      scorecard: scorecard(),
      notes,
    }),
    stats: () => ({ ...stats, reasons: { ...stats.reasons }, notes, dropped, records: records.length }),
    /** Den Merkzettel EINER Sitzung aufraeumen (das Protokoll bleibt die Evidenz). */
    forgetSession(sessionId) {
      const existed = sessions.delete(sessionId);
      if (existed) persist('session');
      return existed;
    },
    /**
     * Alle offenen Sitzungen schliessen — der Host ruft das, wenn er endet.
     * Das Protokoll bleibt (es ist Evidenz), der Merkzettel geht: Sitzungen
     * enden mit dem Prozess, weil der Spine kein Sitzungsende kennt.
     */
    closeAllSessions() {
      const open = sessions.size;
      sessions.clear();
      if (open > 0) persist('session-end');
      return open;
    },
    dispose() {
      sessions.clear();
      records = [];
      notes = 0;
      dropped = 0;
    },
  };
}
