/**
 * markers — Gate des Marker-Spiegels (Wave 3).
 *
 * Der Spiegel übersetzt das Element-Marker-System aus brutalord-the-feral-cycle
 * in ein DSH-Bundle. Dieses Gate prüft die drei Zusagen, die daraus folgen:
 *
 *   1. Vertrag (assets/marker-model.json): acht Marken-Felder, id-Regel,
 *      Selektor-Grenze, Nutzlast-Format, Inbox, Speicherschlüssel, Grenzen,
 *      authority NONE, forbidden inkl. cdp_attach — und dass der Quellpfad
 *      benennt, was NICHT übernommen wurde (CDP/Daemon).
 *   2. Host (index.js): reine Ableiter und Prüfer, keine Datei-Schreibzugriffe,
 *      kein Netz, kein Modell, kein Zufall, kein Prozess-Ende. Ein Spiegel, der
 *      schreibt, ist kein Spiegel.
 *   3. Client (client.js): der native Side Panel über `main` + `sidebar.panellist`,
 *      dieselben Speicherschlüssel, dieselbe Nutzlast-Vorlage (keine zweite
 *      Wahrheit) und keine DOM-Injektions-Tricks (innerHTML, eval, document.write).
 *
 * Die Tests (scripts/gate/tests/markers.test.mjs) fahren zusätzlich das echte
 * Bundle isoliert gegen den Vertrag — inklusive der exakten Nutzlast-Zeile.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findForbidden, findMissing, stripComments } from '../../lib/source-scan.mjs';

export const id = 'markers';

/** Vertrags-Kennung des Spiegels. */
export const MODEL_CONTRACT = 'shinon.marker-mirror/v1';

/** Quelle des Spiegels — ein Marker-Spiegel ohne benannte Quelle ist ein Gerücht. */
export const SOURCE_REPO = 'vannon091118/brutalord-the-feral-cycle';

/** Die acht Marken-Felder, in Vertragsreihenfolge. */
export const MARK_FIELDS = ['id', 'label', 'selector', 'text', 'rect', 'href', 'url', 'ts'];

/** Native DSH-Slots: `main` ist der Panel-Platz, `sidebar.panellist` der Einstieg. */
export const PANEL_ID = 'shinon-markers';
export const PANEL_SLOTS = ['main', 'sidebar.panellist'];

/** Speicherschlüssel des Originals — der Spiegel benutzt dieselben. */
export const STORAGE_KEYS = ['__mk.marks', '__mk.comments'];

