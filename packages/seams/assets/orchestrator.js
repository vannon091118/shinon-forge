/**
 * orchestrator.js — die drei Primitive und der Turn-Vertrag, als importfreier Kern.
 *
 * Warum es diese Datei gibt (gemessen, nicht behauptet):
 *
 * 1. Jedes Host-Paket registriert heute selbst über `ctx.on`, `ctx.provide` und
 *    `ctx.inject`. Die Wachform davor ist über den Baum verstreut: dreimal
 *    `typeof ctx?.on === 'function' ? … : () => {}` (ein stiller Fallback, der
 *    einen ausgefallenen Bus wie einen ruhigen Kanal aussehen lässt), vier
 *    `typeof ctx.inject`-Wachen und zwei `ctx.provide`-Aufrufe ohne Eigentümer.
 *    Diese Datei macht daraus EINEN benannten Befund je Fehlerfall.
 *
 * 2. Die Reihenfolge der Wasserfall-Teilnehmer auf `agent/pre-step` ist heute
 *    eine Folge der Profil-Reihenfolge und der Config — nirgends aufgeschrieben.
 *    `turn-order.json` neben dieser Datei ist der Vertrag (`shinon.turn/v1`);
 *    `contractIssues`, `turnParticipants` und `gateOpen` lesen ihn, damit Gate
 *    und Test dieselbe Wahrheit benutzen wie die Pakete.
 *
 * Was hier bewusst NICHT passiert:
 *
 * - Kein zweiter Bus. `route` ruft `ctx.on`, `provide` ruft `ctx.provide`,
 *   `demand` ruft `ctx.inject` — Cordis bleibt der Bus, das Protokoll bleibt die
 *   Spine, der Lebenszyklus bleibt die Fiber. Der Orchestrator fügt nur
 *   Sichtbarkeit hinzu: Eigentümer, Befunde, Vertragsprüfung.
 * - Kein Verbot mehrerer Listener. Cordis erlaubt sie absichtlich (Wasserfall,
 *   mehrere Beobachter). Die Dedup-Regel gilt für die EIGENTUMSERKLÄRUNG eines
 *   exklusiven Kanals, nicht für die Registrierung: derselbe Eigentümer darf
 *   beliebig oft auf denselben Kanal hören.
 * - Kein Laufzeitleser für `turn-order.json`. Ein Host-Kern ohne bare Imports
 *   kann JSON nicht ohne Import-Attribut laden; die Datei wird von Gate und Test
 *   gelesen, und `createOrchestrator` bekommt den schon geparsten Vertrag.
 */

/** Der Vertragsname des Turn-Vertrags (kanonisch: `shinon.<bereich>/v<N>`). */
export const TURN_CONTRACT = 'shinon.turn/v1';

/** Der Kanal, auf dem der Turn tatsächlich entschieden wird. */
export const TURN_CHANNEL = 'agent/pre-step';

/**
 * Die Teilnehmer, ohne die der Vertrag nicht erfüllt ist.
 *
 * `popup` fehlt hier absichtlich: es ist ein optionaler fünfter Zuhörer, dessen
 * Teilnahme an `trigger` hängt (heute `user/message`, also gar nicht).
 */
export const REQUIRED_TURN_OWNERS = ['persona', 'hook', 'prompter', 'task-router'];

/** Die Gate-Arten, die `turn-order.json` benutzen darf. */
export const GATE_KINDS = ['always', 'includes', 'equals'];

