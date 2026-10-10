/**
 * plugin-idioms.mjs — die EINE Quelle für die beiden Plugin-Bausteine, die in
 * mehreren Hälften wortgleich vorkommen: die Registrierung beim Settings-Dienst
 * (sechs `index.js`) und der Locale-Fallback (fünf `client.js`).
 *
 * WARUM GENERIERT UND NICHT PER IMPORT GETEILT — gemessen, nicht angenommen:
 *   - Jedes Paket wird einzeln verpackt. `scripts/pack-test.mjs` packt genau
 *     `package.json`, `index.js`, `client.js`, `cordis.patch.yml` plus die
 *     referenzierten Ressourcen in ein Tarball und lädt es im Isolat. Eine
 *     `import`-Zeile auf `scripts/lib/…` läge außerhalb dieses Tarballs; das
 *     Paket ließe sich dort nicht mehr laden.
 *   - Eine Client-Hälfte ist ein self-contained Bundle
 *     (`window.__ModuleLoader__.load`, React kommt per `require`). Sie kann kein
 *     Repo-Modul erreichen.
 *   Beides zusammen heißt: Teilen ist in der Laufzeit nicht möglich. Also steht
 *   der Baustein einmal hier, die Pakete tragen generierte Blöcke, und ein
 *   Drift-Test hält beide Seiten gleich — keine handgepflegte Kopie.
 *
 * Marken im Ziel: `// >>> shinon:dsh-idiom <id> …` bis `// <<< shinon:dsh-idiom <id>`.
 * Zwischen den Marken steht Zeile für Zeile genau das, was `render(region)`
 * liefert (Einrückung eingeschlossen). Fehlt eine Marke, wird nichts geraten:
 * der Schreiber bricht ab, die Prüfung meldet es.
 *
 * Werkzeuge:
 *   `npm run idioms`        schreibt alle Blöcke neu (scripts/sync-idioms.mjs)
 *   `npm run idioms:check`  prüft nur und bricht mit Exit 1 bei Drift ab
 *   Gate                    host-half und client-half prüfen ihre Hälfte mit
 *                           `idiomIssues(root, half)`; ebenso `dsh-test` und `build`
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';

/** Marken-Tag; an ihm erkennt Prüfung und Schreiber die generierten Blöcke. */
export const MARKER_TAG = 'shinon:dsh-idiom';

/** Wo die eine Quelle liegt (steht im Text der Marke, damit sie auffindbar ist). */
export const SOURCE_FILE = 'scripts/lib/plugin-idioms.mjs';

/** Hälften; jede Hälfte hat ihre eigenen Bausteine und ihre eigene Signatur. */
export const HALVES = ['index.js', 'client.js'];

/**
 * Die Bausteine. `lines(params)` liefert den Block OHNE Einrückung und ohne
 * Marken; die Einrückung kommt aus der Region (eine Datei kann einen Block auf
 * anderer Tiefe tragen).
 */
const TEMPLATES = {
  'settings-registration': {
    why: 'Diese Hälfte meldet ihre Einstellungs-Form beim Settings-Dienst an (auto: false — DSH rendert kein Formular, die Werte kommen aus dem Profil).',
    lines: () => [
      '// Registriert die Einstellungs-Form dieses Pakets beim Settings-Dienst.',
      "ctx.inject(['settings'], (child) => {",
      '  child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));',
      '});',
    ],
  },
  'locale-fallback/menu': {
    why: 'Menü-Label: aus der Registry (@shinon/locale-de), sonst der deutsche Wert; gelesen wird `ctx.get?.(…)`, weil ein direkter Dienst-Zugriff am Cordis-Proxy wirft.',
    lines: (p) => [
      '// Menü-Label aus der Registry (Besitzer: @shinon/locale-de); ohne',
      `// Locale-Dienst gilt die deutsche Tabelle.${p.noteSuffix ?? ''}`,
      ...(p.noteLines ?? []).map((line) => `// ${line}`),
      `const ${p.table} = { '${p.key}': '${p.label}' };`,
      "// Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter",
      '// Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft',
      '// (\'cannot get property "locale" without inject\') — das kostete dieser',
      '// Hälfte die Aktivierung. `ctx.get` ist die dokumentierte optionale',
      '// Abfrage (undefined, wenn der Dienst fehlt), und die `?.` tragen einen',
      '// Context ganz ohne `get` (die Attrappen in durchstich/uebergabe); dann',
      `// gilt ${p.table}.`,
      'const t = (key) => {',
      "  const locale = ctx.get?.('locale');",
      "  const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;",
      `  return hit === undefined || hit === key ? (${p.table}[key] ?? key) : hit;`,
      '};',
    ],
  },
  'locale-fallback/static': {
    why: 'Ersatzwert, bevor `apply()` den dynamischen Helfer bindet: die Komponente ist auf Modulebene definiert und liest bei jedem Rendern.',
    lines: (p) => [
      `const ${p.table} = { '${p.key}': '${p.label}' };`,
      `let t = (key) => ${p.table}[key] ?? key;`,
    ],
  },
  'locale-fallback/bind': {
    why: 'Derselbe Locale-Blick wie in `locale-fallback/menu`, aber als Neubindung von `t` innerhalb von `apply()` — in dieser Hälfte liest die Komponente eine Modulvariable.',
    lines: (p) => [
      "// Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter",
      '// Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft',
      '// (\'cannot get property "locale" without inject\') — das kostete dieser',
      '// Hälfte die Aktivierung. Der Blick passiert bei jedem Rendern, damit die',
      '// Anzeige auch einem später geladenen Dienst folgt; fehlt er (oder fehlt',
      '// `get`, wie an den repo-eigenen Attrappen), gilt ' + p.table + '.',
      't = (key) => {',
      "  const locale = ctx.get?.('locale');",
      "  const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;",
      `  return hit === undefined || hit === key ? (${p.table}[key] ?? key) : hit;`,
      '};',
    ],
  },
};

