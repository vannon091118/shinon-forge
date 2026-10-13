/**
 * @shinon/key-router — reiner Kern (assets/pool-core.js).
 *
 * KEINE Imports: nur dann läuft der Test in CI ohne `node_modules` — dieselbe
 * Regel wie bei `@shinon/scoring` (scoring-core.js), `@shinon/popup`
 * (trajectory-core.js) und `@shinon/prompter` (note-core.js). `index.js`
 * re-exportiert, was die Host-Hälfte braucht; die Namen bleiben dieselben.
 *
 * DIE SICHERHEITSREGEL IST HIER MECHANIK, NICHT EINE ZUSAGE IM KOMMENTAR:
 * Schlüsselmaterial verlässt diesen Kern nur auf ZWEI Wegen —
 *
 *   1. `buildProbeRequest()` legt es in den `Authorization`-Kopf. Das ist der
 *      einzige Ort, an dem es das darf: Kopfzeilen gehen an den Anbieter, nicht
 *      in eine Antwort.
 *   2. `redact()` entfernt es aus Text, der geloggt wird.
 *
 * Alles andere, was nach außen geht — `statusOf()`, die Werkzeug-Ergebnisse,
 * jeder Log-Eintrag — trägt die BESCHRIFTUNG des Poolplatzes (`key#1`, `key#2`)
 * und niemals den Schlüssel. Der Grund ist gemessen und nicht theoretisch: was
 * ein Werkzeug zurückgibt, landet im Kontext des Modells und damit in der
 * Transkription der Sitzung; ein „Key-Präfix zur Wiedererkennung" ist dort ein
 * Leck, kein Komfort. Die Reihenfolge des Pools ist der Ausweis (die Namen kommen
 * aus der Umgebung) — mehr braucht ein Mensch nicht, um einen Platz zu benennen.
 *
 * WARUM DAS ÜBERHAUPT EINE DATEI IST: die Backoff-Rechnung und die Auswahl waren
 * vorher mit einer echten Uhr (`Date.now()`) und echtem Zufall (`Math.random()`)
 * verwoben; damit war jeder Test eine Wahrscheinlichkeitsaussage über einen
 * Zeitpunkt. Hier kommen Uhr und Zufall als ARGUMENTE herein, und das Verhalten
 * ist nachrechenbar.
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

/**
 * Die Werte zu den NAMEN aus der Umgebung lesen — der einzige Bezug von
 * Schlüsselmaterial in diesem Paket.
 *
 * `names` sind ausdrückliche Namen, `prefix` sammelt zusätzlich `<prefix>_*`.
 * Eine Config kann KEINEN Schlüssel tragen: das Schema dieses Pakets hat kein
 * Feld dafür (`scripts/gate/tests/key-router-security.test.mjs` prüft das am
 * Schema, nicht an der Absicht) — eine Profildatei ist versioniert.
 *
 * @param env - die Umgebung (ein Objekt, damit der Test sie stellen kann).
 * @param options - { names, prefix }.
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
 * @param now - Zeitstempel in ms.
 * @param force - erzwingt einen anderen Platz, wenn es einen gibt.
 * @param activeLabel - der zuletzt benutzte Platz (für `force`).
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
 *
 * @param text - der Text (oder ein beliebiger Wert; er wird zu Text).
 * @param secrets - die Werte, die nicht erscheinen dürfen.
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
 * @param key - der Schlüsselwert.
 * @param probePath - Rückfall, wenn der Anbieter keinen eigenen Pfad nennt.
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
