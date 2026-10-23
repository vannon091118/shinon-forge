/**
 * @shinon/persona — project-context.js
 *
 * Der Projekt-Kontext als Abschnitt: eine Datei aus dem Sitzungs-Workspace
 * (`.shinon/project-context.md` — die Datei des jeweiligen Projekts).
 *
 * WARUM EIGENE DATEI: der Host-Eintrag soll keine Datei lesen und kein
 * Zustandsobjekt bauen (docs/contracts/structure.json). Der Projekt-Kontext ist
 * eine LESE-Logik mit Cache — sie gehoert in den importfreien Kern, damit der
 * Test sie ohne node_modules pruefen kann.
 *
 * DER CACHE: der Kontext wird JE ROOT gelesen und gehalten. Der Boot kennt den
 * Root nicht (es gibt keinen deklarierten), die Sitzung schon. Ein leerer
 * Treffer wird MITgecacht, damit die Assembly nicht bei jedem Schritt das
 * Dateisystem fragt — der Context ist der haeufigste Schritt im Prompt-Aufbau.
 *
 * LEER = KEIN ABSCHNITT: eine fehlende Datei ergibt einen leeren Text, und der
 * Abschnitt faellt dann weg. Das ist die Ehrlichkeit, die das Gate verlangt:
 * ein leerer Abschnitt behauptet einen Projektkontext, den es nicht gibt.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * Den Projekt-Kontext fuer eine Sitzung lesen — mit Cache je Pfad.
 *
 * @param {object} quellen
 * @param {string} quellen.contextPath der konfigurierte Pfad (relativ zum Root)
 * @param {Function} quellen.root die Wurzel der Sitzung (oder null)
 * @param {Function} [quellen.declaredRoot] der deklarierte Root als Rueckfall
 * @param {Map} quellen.cache der Cache (der Aufrufer haelt ihn)
 * @param {Function} [quellen.warn] der Diagnosekanal
 * @param {Function} [quellen.log] der Info-Kanal
 * @returns {string} der Text — leer, wenn es keinen gibt
 */
export function readProjectContext({
  contextPath = '',
  root = () => null,
  declaredRoot = null,
  cache = new Map(),
  warn = () => {},
  log = () => {},
} = {}) {
  if (typeof contextPath !== 'string' || contextPath === '') return '';
  const wurzel = typeof root === 'function' ? root() : root;
  const basis = typeof wurzel === 'string' && wurzel !== '' ? wurzel : declaredRoot;
  if (typeof basis !== 'string' || basis === '') return '';
  const path = isAbsolute(contextPath) ? contextPath : join(basis, contextPath);
  if (cache.has(path)) return cache.get(path);
  let value = '';
  try {
    if (existsSync(path)) value = readFileSync(path, 'utf8').trim();
  } catch (error) {
    warn(`Projekt-Kontext nicht lesbar (${error?.message})`);
  }
  cache.set(path, value);
  if (value !== '') log(`Projekt-Kontext geladen (${contextPath}, ${basis})`);
  return value;
}
