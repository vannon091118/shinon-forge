#!/usr/bin/env node
/**
 * start.mjs — Kompatibilitäts-Einstieg, keine zweite Umsetzung.
 *
 * Die Startlogik (Node-Heilung, EINE dsh-Auflösung über `dshBinary()`,
 * `--check` mit Herkunftsangabe, Start mit `--profile <aktiv>`) steht seit
 * Schritt 3.4 in [bin/shinon.mjs](../bin/shinon.mjs) — dort, wo auch das
 * `bin`-Feld des Root-Manifests hinzeigt. Diese Datei bleibt, weil vorhandene
 * Aufrufe und Dokumente den Pfad `scripts/start.mjs` nennen; sie importiert
 * → Kanon: docs/COMMENT-KANON.md#k-b511ea13ded6
 */
import '../bin/shinon.mjs';
