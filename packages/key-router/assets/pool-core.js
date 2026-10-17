/**
 * @shinon/key-router — reiner Kern (assets/pool-core.js).
 *
 * KEINE Imports: nur dann läuft der Test in CI ohne `node_modules` — dieselbe
 * Regel wie bei `@shinon/scoring` (scoring-core.js), `@shinon/popup`
 * (trajectory-core.js) und `@shinon/prompter` (note-core.js). `index.js`
 * re-exportiert, was die Host-Hälfte braucht; die Namen bleiben dieselben.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-89d13e2c5858
 */

/** Beschriftung eines Poolplatzes — die einzige Angabe, die nach außen darf. */
export const KEY_LABEL_PREFIX = 'key#';

/**
 * Der Ausweis eines Platzes: Position im Pool, 1-basiert.
 * @param index - 0-basierte Position.
 */
export function keyLabel(index) {
  return `${KEY_LABEL_PREFIX}${index + 1}`;
}

/**
 * Aus Schlüsselnamen den Pool bauen — Reihenfolge bleibt, Doppelte fallen weg.
 *
 * Die Reihenfolge ist die Zusage an den Menschen: `key#1` ist der erste Name in
 * der Liste, `key#2` der zweite. Wer einen Platz aus einem Werkzeug-Ergebnis
 * liest, kann ihn ohne Ratearbeit in der Umgebung wiederfinden.
 *
 * @param keys - die eingelesenen Werte, in Reihenfolge.
 */
export function buildEntries(keys) {
  const seen = new Set();
  const entries = [];
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, label: keyLabel(entries.length), failCount: 0, lastFailAt: 0, cooldownUntil: 0 });
  }
  return entries;
}

// ── Override: die Übergabe an den Lauf ───────────────────────────────────────
//
// Die Mechanik, mit der der Pool die Route erreicht (PLAN.md §3.12). Gemessen am
// installierten Harness (0.2.1-alpha.1), nicht geraten:
//
//   - Die Route (`agnes`, `apiKeyEnv: AGNES_API_KEY`) löst ihren Schlüssel pro
//     Aufruf über `ctx.get("credentials").resolve(ref)` auf; fehlt der Dienst,
//     gilt die Startumgebung. Der Aufruf ist eine Funktion, kein Wert — jeder
//     neue Aufruf sieht den aktuellen Poolstand.
// → Kanon: docs/COMMENT-KANON.md#k-10eea7afa416

/**
 * Werte zu ausdrücklichen Namen aus der Startumgebung lesen.
 *
 * `launch` ist die Naht (`ctx.get('launchEnvironment')`, drei Schichten: Prozess,
 * Projekt-`.env`, Benutzer-`.env`) — oder fehlt, dann gilt nichts. Die Form ist
 * absichtlich schmal (`{ get(name) }`): was DSH dort liefert (`{ value, source }`)
 * und was ein Stub liefert, liest sich gleich.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-03e87e2a2faf
 */
export function valuesFromLayers(launch, names) {
  const values = {};
  if (launch === null || launch === undefined || typeof launch.get !== 'function') return values;
  for (const name of Array.isArray(names) ? names : []) {
    if (typeof name !== 'string' || name === '') continue;
    const hit = launch.get(name);
    const value = hit !== null && typeof hit === 'object' ? hit.value : hit;
    if (typeof value === 'string' && value.length > 0) values[name] = value;
  }
  return values;
}

/**
 * Eine Referenz auf ihren Namen zurückführen.
 *
 * Der Harness brandmarkt Referenzen nur zur Compile-Zeit (`brandString` gibt den
 * Wert unverändert zurück — gemessen in `@deepseek-ai/dsh-brand`); zur Laufzeit
 * ist eine Referenz eine Zeichenkette. Diese Funktion trägt genau das: kein
 * Import, kein Vergleich über Identitäten, nur der Name.
 */
export function refNameOf(ref) {
  return typeof ref === 'string' ? ref : String(ref);
}

/**
 * Die Klammer um `resolve`: bedient die verwalteten Referenzen aus dem Pool,
 * gibt alles andere an das Original weiter.
 *
 * Drei Zusagen, alle prüfbar: (1) Eine Referenz, die nicht verwaltet wird, erreicht
 * das Original unverändert — derselbe Aufruf, dasselbe Ergebnis. (2) Eine
 * verwaltete Referenz ohne Pool (leer, kein Eintrag wählbar) fällt auf das
 * Original zurück — der Router behauptet nie einen Schlüssel, den er nicht hat.
 * → Kanon: docs/COMMENT-KANON.md#k-8e61ae3a6e32
 */
export function createResolveOverlay(service, options = {}) {
  const original = service?.resolve;
  if (service === null || service === undefined || typeof original !== 'function') return null;
  const managed = new Set((Array.isArray(options.managed) ? options.managed : []).map(refNameOf));
  const select = typeof options.select === 'function' ? options.select : () => null;
  let active = true;
  const wrapped = async function (ref) {
    if (!active || !managed.has(refNameOf(ref))) return original.call(service, ref);
    const entry = select(refNameOf(ref));
    if (entry === null || entry === undefined || typeof entry.key !== 'string' || entry.key === '') {
      return original.call(service, ref);
    }
    return { value: entry.key, source: 'pool' };
  };
  service.resolve = wrapped;
  return {
    names: [...managed],
    restore() {
      active = false;
      if (service.resolve === wrapped) service.resolve = original;
    },
  };
}