/** Was der Host nicht darf (die Beobachtung ist keine Aktion). */
export const FORBIDDEN_MODULES = ['child_process'];
export const FORBIDDEN_TOKENS = [
  'execSync',
  'spawn(',
  'writeFile',
  'writeFileSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'fetch(',
  'http.request',
  'Math.random',
  'process.exit',
  'ctx.llm',
  'ctx.agents',
  'ctx.shell',
  'eval(',
];

/** Was der Client nicht darf: fremde DOM-Injektion und zweite Speicher. */
export const CLIENT_FORBIDDEN_TOKENS = [
  'innerHTML',
  'outerHTML',
  'document.write',
  'new Function',
  'eval(',
  'sessionStorage',
  'indexedDB',
  'document.cookie',
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Vertrag prüfen. Reine Funktion — testbar ohne Repository. */
export function modelIssues(asset, file = 'assets/marker-model.json') {
  const issues = [];
  if (asset === null || typeof asset !== 'object') return [`${file}: kein Objekt`];

  if (asset.contract !== MODEL_CONTRACT) issues.push(`${file}: contract muss "${MODEL_CONTRACT}" sein (ist ${JSON.stringify(asset.contract)})`);
  if (asset.authority !== 'NONE') issues.push(`${file}: authority muss "NONE" sein (ist ${JSON.stringify(asset.authority)})`);
  if (asset.source?.repo !== SOURCE_REPO) issues.push(`${file}: source.repo muss ${SOURCE_REPO} sein`);

  if (!Array.isArray(asset.source?.paths) || asset.source.paths.length === 0) {
    issues.push(`${file}: source.paths fehlt (welche Dateien gespiegelt wurden)`);
  }
  if (!Array.isArray(asset.source?.not_copied) || asset.source.not_copied.length === 0) {
    issues.push(`${file}: source.not_copied fehlt — der Spiegel muss benennen, was er NICHT übernimmt`);
  }
  if (!Array.isArray(asset.forbidden) || !asset.forbidden.includes('cdp_attach')) {
    issues.push(`${file}: forbidden muss cdp_attach enthalten (kein Daemon, keine fremde Seite)`);
  }

  const fields = (asset.fields ?? []).map((field) => field?.name);
  for (const field of MARK_FIELDS) {
    if (!fields.includes(field)) issues.push(`${file}: Feld ${field} fehlt`);
  }
  for (const name of fields) {
    if (!MARK_FIELDS.includes(name)) issues.push(`${file}: unbekanntes Feld ${name}`);
  }
  if (fields.length !== MARK_FIELDS.length) issues.push(`${file}: ${MARK_FIELDS.length} Felder erwartet (sind ${fields.length})`);

  const idField = (asset.fields ?? []).find((field) => field?.name === 'id');
  if (!isText(idField?.pattern)) issues.push(`${file}: fields[id].pattern fehlt`);
  const rectField = (asset.fields ?? []).find((field) => field?.name === 'rect');
  if (!Array.isArray(rectField?.shape) || rectField.shape.join(',') !== 'x,y,w,h') {
    issues.push(`${file}: fields[rect].shape muss x,y,w,h sein`);
  }

  if (!Number.isInteger(asset.derivation?.selector?.maxParts) || asset.derivation.selector.maxParts < 3) {
    issues.push(`${file}: derivation.selector.maxParts muss eine Zahl ≥ 3 sein`);
  }
  if (asset.derivation?.selector?.skipClassPrefix !== '__mk') {
    issues.push(`${file}: derivation.selector.skipClassPrefix muss __mk sein (eigene Knoten zählen nicht)`);
  }

  const payload = asset.payload ?? {};
  if (!isText(payload.line)) issues.push(`${file}: payload.line fehlt (das Format ist Daten, nicht Code)`);
  if (!isText(payload.comment)) issues.push(`${file}: payload.comment fehlt`);
  if (!Array.isArray(payload.tokens) || payload.tokens.length < 4) {
    issues.push(`${file}: payload.tokens fehlt — ohne Marker-Token ist der Client nicht prüfbar`);
  } else {
    for (const token of payload.tokens) {
      if (!payload.line.includes(token) && !payload.comment.includes(token)) {
        issues.push(`${file}: Token ${JSON.stringify(token)} kommt in der Vorlage nicht vor`);
      }
    }
  }

  if (asset.inbox?.method !== 'POST') issues.push(`${file}: inbox.method muss POST sein`);
  if (asset.inbox?.body?.join(',') !== 'text,marks') issues.push(`${file}: inbox.body muss text,marks sein`);

  for (const key of STORAGE_KEYS) {
    if (!Object.values(asset.storage ?? {}).includes(key)) issues.push(`${file}: Speicherschlüssel ${key} fehlt`);
  }

  for (const [limit, value] of Object.entries(asset.limits ?? {})) {
    if (!Number.isInteger(value) || value <= 0) issues.push(`${file}: limits.${limit} muss eine natürliche Zahl sein`);
  }
  if (!Array.isArray(asset.invariants) || asset.invariants.length === 0) {
    issues.push(`${file}: invariants fehlt — ohne sie ist fail-closed nur ein Wort`);
  }
  return issues;
}

/** Host prüfen: die Spiegel-Funktionen müssen da sein, die Aktionen nicht. */
export function hostIssues(source, file = 'packages/markers/index.js') {
  const issues = [];
  for (const token of findMissing(source, ['export const Config', 'export function apply', 'loadModel', 'createMirror', 'normalizeMark', 'validateMark', 'renderPayload', 'nextMarkId'])) {
    issues.push(`${file}: ${token} fehlt (Spiegel-Kern unvollständig)`);
  }
  for (const token of findForbidden(source, FORBIDDEN_MODULES, { mode: 'module' })) {
    issues.push(`${file}: verbotener Modulimport ${token} — der Host spiegelt, er handelt nicht`);
  }
  for (const token of findForbidden(source, FORBIDDEN_TOKENS)) {
    issues.push(`${file}: verbotener Aufruf ${token} — der Host spiegelt, er handelt nicht`);
  }
  return issues;
}

/**
 * Client prüfen: nativer Side Panel, dieselbe Vorlage, dieselben Speicherschlüssel.
 * `asset` kommt mit, damit Drift zwischen Vertrag und Client auffällt: die
 * Nutzlast-Token müssen im Client-Code stehen, sonst gibt es zwei Formate.
 */
export function clientIssues(source, asset, file = 'packages/markers/client.js') {
  const issues = [];

  // Code-Token: echte Verdrahtung (Panel-Registrierung, Inbox-POST, Tasten).
  for (const token of findMissing(source, ['__ModuleLoader__', 'ctx.slots.register', 'fetch(INBOX', 'readMarks', 'readComments'])) {
    issues.push(`${file}: ${token} fehlt (Panel oder Speicher nicht verdrahtet)`);
  }
  // String-Token: Slot-Namen, Panel-Kennung, Speicherschlüssel, Tasten — sie sind
  // Vertragswerte und stehen als Strings im Code.
  for (const token of findMissing(source, [PANEL_ID, ...PANEL_SLOTS, ...STORAGE_KEYS, "'m'", "'Escape'"], { mode: 'module' })) {
    issues.push(`${file}: ${token} fehlt (Panel oder Speicher nicht verdrahtet)`);
  }
  for (const token of findForbidden(source, CLIENT_FORBIDDEN_TOKENS)) {
    issues.push(`${file}: verbotener Aufruf ${token} — der Spiegel injiziert nicht und schreibt in keinen zweiten Speicher`);
  }
  // Keine zweite Wahrheit: die Nutzlast-Vorlage des Vertrags muss im Client stehen.
  for (const token of findMissing(source, asset?.payload?.tokens ?? [], { mode: 'module' })) {
    issues.push(`${file}: Nutzlast-Token ${JSON.stringify(token)} fehlt — Client und Vertrag driften`);
  }

  // Netz nur zur Vertrags-Inbox: jedes fetch( muss auf INBOX zielen.
  for (const match of stripComments(source).matchAll(/fetch\(\s*([^)]*)/g)) {
    const target = match[1].split(',')[0].trim();
    if (target !== 'INBOX') {
      issues.push(`${file}: fetch(${target}…) — der Spiegel spricht nur mit der Vertrags-Inbox`);
    }
  }

  // Kein zweiter Speicher: jeder wörtliche Zugriff muss auf den Vertrags-
  // schlüsseln liegen. Zugriffe über eine Variable sind erlaubt (der Client
  // reicht die Schlüssel durch) — ein wörtlicher Fremdschlüssel nicht.
  for (const match of source.matchAll(/localStorage\.(?:get|set)Item\(\s*(['"])([^'"]+)\1/g)) {
    if (!STORAGE_KEYS.includes(match[2])) {
      issues.push(`${file}: fremder Speicherschlüssel ${JSON.stringify(match[2])} — der Spiegel schreibt nur unter ${STORAGE_KEYS.join(', ')}`);
    }
  }
  return issues;
}

export function check(ctx) {
  const pkg = ctx.packages.find((candidate) => candidate.dir === 'markers');
  if (!pkg) return ['packages/markers/ fehlt (Marker-Spiegel nicht vorhanden)'];

  const modelPath = join(pkg.base, 'assets/marker-model.json');
  if (!existsSync(modelPath)) return ['packages/markers/assets/marker-model.json fehlt'];

  let asset;
  try {
    asset = JSON.parse(readFileSync(modelPath, 'utf8'));
  } catch (error) {
    return [`assets/marker-model.json ist kein gültiges JSON: ${error.message}`];
  }

  const issues = [];
  issues.push(...modelIssues(asset));
  issues.push(...hostIssues(readFileSync(join(pkg.base, 'index.js'), 'utf8')));
  issues.push(...clientIssues(readFileSync(join(pkg.base, 'client.js'), 'utf8'), asset));

  const profileName = ctx.repo.activeProfile(ctx.root);
  if (profileName && !profileName.startsWith('create:')) {
    const profile = ctx.repo.resolveProfile(profileName, ctx.packages);
    if (!(profile.bundles ?? []).includes('@shinon/markers')) {
      issues.push(`Profil ${profileName}: @shinon/markers ist nicht in dsh.profile.bundles`);
    }
  }
  return issues;
}