/**
 * Die Regionen dieses Baums: Datei → Idiom → Einrückung → Parameter.
 *
 * Eine Region gehört genau einer Datei und trägt genau eine Marke. `params` ist
 * die vollständige Eingabe des Bausteins — auch die Werte, die früher als
 * zweite Wahrheit neben der Registry standen (Fallback-Label, Tabellenname).
 */
const REGIONS = [
  { half: 'index.js', file: 'packages/better-errors/index.js', id: 'settings-registration', indent: 2 },
  { half: 'index.js', file: 'packages/core/index.js', id: 'settings-registration', indent: 2 },
  { half: 'index.js', file: 'packages/dashboard/index.js', id: 'settings-registration', indent: 2 },
  { half: 'index.js', file: 'packages/openapi/index.js', id: 'settings-registration', indent: 2 },
  { half: 'index.js', file: 'packages/token-usage/index.js', id: 'settings-registration', indent: 2 },
  { half: 'index.js', file: 'packages/tooltip/index.js', id: 'settings-registration', indent: 2 },
  {
    half: 'client.js',
    file: 'packages/codingmon/client.js',
    id: 'locale-fallback/menu',
    indent: 8,
    params: { table: 'MENU_DE', key: 'menu.codingmon', label: 'Codingmon' },
  },
  {
    half: 'client.js',
    file: 'packages/dashboard/client.js',
    id: 'locale-fallback/menu',
    indent: 8,
    params: { table: 'MENU_DE', key: 'menu.dashboard', label: 'Shinon Dashboard' },
  },
  {
    half: 'client.js',
    file: 'packages/markers/client.js',
    id: 'locale-fallback/menu',
    indent: 8,
    params: { table: 'MENU_DE', key: 'menu.markers', label: 'Shinon Marker' },
  },
  {
    half: 'client.js',
    file: 'packages/popup/client.js',
    id: 'locale-fallback/menu',
    indent: 8,
    // Dateispezifische Ergänzung: hier ist `LABEL` zusätzlich die Kennung für announce().
    params: {
      table: 'MENU_DE',
      key: 'menu.popup',
      label: 'Shinon Popup',
      noteSuffix: ' LABEL bleibt die interne',
      noteLines: ['Kennung für announce().'],
    },
  },
  {
    half: 'client.js',
    file: 'packages/token-usage/client.js',
    id: 'locale-fallback/static',
    indent: 4,
    params: { table: 'TOKEN_DE', key: 'token.fallback', label: 'Token: --' },
  },
  {
    half: 'client.js',
    file: 'packages/token-usage/client.js',
    id: 'locale-fallback/bind',
    indent: 8,
    params: { table: 'TOKEN_DE' },
  },
];

/**
 * Die Signatur jedes Bausteins: Ein Fund dieser Zeichenfolge AUSSERHALB eines
 * generierten Blocks ist eine neue, handgepflegte Kopie — und damit ein Befund,
 * auch wenn der Block selbst nirgends abweicht.
 */