/**
 * Eine fehlgeschlagene Anfrage lesen — der einzige Auslöser der Rotation.
 *
 * Gezählt wird NUR die stabile Klasse `RATE_LIMIT` (die Taxonomie des Harness,
 * gemessen in `@deepseek-ai/dsh-llm`: „route on this, never by parsing
 * `message`"), und nur für einen benannten Anbieter. Alles andere — Timeouts,
 * Abbrüche, Auth-Fehler, namenlose Nutzdaten — ist kein Grund zum Wechseln: ein
 * falscher Wechsel bei einem kaputten Schlüssel würde den gesunden Pool
 * → Kanon: docs/COMMENT-KANON.md#k-8eba23c96bba
 */
export function observeRequestError(payload) {
  if (payload === null || typeof payload !== 'object') return null;
  const failure = payload.failure;
  if (failure === null || typeof failure !== 'object') return null;
  if (failure.code !== 'RATE_LIMIT') return null;
  const provider = payload.provider;
  if (typeof provider !== 'string' || provider === '') return null;
  return { provider };
}

/**
 * Die Werte zu den NAMEN aus der Umgebung lesen — der einzige Bezug von
 * Schlüsselmaterial in diesem Paket.
 *
 * `names` sind ausdrückliche Namen, `prefix` sammelt zusätzlich `<prefix>_*`.
 * Eine Config kann KEINEN Schlüssel tragen: das Schema dieses Pakets hat kein
 * Feld dafür (`scripts/gate/tests/key-router-security.test.mjs` prüft das am
 * Schema, nicht an der Absicht) — eine Profildatei ist versioniert.
 * → Kanon: docs/COMMENT-KANON.md#k-2ed2ae9919fc
 */
export function keysFromEnv(env, options = {}) {
  const names = Array.isArray(options.names) ? options.names : [];
  const prefix = typeof options.prefix === 'string' ? options.prefix : '';
  const found = [];
  for (const name of names) {
    const value = env?.[name];
    if (typeof value === 'string' && value.length > 0) found.push(value);
  }
  if (prefix !== '') {
    const direct = env?.[prefix];
    if (typeof direct === 'string' && direct.length > 0) found.push(direct);
    for (const [name, value] of Object.entries(env ?? {})) {
      if (name.startsWith(`${prefix}_`) && typeof value === 'string' && value.length > 0) found.push(value);
    }
  }
  return found;
}

/**
 * Die Wartezeit nach dem n-ten Fehlschlag: exponentiell, gedeckelt, mit Jitter.
 *
 * Der Zufall kommt herein, `random` darf 0..1 liefern wie `Math.random`. Der
 * Fehlschlag-Index ist 0-basiert: der ERSTE Fehlschlag wartet `initialDelayMs`
 * (nicht das Doppelte) — `markFailed` weiß, dass es den Zähler schon erhöht hat.
 *
 * @param failCount - Stand NACH dem Fehlschlag (1 = erster).
 * @param random - Quelle des Jitters (0..1).
 */
export function calcBackoff(failCount, initialDelayMs, maxDelayMs, random = Math.random) {
  const steps = Math.max(0, failCount - 1);
  const exponential = Math.min(initialDelayMs * 2 ** steps, maxDelayMs);
  const jitter = exponential * 0.5 * (random() - 0.5);
  return Math.max(100, Math.min(maxDelayMs, Math.round(exponential + jitter)));
}

/**
 * Den nächsten Platz wählen: der mit den wenigsten Fehlschlägen unter den
 * verfügbaren. Ist keiner verfügbar, gewinnt der, dessen Cooldown zuerst endet.
 *
 * `force` überspringt die Bevorzugung nach Fehlschlägen — eine erzwungene
 * Rotation soll den Platz WECHSELN, sonst dreht sie sich im Kreis.
 *
 * @param entries - der Pool.
 * → Kanon: docs/COMMENT-KANON.md#k-b3798f386737
 */
export function nextEntry(entries, now, force = false, activeLabel = null) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const available = entries.filter((entry) => entry.cooldownUntil <= now);
  if (available.length === 0) {
    // Alle im Cooldown: der früheste ist die einzige ehrliche Antwort.
    return entries.reduce((a, b) => (a.cooldownUntil <= b.cooldownUntil ? a : b));
  }
  if (force && activeLabel !== null && available.length > 1) {
    const others = available.filter((entry) => entry.label !== activeLabel);
    if (others.length > 0) return others.reduce((a, b) => (a.failCount <= b.failCount ? a : b));
  }
  return available.reduce((a, b) => (a.failCount <= b.failCount ? a : b));
}

