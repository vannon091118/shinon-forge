/**
 * @shinon/prompter — learned-store.js
 *
 * Die EINE Schreibdatei des Hosts: gelernte Bausteine (Propose-Seam) und das
 * Probe-Journal der verworfenen One-Shot-Antworten.
 *
 * Bis zur Index-Konsolidierung lag dieser Helfer im Runtime-Index-Modul, das
 * auch schrieb; mit dem zweiten Index fiel die Begruendung weg, nicht die
 * Aufgabe. Der Prompter liest sonst nur — die Ausnahme steht deshalb hier mit
 * Adresse, und der Isolationstest nennt genau diese Datei.
 */
import { appendFileSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';

/** JSON schreiben, Verzeichnis bei Bedarf anlegen. Pfade relativ zum cwd. */
export function writeJsonFile(path, value) {
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  try {
    mkdirSync(dirname(full), { recursive: true });
  } catch {
    /* existiert bereits oder kein Zugriff — writeFileSync meldet den echten Fall */
  }
  const temp = `${full}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(temp, full);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* temporaere Datei ist schon weg */ }
    throw error;
  }
}

/**
 * Eine Zeile an ein JSONL-Journal anhaengen — das Probe-Journal der verworfenen
 * One-Shot-Antworten.
 *
 * Warum hier und nicht in `enhancer.js`: der One-Shot-Pfad bleibt ohne
 * Dateisystem (der Isolationstest pinnt das); geschrieben wird ausschliesslich
 * in der Host-Komposition ueber DIESE eine Datei. Angehaengt, nie ueberschrieben:
 * jede verworfene Antwort ist ein eigener Beleg, auch ueber Neustarts hinweg.
 */
export function appendJsonLine(path, value) {
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  try {
    mkdirSync(dirname(full), { recursive: true });
  } catch {
    /* existiert bereits oder kein Zugriff — appendFileSync meldet den echten Fall */
  }
  appendFileSync(full, `${JSON.stringify(value)}\n`, 'utf8');
}