const SIGNATURES = {
  'index.js': ['settings.configure('],
  'client.js': ["locale.bind('shinon')", "ctx.get?.('locale')"],
};

export const regionCount = () => REGIONS.length;
export const regionFiles = () => [...new Set(REGIONS.map((region) => region.file))];

/** Regionen einer Hälfte (bzw. einer Datei daraus). */
export function regionsOf(half, file = null) {
  return REGIONS.filter((region) => region.half === half && (file === null || region.file === file));
}

/**
 * Der erwartete Inhalt einer Region — Marken inklusive, Einrückung inklusive.
 * @returns {string[]} Zeilen ohne Zeilenende.
 */
export function render(region) {
  const template = TEMPLATES[region.id];
  if (!template) throw new Error(`unbekanntes Idiom: ${region.id}`);
  const body = template.lines(region.params ?? {});
  const pad = ' '.repeat(region.indent);
  const open = `${pad}// >>> ${MARKER_TAG} ${region.id} — EINE Quelle: ${SOURCE_FILE} (generiert; schreiben: \`npm run idioms\`, prüfen: Gate + dsh-test)`;
  const close = `${pad}// <<< ${MARKER_TAG} ${region.id}`;
  return [open, ...body.map((line) => pad + line), close];
}

/** Erste Abweichung zweier Zeilenlisten, in Worten. */
function diffLines(want, found) {
  const length = Math.max(want.length, found.length);
  for (let i = 0; i < length; i += 1) {
    if (want[i] !== found[i]) {
      return `Zeile ${i + 1}: erwartet ${JSON.stringify(want[i] ?? '<keine Zeile>')}, gefunden ${JSON.stringify(found[i] ?? '<keine Zeile>')}`;
    }
  }
  return null;
}

const OPEN_MARKER = /^(\s*)\/\/ >>> shinon:dsh-idiom (\S+)\b/;
const CLOSE_MARKER = /^(\s*)\/\/ <<< shinon:dsh-idiom (\S+)\s*$/;

/**
 * Markierte Blöcke einer Datei einlesen.
 * @returns {{spans: Array<{id: string, from: number, to: number, lines: string[]}>, issues: string[]}}
 *   `from`/`to` sind Zeilenindizes (0-basiert) der Marken, `lines` ist der Inhalt dazwischen.
 */
export function parseRegions(lines) {
  const spans = [];
  const issues = [];
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const openHit = lines[i].match(OPEN_MARKER);
    if (openHit) {
      if (open !== null) issues.push(`Block "${open.id}" (Zeile ${open.from + 1}) hat keine Schlussmarke`);
      open = { id: openHit[2], from: i };
      continue;
    }
    const closeHit = lines[i].match(CLOSE_MARKER);
    if (!closeHit) continue;
    if (open === null) {
      issues.push(`Schlussmarke "${closeHit[2]}" in Zeile ${i + 1} ohne Startmarke`);
      continue;
    }
    if (open.id !== closeHit[2]) {
      issues.push(`Startmarke "${open.id}" (Zeile ${open.from + 1}) und Schlussmarke "${closeHit[2]}" (Zeile ${i + 1}) passen nicht zusammen`);
      open = null;
      continue;
    }
    spans.push({ id: open.id, from: open.from, to: i, lines: lines.slice(open.from + 1, i) });
    open = null;
  }
  if (open !== null) issues.push(`Block "${open.id}" (Zeile ${open.from + 1}) hat keine Schlussmarke`);
  return { spans, issues };
}

/** Paketverzeichnisse unter `packages/` (kein Import von repo.mjs — das ist die eine Quelle der Verträge, hier wird nur gelesen). */
function packageDirs(root) {
  const dir = join(root, 'packages');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name));
}

/**
 * Drift-Prüfung für eine Hälfte.
 * @param {string} rootPath Repo-Wurzel ALS PFAD (repo.ROOT). `ctx.root` ist das
 *   Root-Manifest, nicht das Verzeichnis — deshalb wird hier ein Pfad verlangt.
 * @param {'index.js'|'client.js'} half
 * @returns {string[]} Befunde (leer = ein Quelltext-Stand, keine Kopie)
 */
