#!/usr/bin/env node
/**
 * stages.mjs - Teststufen G1..G8, einzeln und aggregiert.
 *
 *   node scripts/stages.mjs            # alle Stufen
 *   node scripts/stages.mjs G4 G5      # nur diese Stufen
 *   node scripts/stages.mjs --strict   # auch G6..G8 müssen grün sein
 *
 * Jede Stufe hat ein echtes Erfolgskriterium und meldet grün oder rot mit Grund.
 * G4 fährt den Stack wirklich hoch (DSH_HOME=<Repo> dsh --profile shinon), alles
 * andere prüft gegen diese laufende Instanz oder gegen die früheren Stufen.
 */
import { execFileSync, spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as repo from './lib/repo.mjs';
import { findOnPath } from './lib/yaml.mjs';

const root = repo.readRoot();
const profileName = repo.activeProfile(root);
const packages = repo.discover(root);
const { profile } = repo.repoIssues(packages, root);
const BUNDLES = profile.entries.map((entry) => ({ id: entry.id, name: entry.name, dir: entry.dir }));
const OPTIONAL = new Set(['G6', 'G7', 'G8']);
/** Marker, mit denen DSH eine nicht aktivierte Zeile meldet. */
const FAILURE_MARKERS = ['did not activate', 'import failed', 'pending (waiting for service', 'Failed to load'];
const READY = /dsh web: (http:\/\/\S+)/;

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

/** Kindprozess mit gesammelter Ausgabe; Exit-Status bleibt erhalten. */
function run(file, args, options = {}) {
  try {
    const output = execFileSync(file, args, { cwd: repo.ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
    return { code: 0, output };
  } catch (e) {
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const node = (script, args = []) => run(process.execPath, [join(repo.ROOT, 'scripts', script), ...args]);

/** Den Stack wirklich hochfahren und auf die Bereitschaftszeile warten. */
async function boot({ patch } = {}) {
  const dsh = findOnPath('dsh');
  if (dsh === null) return { error: 'dsh nicht im PATH' };
  const args = ['--profile', profileName, ...(patch === undefined ? [] : ['--patch', patch]), '--no-open'];
  const child = spawn(dsh, args, { cwd: repo.ROOT, env: { ...process.env, DSH_HOME: repo.ROOT } });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const deadline = Date.now() + 60000;
  let url = null;
  while (Date.now() < deadline && url === null && child.exitCode === null) {
    url = READY.exec(log)?.[1] ?? null;
    if (url === null) await delay(200);
  }
  return {
    child,
    url,
    log: () => log,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      for (let i = 0; i < 50 && child.exitCode === null; i++) await delay(100);
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

/** Seite über den Token-Flow abrufen (303 + Cookie), Exit-Status bleibt im Ergebnis. */
async function fetchPage(url, cookie = '') {
  const response = await fetch(url, { redirect: 'manual', headers: cookie === '' ? {} : { cookie } });
  if (response.status >= 300 && response.status < 400) {
    const next = (response.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ');
    return fetchPage(new URL(response.headers.get('location'), url).href, next);
  }
  return { status: response.status, body: await response.text(), cookie };
}

/** Chromium aus CHROMIUM oder den üblichen Ablagen. */
function findChrome() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const fromPath = findOnPath('chromium') ?? findOnPath('google-chrome') ?? findOnPath('chrome');
  if (fromPath !== null) return fromPath;
  const cached = execFileSync('bash', ['-c', 'ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | tail -1'], { encoding: 'utf8' }).trim();
  return cached === '' ? null : cached;
}

function activationLines(log) {
  return log.split('\n').filter((line) => /^\[[^\]]+\] Aktiviert/.test(line)).sort();
}

const STAGES = {
  /** G1 - statische Struktur: Syntax, Namen, Patch-Schema, Ressourcen, Profil. */
  async G1() {
    const result = node('dsh-test.mjs');
    // Geprueft wird der VERTRAG (Exit 0 und „0 fehlgeschlagen"), nicht eine eingefrorene Zahl:
    // die Anzahl der Checks waechst mit dem Repo, die Konstante nicht. Der Wert im Detail kommt
    // aus dem Lauf — validate-test.mjs loest dieselbe Falle fuer die Kontrolle.
    const summary = /Ergebnisse: (\d+) bestanden, 0 fehlgeschlagen/.exec(result.output);
    const green = result.code === 0 && summary !== null;
    return { green, detail: green ? `${summary[1]} Checks` : lastLines(result.output, 3) };
  },
  /** G2 - Verträge: Regel-Fixtures (rot je Regel) und DSH-Profilauflösung. */
  async G2() {
    const fixtures = node('validate-test.mjs');
    const profileTest = node('dsh-profile-test.mjs');
    // Wie G1: der Vertrag statt eingefrorener Zaehlwerte — die Zahl der Regeln waechst mit dem Repo.
    const fixtureSummary = /Ergebnisse: (\d+) bestanden, 0 fehlgeschlagen/.exec(fixtures.output);
    const profileSummary = /Ergebnisse: (\d+) bestanden, 0 fehlgeschlagen/.exec(profileTest.output);
    const green = fixtures.code === 0 && fixtureSummary !== null && profileTest.code === 0 && profileSummary !== null;
    return { green, detail: green ? `${fixtureSummary[1]} Fixtures + ${profileSummary[1]} Profil-Checks` : `${lastLines(fixtures.output, 2)} | ${lastLines(profileTest.output, 2)}` };
  },
  /** G3 - Build: Artefakte und Distributionstest. */
  async G3() {
    const build = node('build.mjs');
    const pack = node('pack-test.mjs');
    // Die Paketanzahl kommt aus dem Repo, die Schrittzahl aus dem Lauf — nicht aus einer
    // Konstante, die beim naechsten Paket falsch wird (dist liefert heute 16 Pakete).
    const artifacts = new RegExp(`Artefakte: dist/ mit ${packages.length} Paketen`).test(build.output);
    const packSummary = /Ergebnisse: (\d+) bestanden, 0 fehlgeschlagen/.exec(pack.output);
    const green = build.code === 0 && artifacts && pack.code === 0 && packSummary !== null;
    return { green, detail: green ? `dist/ + ${packSummary[1]} Distribution-Checks` : `${lastLines(build.output, 2)} | ${lastLines(pack.output, 2)}` };
  },
  /** G4 - echter Boot: alle Bundles aktivieren, Server antwortet. */
  async G4() {
    const server = await boot();
    if (server.error) return { green: false, detail: server.error };
    try {
      if (server.url === null) return { green: false, detail: `kein Bereitschaftssignal: ${lastLines(server.log(), 2)}` };
      const log = server.log();
      const inactive = BUNDLES.filter((bundle) => !new RegExp(`\\[${bundle.id}\\] Aktiviert`).test(log)).map((bundle) => bundle.id);
      const failures = FAILURE_MARKERS.filter((marker) => log.includes(marker));
      const page = await fetchPage(server.url);
      if (inactive.length > 0) return { green: false, detail: `nicht aktiviert: ${inactive.join(', ')}` };
      if (failures.length > 0) return { green: false, detail: `DSH meldet: ${failures.join(', ')}` };
      if (page.status !== 200) return { green: false, detail: `HTTP ${page.status} auf ${server.url}` };
      return { green: true, detail: `${BUNDLES.length}/${BUNDLES.length} Bundles aktiv, HTTP 200` };
    } finally {
      await server.stop();
    }
  },
  /** G5 - Laufzeit-Integration: die Client-Hälften werden wirklich ausgeliefert. */
  async G5() {
    const server = await boot();
    if (server.error) return { green: false, detail: server.error };
    try {
      if (server.url === null) return { green: false, detail: 'kein Bereitschaftssignal' };
      const page = await fetchPage(server.url);
      // Alle Modul-Eintraege einsammeln und dekodieren — dasselbe Muster wie scripts/panel-check.mjs.
      // Vorher stand hier ein Regex-Literal ohne schliessendes `/`: die Datei parste gar nicht
      // ("Invalid regular expression: missing /"), also liefen G1..G8 nie.
      const preload = [...page.body.matchAll(/plugins\/\?\?([^"]+)/g)]
        .map((match) => decodeURIComponent(match[1]))
        .join('\n');
      const missing = BUNDLES.filter((bundle) => !preload.includes(`${bundle.name}/client.js`)).map((bundle) => bundle.name);
      if (missing.length > 0) return { green: false, detail: `nicht im Client-Bundle: ${missing.join(', ')}` };
      if (preload.includes('@shinon/openapi')) return { green: false, detail: '@shinon/openapi ist aktiv, soll es nicht sein' };
      const href = page.body.match(/href="(plugins\/\?\?[^"]+)"/)?.[1].replaceAll('&amp;', '&');
      const module = await fetchPage(new URL(href, server.url).href, page.cookie);
      if (module.status !== 200) return { green: false, detail: `Client-Bundle HTTP ${module.status}` };
      const absent = BUNDLES.filter((bundle) => !module.body.includes(bundle.name)).map((bundle) => bundle.name);
      if (absent.length > 0) return { green: false, detail: `Client-Code fehlt im Bundle: ${absent.join(', ')}` };
      return { green: true, detail: `${BUNDLES.length} Client-Hälften ausgeliefert, openapi inaktiv` };
    } finally {
      await server.stop();
    }
  },
  /** G6 - Browser: echte Chromium-Instanz rendert die App ohne Plugin-Fehler. */
  async G6() {
    const chrome = findChrome();
    if (chrome === null) return { green: false, detail: 'kein Chromium gefunden (CHROMIUM setzen)' };
    const server = await boot();
    if (server.error) return { green: false, detail: server.error };
    try {
      if (server.url === null) return { green: false, detail: 'kein Bereitschaftssignal' };
      const dom = run(chrome, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--virtual-time-budget=15000', '--dump-dom', server.url,
      ], { timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
      const html = dom.output;
      if (dom.code !== 0) return { green: false, detail: `Chromium Exit ${dom.code}` };
      const broken = FAILURE_MARKERS.filter((marker) => html.includes(marker));
      if (broken.length > 0) return { green: false, detail: `Seite meldet: ${broken.join(', ')}` };
      if (!html.includes('Shinon Forge')) return { green: false, detail: 'Marke nicht im DOM' };
      if (!html.includes('data-plugin-css="@shinon/')) return { green: false, detail: 'keine Shinon-Styles im DOM' };
      return { green: true, detail: 'Marke + Styles gerendert, keine Plugin-Fehler' };
    } finally {
      await server.stop();
    }
  },
  /** G7 - Fehlerpfade: kaputtes Overlay und schema-ungültige Config. */
  async G7() {
    const dir = mkdtempSync(join(tmpdir(), 'shinon-g7-'));
    try {
      const broken = join(dir, 'broken.yml');
      const invalid = join(dir, 'invalid.yml');
      writeFileSync(broken, '- id: [unterminated\n');
      writeFileSync(invalid, '- id: shinon-tooltip\n  config:\n    tooltipDelay: soon\n');

      const overlay = run(findOnPath('dsh'), ['--profile', profileName, '--patch', broken, '--dump-config'], { env: { ...process.env, DSH_HOME: repo.ROOT } });
      if (overlay.code === 0) return { green: false, detail: 'kaputtes Overlay wurde akzeptiert' };
      if (!overlay.output.includes('failed to parse overlay')) return { green: false, detail: `Overlay-Fehler unklar: ${lastLines(overlay.output, 2)}` };

      const server = await boot({ patch: invalid });
      if (server.error) return { green: false, detail: server.error };
      try {
        const log = server.log();
        if (!/ValidationError: invalid config/.test(log)) return { green: false, detail: 'ungültige Config wurde nicht gemeldet' };
        if (new RegExp(`\\[shinon-tooltip\\] Aktiviert`).test(log)) return { green: false, detail: 'ungültige Config lief trotzdem' };
        if (!/1 entry did not activate/.test(log)) return { green: false, detail: 'keine Zusammenfassung der nicht aktivierten Zeile' };
        return { green: true, detail: 'Overlay-Fehler bricht ab, ungültige Config wird abgelehnt' };
      } finally {
        await server.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  /** G8 - Replay: zwei Boots verhalten sich gleich, zwei Dumps sind identisch. */
  async G8() {
    const dumps = [0, 1].map(() => run(findOnPath('dsh'), ['--profile', profileName, '--dump-config'], { env: { ...process.env, DSH_HOME: repo.ROOT } }));
    if (dumps.some((dump) => dump.code !== 0)) return { green: false, detail: '--dump-config nicht grün' };
    if (dumps[0].output !== dumps[1].output) return { green: false, detail: 'zwei Dumps unterscheiden sich' };

    const first = await boot();
    const firstLines = first.error === undefined && first.url !== null ? activationLines(first.log()) : null;
    if (first.error === undefined) await first.stop();
    const second = await boot();
    const secondLines = second.error === undefined && second.url !== null ? activationLines(second.log()) : null;
    if (second.error === undefined) await second.stop();
    if (firstLines === null || secondLines === null) return { green: false, detail: 'Boot nicht reproduzierbar' };
    if (firstLines.join('\n') !== secondLines.join('\n')) return { green: false, detail: 'Aktivierungsfolge unterscheidet sich' };
    return { green: true, detail: `${firstLines.length} Aktivierungen in beiden Läufen identisch` };
  },
};

function lastLines(output, count) {
  const lines = output.trim().split('\n').filter(Boolean);
  return lines.slice(-count).join(' | ').slice(0, 240);
}

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const requested = argv.filter((value) => !value.startsWith('--')).map((value) => value.toUpperCase());
const selected = requested.length > 0 ? requested : Object.keys(STAGES);
const unknown = selected.filter((id) => STAGES[id] === undefined);
if (unknown.length > 0) {
  console.error(`❌ Unbekannte Stufe(n): ${unknown.join(', ')} - verfügbar: ${Object.keys(STAGES).join(', ')}`);
  process.exit(1);
}

console.log('═══════════════════════════════════════');
console.log('  Shinon Forge Teststufen');
console.log('═══════════════════════════════════════\n');
console.log(`  Profil: ${profileName}    Stufen: ${selected.join(', ')}\n`);

const results = [];
for (const id of selected) {
  const stage = STAGES[id];
  const started = Date.now();
  let result;
  try {
    result = await stage();
  } catch (e) {
    result = { green: false, detail: `Ausnahme: ${e.message}` };
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ id, seconds, ...result });
  console.log(`  ${result.green ? '✅' : '❌'} ${id} ${result.green ? 'grün' : 'rot '}  ${seconds}s  ${result.detail}`);
}

const failed = results.filter((result) => !result.green);
const required = failed.filter((result) => !OPTIONAL.has(result.id));
console.log('\n═══════════════════════════════════════');
console.log(`  Stufen: ${results.length - failed.length} grün, ${failed.length} rot (${required.length} davon in G1..G5)`);
console.log('═══════════════════════════════════════');
process.exit(required.length > 0 || (strict && failed.length > 0) ? 1 : 0);
