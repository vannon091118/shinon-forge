/**
 * port.mjs — dynamische Port-Wahl für den 1-Click-Start.
 *
 * WARUM: der Wrapper hielt den Port als Konstante (`3081`). Ein zweiter Start
 * oder ein belegter Port kollidiert dann hart — DSH bricht am Bind ab, die
 * READY-Zeile kommt nie, und der Fehler sieht aus wie ein kaputtes Profil. Die
 * Nummer wird deshalb VOR dem Boot gewählt, und zwar mit einem echten
 * Bind-Versuch: „Port frei" ist eine Messung, keine Annahme.
 *
 * GRENZE, benannt statt verschwiegen: zwischen Probe und DSHs eigenem Bind
 * liegt ein Fenster (TOCTOU). Es ist klein; der Wrapper liest den tatsächlich
 * bedienten Port aus der READY-Zeile zurück und meldet eine Abweichung. Wer
 * jedes Fenster ausschließen will, gibt `--port 0` und läßt das Betriebssystem
 * binden (dsh-host-webserver: `server.listen(config.port)`).
 *
 * Reine Logik plus EIN echter Socket auf 127.0.0.1 — kein Netz nach außen.
 */
import { createServer } from 'node:net';

export const DEFAULT_PORT_BASE = 3081;
export const DEFAULT_PORT_TRIES = 20;
export const PROBE_HOST = '127.0.0.1';

/** Höchste gültige Portnummer. 0 heißt: vom Betriebssystem wählen lassen. */
const MAX_PORT = 65535;
const PORT_PATTERN = /^[0-9]{1,5}$/;

/**
 * CLI-Wert zu einer Portnummer.
 * `{ ok: true, port: null }` = keine Angabe (dann wird gewählt),
 * `{ ok: true, port: 0 }` = ausdrücklich ein vom Betriebssystem gewählter Port,
 * `{ ok: false }` = keine Portnummer (der Aufrufer meldet das, statt zu raten).
 */
export function parsePort(value) {
  if (value === undefined || value === null) return { ok: true, port: null };
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= MAX_PORT ? { ok: true, port: value } : { ok: false };
  }
  const text = String(value).trim();
  if (!PORT_PATTERN.test(text)) return { ok: false };
  const port = Number(text);
  return port <= MAX_PORT ? { ok: true, port } : { ok: false };
}

/** Ist der Port auf `host` frei? Ein echter Bind-Versuch, kein Raten. */
export function isPortFree(port, host = PROBE_HOST) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => {
      // Belegt oder verboten = nicht frei. Jeder andere Fehler ist ein Fehler.
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Erster freier Port ab `base` innerhalb von `tries` Kandidaten.
 * Wirft, wenn keiner frei ist: ein stiller Rückfall auf einen belegten Port
 * verschöbe den Fehler nur in den DSH-Boot, wo er teuer zu lesen ist.
 * `probe` ist injizierbar, damit die Auswahl ohne echte Sockets prüfbar bleibt.
 */
export async function pickFreePort({ base = DEFAULT_PORT_BASE, tries = DEFAULT_PORT_TRIES, probe = isPortFree } = {}) {
  if (!Number.isInteger(base) || base < 1 || base > MAX_PORT) throw new Error(`port: ungültige Basis ${base}`);
  if (!Number.isInteger(tries) || tries < 1) throw new Error(`port: ungültiges Fenster ${tries}`);
  for (let offset = 0; offset < tries; offset += 1) {
    const candidate = base + offset;
    if (candidate > MAX_PORT) break;
    if (await probe(candidate)) return candidate;
  }
  throw new Error(`port: kein freier Port in ${base}..${Math.min(base + tries - 1, MAX_PORT)}`);
}