export function idiomIssues(rootPath, half) {
  const issues = [];
  const regions = regionsOf(half);
  for (const file of [...new Set(regions.map((region) => region.file))]) {
    const path = join(rootPath, file);
    if (!existsSync(path)) {
      issues.push(`${file}: Datei fehlt`);
      continue;
    }
    const lines = readFileSync(path, 'utf8').split('\n');
    const { spans, issues: parseFindings } = parseRegions(lines);
    for (const finding of parseFindings) issues.push(`${file}: ${finding}`);

    const declared = regions.filter((region) => region.file === file);
    const declaredIds = declared.map((region) => region.id);

    const unexpected = spans.filter((span) => !declaredIds.includes(span.id));
    for (const span of unexpected) issues.push(`${file}: Block "${span.id}" (Zeile ${span.from + 1}) ist hier nicht deklariert`);

    const order = spans.filter((span) => declaredIds.includes(span.id)).map((span) => span.id);
    if (order.join(' → ') !== declaredIds.filter((id) => order.includes(id)).join(' → ')) {
      issues.push(`${file}: Reihenfolge der Blöcke weicht ab (gefunden ${order.join(', ')}; erwartet ${declaredIds.join(', ')})`);
    }

    for (const region of declared) {
      const span = spans.find((entry) => entry.id === region.id);
      if (!span) {
        issues.push(`${file}: Block "${region.id}" fehlt — Marker \`// >>> ${MARKER_TAG} ${region.id} …\` setzen und \`npm run idioms\` laufen lassen`);
        continue;
      }
      // Verglichen wird der GANZE Block: Marken (sie nennen die Quelle) und Inhalt.
      const found = [lines[span.from], ...span.lines, lines[span.to]];
      const drift = diffLines(render(region), found);
      if (drift) issues.push(`${file}: Block "${region.id}" (ab Zeile ${span.from + 1}) weicht von ${SOURCE_FILE} ab — ${drift}`);
    }
  }

  // Signatur-Scan: jede Fundstelle muss IN einem deklarierten Block liegen.
  for (const base of packageDirs(rootPath)) {
    const path = join(base, half);
    if (!existsSync(path)) continue;
    const file = relative(rootPath, path).split(sep).join('/');
    const lines = readFileSync(path, 'utf8').split('\n');
    const { spans } = parseRegions(lines);
    const declaredIds = regions.filter((region) => region.file === file).map((region) => region.id);
    for (const needle of SIGNATURES[half]) {
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes(needle)) continue;
        // Ein Vorkommen in einer Kommentarzeile ist kein Aufruf: die Blöcke selbst
        // ERKLÄREN die Signatur (`Gelesen wird ctx.get?.(…)`), das ist Prosa.
        if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;
        const span = spans.find((entry) => i >= entry.from && i <= entry.to);
        if (span === undefined) {
          issues.push(`${file}:${i + 1}: "${needle}" steht außerhalb eines generierten Blocks — Kopie ohne Quelle (${SOURCE_FILE})`);
        } else if (!declaredIds.includes(span.id)) {
          issues.push(`${file}:${i + 1}: "${needle}" steht in Block "${span.id}", den ${SOURCE_FILE} für diese Datei nicht deklariert`);
        }
      }
    }
  }
  return issues;
}

/**
 * Alle deklarierten Blöcke neu schreiben.
 * Fehlende Marker werden NICHT geraten: die Datei bleibt unangetastet und die
 * Region landet in `failed` — fail-closed.
 * @returns {{changed: string[], failed: string[]}}
 */
export function applyIdioms(rootPath) {
  const changed = [];
  const failed = [];
  for (const file of regionFiles()) {
    const path = join(rootPath, file);
    if (!existsSync(path)) {
      failed.push(`${file}: Datei fehlt`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const lines = text.split('\n');
    const { spans, issues: parseFindings } = parseRegions(lines);
    if (parseFindings.length) {
      failed.push(...parseFindings.map((finding) => `${file}: ${finding}`));
      continue;
    }
    const declared = REGIONS.filter((region) => region.file === file);
    const missing = declared.filter((region) => !spans.some((span) => span.id === region.id));
    if (missing.length) {
      failed.push(`${file}: Marker fehlt für ${missing.map((region) => `"${region.id}"`).join(', ')}`);
      continue;
    }
    const next = [];
    for (let i = 0; i < lines.length; i += 1) {
      const span = spans.find((entry) => entry.from === i);
      if (!span) {
        next.push(lines[i]);
        continue;
      }
      const region = declared.find((entry) => entry.id === span.id);
      next.push(...render(region));
      i = span.to;
    }
    const written = next.join('\n');
    if (written !== text) {
      writeFileSync(path, written);
      changed.push(file);
    }
  }
  return { changed, failed };
}
