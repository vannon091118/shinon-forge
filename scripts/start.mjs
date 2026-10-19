#!/usr/bin/env node
/**
 * start.mjs — Kompatibilitäts-Einstieg, keine zweite Umsetzung.
 *
 * Die Startlogik (Node-Heilung, EINE dsh-Auflösung über `dshBinary()`,
 * `--check` mit Herkunftsangabe, Start mit `--profile <aktiv>`) steht seit
 * Schritt 3.4 in [bin/shinon.mjs](../bin/shinon.mjs) — dort, wo auch das
 * `bin`-Feld des Root-Manifests hinzeigt. Diese Datei bleibt, weil vorhandene
 * Aufrufe und Dokumente den Pfad `scripts/start.mjs` nennen; sie importiert
 * genau dieselbe Umsetzung, statt sie zu kopieren (zwei Startpfade wären zwei
 * Wahrheiten).
 *
 * Aufruf: `node scripts/start.mjs [--check] [dsh-Argumente …]` — identisch zu
 * `npm start [-- …]` und `shinon [--check] …`.
 *
 * Ob dieser Pfad weiterhin existieren muss, entscheidet Schritt 3.7
 * (Build- und Gate-Ballast); bis dahin ist er die kompatible Adresse.
 */
import '../bin/shinon.mjs';
