import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dshRoot } from '../../lib/yaml.mjs';
import { codeOnly, findForbidden } from '../../lib/source-scan.mjs';
import { listFiles, protectedReason, toProjectPath } from '../../../packages/project-index/assets/index-core.js';
import { provideSeamCore } from './helpers/bundle-sandbox.mjs';
import { quiet } from './helpers/console.mjs';
import { PACKAGE_DIR, INDEX_FILE, root, require, bundleDir, loadBundle, bundle, Context, goodResult, reply, userMessage, stepPayload, connect, fakeLlm, route, loopDefault, dummyContext, contextDir, contextFile, dummyContextPath, runtimeModules, harnessMessage, REGION_MARK, regionHits, isOneRegion, MARKEN_AUSREISSER } from './prompter-contract-fixtures.mjs';




// ── 7. Der Stand: die Zettel (Zug 4) ────────────────────────────────────────
//
// Der Veredler LIEST die Zettel und PRUEFT sie; er erzeugt keinen. Hier wird
// der echte Weg gefahren: `apply()` an einem echten Cordis-Context, echter
// Waterfall, echter Aufruf — und die Zettel liegen in einem eigenen Verzeichnis,
// damit kein Test von der Sammlung dieses Repos abhaengt. Der Stand ist ein
// EIGENER Block nach dem Kontextblock; fehlt der Kontext, gibt es keinen Stand,
// und ohne `notesPath` gibt es gar kein Lesen.

export const notesRoot = mkdtempSync(join(tmpdir(), 'shinon-prompter-notes-'));

/** Ein Zettel im Vertragsformat — die Grenzen stehen in den Regeln, nicht hier. */
export const note = (thema, over = {}) => JSON.stringify({
  contract: 'shinon.skill-note/v1',
  version: 1,
  thema,
  bei: 'Eine Pruefung steht an',
  immer: 'zuerst die Tabelle lesen und dann erst rechnen',
  weil: 'eine Zahl ohne ihre Tabelle ist eine Behauptung',
  beleg: 'scripts/gate/tests/prompter-contract.test.mjs',
  ...over,
});

/** Ein Zettel-Verzeichnis mit genau den genannten Dateien. */
export function notesFor(label, files) {
  const dir = join(notesRoot, label);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

export const contextProject = (prompt = 'Bitte pruefe die Pruefung im prompter') => [
  { id: 'm-1', role: 'user', content: [{ type: 'text', text: prompt }], source: { kind: 'user' } },
];


/**
 * Der Kanal ist der EINGANG dieses Feldes: der Prompter hält den letzten
 * Composite (Zug 6), der Schritt trägt ihn in Stand UND Spur.
 *
 * Geprüft wird der ganze Weg — Kanal → Laufzeit → `standFor` → Entscheidungs-
 * datensatz —, und zwar aus einem Grund: genau er war zuletzt unterbrochen. Der
 * Composite kam auf dem Kanal an, die Laufzeit hielt ihn, aber der Stand gab ihn
 * nicht weiter; kein Test fuhr die Kette, weil alle den Stand DIREKT aufriefen.
 * Ein Feld, das nur im direkten Aufruf existiert, existiert im Betrieb nicht.
 */





// ── 8. Der Ton in der Spur, nicht im Block (Zug 5) ─────────────────────────
//
// Haltung und Tendenzen kommen aus dem Scoring — ueber dieselbe Bauform der
// Naht (optionales `get`, gepruefter Vertragsname). Sie landen NICHT im
// Veredler-Block: der Stand traegt nur Zettel, der Ton steht im Live-Block
// des Hauptmodells und als Datensatz in der Spur.

/** Eine Ton-Faehigkeit in der Form, die @shinon/scoring anbietet. */
export const toneService = (state) => ({
  [bundle.SCORING_SERVICE]: {
    contract: bundle.SCORING_SERVICE_CONTRACT,
    read: () => state,
  },
});

export const toneState = {
  stance: 'kritisch',
  ready: true,
  reason: null,
  tendencies: [{ klasse: 'korrektur', stufe: 'hoch', share: 0.6 }, { klasse: 'zustimmung', stufe: 'niedrig', share: 0.1 }],
  signals: 5,
};





// ── 14. Skills: der Veredler injiziert keine ───────────────────────────────

/**
 * Skills gehoeren dem Hauptagenten ueber die native DSH-Skill-Discovery —
 * der Veredler redigiert Text und bekommt keinen Skill-Block. Auch ein
 * Skill-Verzeichnis mit Treffern aendert daran nichts: Der Request traegt
 * keinen `<shinon_skills>`- und keinen `<selected_skills>`-Block, der Schritt
 * laeuft trotzdem.
 *
 * Der Fall ist so gebaut, dass ein Treffer sicher zustande kaeme: `a-arch`
 * trifft dreimal (quartz, runtime, architektur), `z-spezial` einmal (ueber die
 * Intent-Expansion). Frueher wurde an dieser Stelle die Auswahl gepinnt (nur
 * der Nutzertext gilt als ausdrueckliche Nennung); heute zaehlt sie nicht mehr,
 * weil der Veredler Skills gar nicht mehr liest.
 */