/** Einen Fehlschlag verbuchen (429): Zähler hoch, Cooldown setzen. */
export function markFailed(entry, now, initialDelayMs, maxDelayMs, random = Math.random) {
  entry.failCount += 1;
  entry.lastFailAt = now;
  const delay = calcBackoff(entry.failCount, initialDelayMs, maxDelayMs, random);
  entry.cooldownUntil = now + delay;
  return { label: entry.label, failCount: entry.failCount, delay };
}

/** Ein erfolgreicher Lauf baut Schuld ab: ein Fehlschlag weniger, Cooldown weg. */
export function resetSuccess(entry) {
  entry.failCount = Math.max(0, entry.failCount - 1);
  entry.cooldownUntil = 0;
  return { label: entry.label, failCount: entry.failCount };
}

/**
 * Der Zustand eines Pools — für Menschen und Werkzeuge. NUR Beschriftungen,
 * Fehlschläge und Restzeiten; kein Schlüssel, kein Präfix, keine Länge.
 *
 * @param entries - der Pool.
 * @param now - Zeitstempel in ms.
 * @param activeLabel - der Platz, der als aktiv gilt.
 */
export function statusOf(entries, now, activeLabel = null) {
  const pool = Array.isArray(entries) ? entries : [];
  const available = pool.filter((entry) => entry.cooldownUntil <= now);
  return {
    total: pool.length,
    available: available.length,
    cooling: pool.length - available.length,
    active: activeLabel,
    keys: pool.map((entry) => ({
      label: entry.label,
      failCount: entry.failCount,
      coolingMs: entry.cooldownUntil > now ? entry.cooldownUntil - now : 0,
      state: entry.cooldownUntil > now ? 'cooling' : entry.label === activeLabel ? 'active' : 'available',
    })),
  };
}

/**
 * Jedes Vorkommen von Schlüsselmaterial aus einem Text entfernen — der Filter,
 * durch den JEDER Log-Eintrag dieses Pakets geht.
 *
 * Ersetzt wird die ganze Zeichenfolge, nicht ein Präfix: eine Meldung mit
 * `sk-abc…` ist so brauchbar wie die mit dem ganzen Schlüssel. Gesucht wird auch
 * in zusammengesetzten Texten, weil ein Fehlerobjekt seinen Eingabe-Wert mit
 * sich führen kann.
 * → Kanon: docs/COMMENT-KANON.md#k-45cb09b9a337
 */
export function redact(text, secrets) {
  let result = typeof text === 'string' ? text : String(text);
  for (const secret of Array.isArray(secrets) ? secrets : []) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    result = result.split(secret).join('[key]');
  }
  return result;
}

/**
 * Die Kopfzeilen des Anbieters — der EINE Ort, an dem Schlüsselmaterial das
 * Paket verlässt, und nur in Richtung Anbieter.
 *
 * `anthropic` trägt seinen Schlüssel in `x-api-key` und verlangt eine
 * Protokoll-Kennung; `openai-compatible` trägt ihn als `Bearer`.
 *
 * @param provider - { protocol }.
 * @param key - der Schlüsselwert.
 */
export function authHeaders(provider, key) {
  const protocol = provider?.protocol ?? 'openai-compatible';
  if (protocol === 'anthropic') {
    return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  }
  return { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
}

/**
 * Die Anfrage des Verbindungstests: die Modelle des Anbieters abfragen.
 *
 * Zurück kommt ein BESCHREIBUNGSOBJEKT — `url`, `method`, `headers`. Der Kopf
 * trägt den Schlüssel, alles andere ist öffentlich; der Aufrufer darf `url` und
 * `method` protokollieren und die Kopfzeilen nicht.
 *
 * @param provider - { baseUrl, probePath }.
 * → Kanon: docs/COMMENT-KANON.md#k-3151d0b41c2a
 */
export function buildProbeRequest(provider, key, probePath = '/models') {
  const base = typeof provider?.baseUrl === 'string' ? provider.baseUrl.replace(/\/+$/, '') : '';
  const path = typeof provider?.probePath === 'string' && provider.probePath !== '' ? provider.probePath : probePath;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return { url: `${base}${suffix}`, method: 'GET', headers: authHeaders(provider, key) };
}

/**
 * Das Ergebnis eines Verbindungstests — aus der Antwort, ohne Kopfzeilen.
 *
 * Gelesen werden nur Status und die Modelle; fehlen sie, bleibt es bei `null`
 * statt bei einer erfundenen Zahl. Eine Fehlermeldung wird durch `redact`
 * geschickt, weil ein Anbieter die Anfrage (samt Kopf) zurückgeben kann.
 *
 * @param response - { ok, status, json } wie `fetch` es liefert.
 * @param secrets - die Schlüsselwerte, die nicht erscheinen dürfen.
 */
export async function probeResult(response, secrets) {
  const status = typeof response?.status === 'number' ? response.status : 0;
  if (response?.ok !== true) {
    return { ok: false, status, detail: redact(`HTTP ${status}`, secrets) };
  }
  let models = null;
  try {
    const body = await response.json();
    const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : null;
    if (list !== null) models = list.map((item) => item?.id ?? item?.name).filter((id) => typeof id === 'string');
  } catch {
    // Ein Anbieter ohne JSON ist kein Fehler des Tests: die Verbindung stand.
    models = null;
  }
  return { ok: true, status, models };
}