/** Ein Pfad der Form `a.b.c` in einem Objekt; fehlt etwas, ist das Ergebnis `undefined`. */
export function readPath(object, path) {
  if (typeof path !== 'string' || path === '') return object;
  let value = object;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Ist die Teilnahme eines Pakets nach seiner WIRKSAMEN Config offen?
 *
 * Die Config kommt von außen (Profil/Defaults); diese Funktion rät keinen
 * Vorgabewert. Ein unbekannter Gate-Typ ist geschlossen (false), damit ein
 * Tippfehler im Vertrag nicht als „immer an" durchgeht.
 */
export function gateOpen(gate, config) {
  if (gate === undefined || gate === null) return true;
  switch (gate.kind) {
    case 'always':
      return true;
    case 'includes': {
      const value = readPath(config, gate.path);
      return Array.isArray(value) && value.includes(gate.value);
    }
    case 'equals':
      return readPath(config, gate.path) === gate.value;
    default:
      return false;
  }
}

/** Die Teilnehmer des Turns, mit ihrer Öffnung nach der übergebenen Config. */
export function turnParticipants(contract, configOf = () => ({})) {
  return (contract?.order ?? []).map((entry) => ({
    position: entry.position,
    owner: entry.owner,
    required: entry.required === true,
    active: gateOpen(entry.gate, configOf(entry.owner)),
  }));
}

/**
 * Prüft die Pflicht-Teilnehmer gegen ihre WIRKSAME Config.
 *
 * `configOf(owner)` liefert `undefined`, wenn die Config nicht entschieden ist
 * (dann gilt die Vorgabe des Pakets und der Vertrag behauptet nichts darüber).
 * Nur eine entschiedene, geschlossene Config eines Pflicht-Teilnehmers ist ein
 * Befund — genau der Fall, den ein Fake-`ctx`-Stub nicht sieht.
 */
export function participationIssues(contract, configOf = () => undefined) {
  const issues = [];
  for (const entry of contract?.order ?? []) {
    const config = configOf(entry.owner);
    if (config === undefined) continue;
    if (entry.required === true && !gateOpen(entry.gate, config)) {
      issues.push(
        `turn-order.json: Pflicht-Teilnehmer ${entry.owner} (Position ${entry.position}) ist nach seiner Config geschlossen — der Turn verliert diese Stufe`,
      );
    }
  }
  return issues;
}

/** Der Eigentümer eines exklusiven Kanals, oder `null`. */
export function exclusiveOwner(contract, channel) {
  const row = (contract?.exclusive ?? []).find((entry) => entry.channel === channel);
  return typeof row?.owner === 'string' && row.owner !== '' ? row.owner : null;
}

function gateShapeIssues(gate, where) {
  if (gate === undefined || gate === null) return [];
  if (typeof gate !== 'object' || Array.isArray(gate)) return [`${where}: gate muss ein Objekt sein`];
  if (!GATE_KINDS.includes(gate.kind)) return [`${where}: gate.kind "${gate.kind}" ∉ {${GATE_KINDS.join(', ')}}`];
  if (gate.kind === 'always') return [];
  if (typeof gate.path !== 'string' || gate.path === '') return [`${where}: gate.path fehlt`];
  if (gate.value === undefined) return [`${where}: gate.value fehlt`];
  return [];
}

/**
 * Prüft den geparsten Turn-Vertrag gegen seine eigene Form.
 *
 * Rein (kein Dateisystem), damit derselbe Code im Gate, im Test und in einer
 * späteren Laufzeitprüfung läuft. Ein Befund ist ein Satz mit der Fundstelle.
 */
export function contractIssues(contract) {
  const issues = [];
  if (contract === null || typeof contract !== 'object' || Array.isArray(contract)) {
    return ['turn-order.json: kein Objekt'];
  }
  if (contract.contract !== TURN_CONTRACT) {
    issues.push(`turn-order.json: contract ist "${contract.contract}", erwartet "${TURN_CONTRACT}"`);
  }
  if (contract.turn !== TURN_CHANNEL) {
    issues.push(`turn-order.json: turn ist "${contract.turn}", erwartet "${TURN_CHANNEL}"`);
  }
  if (!Array.isArray(contract.order) || contract.order.length === 0) {
    issues.push('turn-order.json: order fehlt oder ist leer');
    return issues;
  }

  const positions = new Set();
  const owners = new Set();
  contract.order.forEach((entry, index) => {
    const where = `turn-order.json order[${index + 1}]`;
    if (!Number.isInteger(entry?.position) || entry.position < 1) issues.push(`${where}: position fehlt`);
    else if (positions.has(entry.position)) issues.push(`${where}: position ${entry.position} ist doppelt`);
    else positions.add(entry.position);
    if (typeof entry?.owner !== 'string' || entry.owner === '') issues.push(`${where}: owner fehlt`);
    else if (owners.has(entry.owner)) issues.push(`${where}: owner ${entry.owner} ist doppelt`);
    else owners.add(entry.owner);
    if (typeof entry?.source !== 'string' || entry.source === '') issues.push(`${where}: source fehlt`);
    issues.push(...gateShapeIssues(entry?.gate, where));
  });

  const sorted = [...positions].sort((a, b) => a - b);
  sorted.forEach((position, index) => {
    if (position !== index + 1) issues.push(`turn-order.json: position ${position} ist keine lückenlose Folge ab 1`);
  });

  for (const owner of REQUIRED_TURN_OWNERS) {
    if (!owners.has(owner)) issues.push(`turn-order.json: Pflicht-Teilnehmer ${owner} fehlt`);
  }

  const channels = new Set();
  (contract.exclusive ?? []).forEach((entry, index) => {
    const where = `turn-order.json exclusive[${index + 1}]`;
    if (typeof entry?.channel !== 'string' || entry.channel === '') issues.push(`${where}: channel fehlt`);
    else if (channels.has(entry.channel)) issues.push(`${where}: channel ${entry.channel} ist doppelt`);
    else channels.add(entry.channel);
    if (typeof entry?.owner !== 'string' || entry.owner === '') issues.push(`${where}: owner fehlt`);
    if (typeof entry?.source !== 'string' || entry.source === '') issues.push(`${where}: source fehlt`);
  });

  (contract.shared ?? []).forEach((entry, index) => {
    const where = `turn-order.json shared[${index + 1}]`;
    if (typeof entry?.channel !== 'string' || entry.channel === '') issues.push(`${where}: channel fehlt`);
    if (!Array.isArray(entry?.owners) || entry.owners.length === 0) issues.push(`${where}: owners fehlt oder ist leer`);
  });

  return issues;
}

/**
 * Der Orchestrator EINES Pakets.
 *
 * Wird INNERHALB der Plugin-Fiber erzeugt (der gemessene Root-`provide`-Fall:
 * `ctx.provide` auf einem Root-Kontext feuert keinen `ctx.inject` eines
 * Geschwisters). `report` bekommt jeden Befund zusätzlich zum Log; Tests lesen
 * `snapshot()`.
 */
export function createOrchestrator(ctx, { owner, contract = null, report = () => {} } = {}) {
  if (typeof owner !== 'string' || owner.trim() === '') {
    throw new TypeError('[orchestrator] ohne owner-Namen ist kein Befund einem Paket zuordenbar');
  }
  const routes = [];
  const provided = new Map();
  const findings = [];

  const note = (finding) => {
    findings.push(finding);
    report(finding);
  };

  /**
   * Registriert einen Listener über den Bus des Hosts.
   *
   * Dieselbe owner/channel-Kombination darf mehrfach vorkommen. Nur ein
   * EXKLUSIVER Kanal aus dem Vertrag weist einen fremden Eigentümer ab — und
   * zwar bevor irgendetwas registriert wird.
   */
  function route(channel, handler, options = {}) {
    if (typeof channel !== 'string' || channel === '') {
      throw new TypeError(`[orchestrator] ${owner}: route braucht einen Kanalnamen`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`[orchestrator] ${owner}: Handler für "${channel}" ist keine Funktion`);
    }
    const declared = exclusiveOwner(contract, channel);
    if (declared !== null && declared !== owner) {
      throw new Error(`[orchestrator] ${owner} darf "${channel}" nicht hören — der Vertrag nennt ${declared} als Eigentümer`);
    }
    if (typeof ctx?.on !== 'function') {
      note({
        code: 'NO_BUS',
        owner,
        channel,
        message: `ctx.on fehlt — "${channel}" wurde NICHT registriert`,
      });
      return () => {};
    }
    const dispose = ctx.on(channel, handler);
    routes.push({ channel, owner, role: options.role ?? null });
    return typeof dispose === 'function' ? dispose : () => {};
  }

  /**
   * Stellt einen Dienst bereit; ein Duplikat nennt beide Namen.
   *
   * Rückgabe ist der Disposer des Hosts (die Aufrufer in den Paketen rufen ihn
   * beim Abbau) oder `null`, wenn der Host kein `ctx.provide` hat — dieselbe
   * Form, die der bisherige Code erwartet. `null` ist zugleich der Befund.
   */
  function provide(name, value) {
    if (typeof name !== 'string' || name === '') {
      throw new TypeError(`[orchestrator] ${owner}: provide braucht einen Dienstnamen`);
    }
    if (provided.has(name)) {
      throw new Error(`[orchestrator] ${owner} stellt "${name}" zweimal bereit — der erste Aufruf derselben Hälfte ist der Eigentümer`);
    }
    if (typeof ctx?.provide !== 'function') {
      note({ code: 'NO_PROVIDE', owner, channel: name, message: `ctx.provide fehlt — Dienst "${name}" wurde NICHT bereitgestellt` });
      return null;
    }
    let dispose;
    try {
      dispose = ctx.provide(name, value);
    } catch (error) {
      throw new Error(`[orchestrator] ${owner}: Dienst "${name}" nicht bereitgestellt — ${error.message}`);
    }
    provided.set(name, owner);
    return typeof dispose === 'function' ? dispose : () => {};
  }

  /**
   * Fragt Dienste an, ohne eine vierte `typeof ctx.inject`-Wache zu schreiben.
   * Ein fehlendes `inject` ist ein benannter Befund, kein stiller Ausfall.
   */
  function demand(services, callback) {
    const list = Array.isArray(services) ? services : [services];
    if (list.length === 0 || list.some((name) => typeof name !== 'string' || name === '')) {
      throw new TypeError(`[orchestrator] ${owner}: demand braucht mindestens einen Dienstnamen`);
    }
    if (typeof callback !== 'function') {
      throw new TypeError(`[orchestrator] ${owner}: demand braucht einen Callback`);
    }
    if (typeof ctx?.inject !== 'function') {
      note({
        code: 'NO_INJECT',
        owner,
        channel: list.join(','),
        message: `ctx.inject fehlt — ${list.join(', ')} wurde NICHT abgefragt`,
      });
      return false;
    }
    ctx.inject(list, callback);
    return true;
  }

  /** Der lesbare Zustand für Test, Gate und Diagnose. */
  function snapshot() {
    return {
      owner,
      contract: contract?.contract ?? null,
      routes: routes.map((entry) => ({ ...entry })),
      provided: [...provided.keys()],
      findings: findings.map((finding) => ({ ...finding })),
    };
  }

  return { owner, route, provide, demand, snapshot };
}
