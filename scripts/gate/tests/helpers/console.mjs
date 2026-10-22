/**
 * Konsolenausgaben eines Bundle-Aufrufs stumm schalten — EINE Fassung.
 *
 * Warum es diesen Helfer gibt: dieselbe Funktion stand am 2026-10-22 in zwoelf
 * Gate-Tests, in drei Fassungen (mit und ohne `error`, eine ohne
 * Wiederherstellung von `error`). Der Unterschied war nie eine Absicht, sondern
 * ein Copy-Paste-Rest — und eine Fassung, die `console.error` nicht
 * zurueckgibt, verschluckt danach jeden Fehler des Testlaufs. Diese Fassung
 * schaltet alle drei Kanaele und stellt sie im `finally` wieder her, auch wenn
 * der Aufruf wirft.
 *
 * `keep` ist die eine Ausnahme, die es BRAUCHT: ein Test, der prueft, dass eine
 * Warnung ankommt, muss genau diesen Kanal hoeren. Ihn dafuer auszubauen und
 * einen zweiten Aufbau ohne Helfer hinzustellen, waere die Kopie, die dieser
 * Helfer gerade beseitigt.
 */
export function quiet(fn, { keep = [] } = {}) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const key of ['log', 'warn', 'error']) if (!keep.includes(key)) console[key] = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}
