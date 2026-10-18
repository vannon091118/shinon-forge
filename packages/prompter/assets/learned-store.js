/**
 * @shinon/prompter — learned-store.js
 *
 * Der EINE Schreibweg des Hosts: die gelernten Bausteine (Propose-Seam).
 *
 * Bis zur Index-Konsolidierung lag dieser Helfer im Runtime-Index-Modul, das
 * auch schrieb; mit dem zweiten Index fiel die Begruendung weg, nicht die
 * Aufgabe. Der Prompter liest sonst nur — die Ausnahme steht deshalb hier mit
 * Adresse, und der Isolationstest nennt genau diese Datei.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/** JSON schreiben, Verzeichnis bei Bedarf anlegen. Pfade relativ zum cwd. */
export function writeJsonFile(path, value) {
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  try {
    mkdirSync(dirname(full), { recursive: true });
  } catch {
    /* existiert bereits oder kein Zugriff — writeFileSync meldet den echten Fall */
  }
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
