/**
 * plugin-idioms.mjs — die EINE Quelle für die beiden Plugin-Bausteine, die in
 * mehreren Plugin-Hälften wortgleich vorkommen: die Registrierung beim
 * Settings-Dienst (Host-Hälften) und der Locale-Fallback (Client-Hälften).
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
 * WO DIE PARAMETER STEHEN — und warum sie nicht mehr zentral liegen:
 * Ein Baustein mit paketspezifischen Werten (Tabellenname, Schlüssel, Label)
 * trägt sie in seiner **Startmarke** (` params={…}` am Zeilenende). Vorher stand
 * diese Zuordnung in einer zentralen `REGIONS`-Liste in DIESER Datei; mit vielen
 * Plugins musste jedes neue Paket dort eingetragen werden, und ein neues Paket
 * war bis dahin rot (gemessen: 20 neue Pakete → 60 Befunde in `host-half`,
 * `client-half`, `dsh-test` und `gate:test`). Jetzt findet die Prüfung die
 * Regionen im Baum selbst: **jede Datei erklärt ihre eigene Region**, die
 * Garantie bleibt dieselbe — der Block muss zeichengenau `render(region)` sein.
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
 * anderer Tiefe tragen). `required` sind die Parameter, die die Startmarke
 * nennen MUSS — leer heißt: der Baustein braucht keine.
 */
const TEMPLATES = {
  'settings-registration': {
    required: [],
    why: 'Diese Hälfte meldet ihre Einstellungs-Form beim Settings-Dienst an (auto: false — DSH rendert kein Formular, die Werte kommen aus dem Profil).',
    lines: () => [
      '// Registriert die Einstellungs-Form dieses Pakets beim Settings-Dienst.',
      "ctx.inject(['settings'], (child) => {",
      '  child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));',
      '});',
    ],
  },
  'locale-fallback/menu': {
    required: ['table', 'key', 'label'],
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
    required: ['table', 'key', 'label'],
    why: 'Ersatzwert, bevor `apply()` den dynamischen Helfer bindet: die Komponente ist auf Modulebene definiert und liest bei jedem Rendern.',
    lines: (p) => [
      `const ${p.table} = { '${p.key}': '${p.label}' };`,
      `let t = (key) => ${p.table}[key] ?? key;`,
    ],
  },
  'locale-fallback/bind': {
    required: ['table'],
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

/** Bekannte Baustein-IDs (für Meldungen und Fail-closed). */
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/**
 * Die Signatur jedes Bausteins: ein Fund dieser Zeichenfolge AUSSERHALB eines
 * generierten Blocks ist eine neue, handgepflegte Kopie — und damit ein Befund,
 * auch wenn der Block selbst nirgends abweicht.
 */
const SIGNATURES = {
  'index.js': ['settings.configure('],
  'client.js': ["locale.bind('shinon')", "ctx.get?.('locale')"],
};

const OPEN_MARKER = /^(\s*)\/\/ >>> shinon:dsh-idiom (\S+)\b/;
const CLOSE_MARKER = /^(\s*)\/\/ <<< shinon:dsh-idiom (\S+)\s*$/;
/** Die Parameter am Ende der Startmarke (JSON, nur wo der Baustein welche braucht). */
const MARKER_PARAMS = / params=(\{.*\})\s*$/;

/**
 * Die Parameter einer Startmarke lesen.
 * @returns {{params: object|null, issue: string|null}}
 */
function readMarkerParams(markerLine) {
  const hit = markerLine.match(MARKER_PARAMS);
  if (!hit) return { params: null, issue: null };
  try {
    const parsed = JSON.parse(hit[1]);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { params: null, issue: `params muss ein JSON-Objekt sein (${hit[1]})` };
    }
    return { params: parsed, issue: null };
  } catch (error) {
    return { params: null, issue: `params ist kein gültiges JSON (${error.message})` };
  }
}

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
function packageDirs(rootPath) {
  const dir = join(rootPath, 'packages');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name))
    .sort();
}

/** Die Hälften-Dateien aller Pakete, als relative POSIX-Pfade sortiert. */
function halfFiles(rootPath, half) {
  return packageDirs(rootPath)
    .map((base) => join(base, half))
    .filter((path) => existsSync(path))
    .map((path) => relative(rootPath, path).split(sep).join('/'));
}

/** Eine gefundene Region aus Datei + Marke bauen (Parameter kommen aus der Marke). */
function regionFrom(half, file, span, lines) {
  const marker = lines[span.from];
  const indent = marker.match(/^(\s*)/)[1].length;
  const { params } = readMarkerParams(marker);
  return { half, file, id: span.id, indent, params, line: span.from + 1 };
}

/**
 * Die Regionen einer Hälfte — im Baum GEFUNDEN, nicht in einer Liste geführt.
 * Jede Datei erklärt ihre Regionen über ihre Startmarken; die Parameter stehen
 * in der Marke selbst.
 * @param {string} rootPath Repo-Wurzel ALS PFAD (repo.ROOT). `ctx.root` ist das
 *   Root-Manifest, nicht das Verzeichnis — deshalb wird hier ein Pfad verlangt.
 * @param {'index.js'|'client.js'} half
 * @param {string|null} file optional nur diese Datei (relativer POSIX-Pfad)
 */
export function regionsOf(rootPath, half, file = null) {
  const found = [];
  for (const rel of halfFiles(rootPath, half)) {
    if (file !== null && rel !== file) continue;
    const lines = readFileSync(join(rootPath, rel), 'utf8').split('\n');
    for (const span of parseRegions(lines).spans) found.push(regionFrom(half, rel, span, lines));
  }
  return found;
}

export const regionCount = (rootPath) => HALVES.reduce((sum, half) => sum + regionsOf(rootPath, half).length, 0);
export const regionFiles = (rootPath) => [...new Set(HALVES.flatMap((half) => regionsOf(rootPath, half).map((region) => region.file)))].sort();

/**
 * Der erwartete Inhalt einer Region — Marken inklusive, Einrückung inklusive.
 * Die Startmarke nennt die Parameter, wo der Baustein welche braucht.
 * @returns {string[]} Zeilen ohne Zeilenende.
 */
export function render(region) {
  const template = TEMPLATES[region.id];
  if (!template) throw new Error(`unbekanntes Idiom: ${region.id}`);
  const body = template.lines(region.params ?? {});
  const pad = ' '.repeat(region.indent);
  const params = template.required.length === 0 || region.params === null || region.params === undefined
    ? ''
    : ` params=${JSON.stringify(region.params)}`;
  const open = `${pad}// >>> ${MARKER_TAG} ${region.id} — EINE Quelle: ${SOURCE_FILE} (generiert; schreiben: \`npm run idioms\`, prüfen: Gate + dsh-test)${params}`;
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

/**
 * Drift-Prüfung für eine Hälfte.
 *
 * Zwei Zusagen, beide aus dem Baum abgeleitet:
 *   - Jeder markierte Block ist zeichengenau `render(region)` mit den Parametern
 *     seiner eigenen Startmarke (die Quelle wird also nicht abgeschrieben).
 *   - Jede Signatur-Fundstelle liegt in einem SOLCHEN, gültigen Block — eine
 *     handgepflegte Kopie daneben fällt auf, auch wenn kein Block abweicht.
 *
 * @returns {string[]} Befunde (leer = ein Quelltext-Stand, keine Kopie)
 */
export function idiomIssues(rootPath, half) {
  const issues = [];
  for (const rel of halfFiles(rootPath, half)) {
    const path = join(rootPath, rel);
    const lines = readFileSync(path, 'utf8').split('\n');
    const { spans, issues: parseFindings } = parseRegions(lines);
    for (const finding of parseFindings) issues.push(`${rel}: ${finding}`);

    for (const span of spans) {
      const row = `${rel}:${span.from + 1}`;
      const template = TEMPLATES[span.id];
      if (!template) {
        issues.push(`${row}: unbekannter Baustein "${span.id}" — bekannt sind ${TEMPLATE_IDS.join(', ')}`);
        continue;
      }
      const { params, issue: paramIssue } = readMarkerParams(lines[span.from]);
      if (paramIssue) {
        issues.push(`${row}: ${paramIssue}`);
        continue;
      }
      const missing = template.required.filter((key) => typeof params?.[key] !== 'string');
      if (missing.length) {
        issues.push(
          `${row}: Baustein "${span.id}" braucht params={${template.required.join(', ')}} am Ende der Startmarke ` +
            `(fehlt: ${missing.join(', ')}; JSON, z. B. {"${template.required[0]}":"…"})`,
        );
        continue;
      }
      const region = regionFrom(half, rel, span, lines);
      const found = [lines[span.from], ...span.lines, lines[span.to]];
      const drift = diffLines(render(region), found);
      if (drift) {
        issues.push(`${rel}: Block "${span.id}" (ab Zeile ${span.from + 1}) weicht von ${SOURCE_FILE} ab — ${drift}`);
      }
    }

    for (const needle of SIGNATURES[half]) {
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes(needle)) continue;
        // Ein Vorkommen in einer Kommentarzeile ist kein Aufruf: die Blöcke selbst
        // ERKLÄREN die Signatur (`Gelesen wird ctx.get?.(…)`), das ist Prosa.
        if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;
        // Ein Fund INNERHALB eines markierten Blocks wird oben schon bewertet
        // (Drift, unbekannter Baustein, fehlende Parameter) — hier zählt nur, was
        // NEBEN den Marken steht: die handgepflegte Kopie.
        const inside = spans.some((span) => i >= span.from && i <= span.to);
        if (!inside) {
          issues.push(`${rel}:${i + 1}: "${needle}" steht außerhalb eines generierten Blocks — Kopie ohne Quelle (${SOURCE_FILE})`);
        }
      }
    }
  }
  return issues;
}

/**
 * Alle markierten Blöcke neu schreiben — die Regionen und ihre Parameter kommen
 * aus dem Baum, die Inhalte aus der einen Quelle hier.
 *
 * Geraten wird NICHT: ein unbekannter Baustein, eine unvollständige oder
 * unparsbare Parameterangabe und eine Marke ohne Partner lassen die Datei
 * unangetastet und landen in `failed` — fail-closed.
 * @returns {{changed: string[], failed: string[]}}
 */
export function applyIdioms(rootPath) {
  const changed = [];
  const failed = [];
  for (const half of HALVES) {
    for (const rel of halfFiles(rootPath, half)) {
      const path = join(rootPath, rel);
      const text = readFileSync(path, 'utf8');
      const lines = text.split('\n');
      const { spans, issues: parseFindings } = parseRegions(lines);
      if (parseFindings.length) {
        failed.push(...parseFindings.map((finding) => `${rel}: ${finding}`));
        continue;
      }
      const next = [];
      let broken = false;
      for (let i = 0; i < lines.length; i += 1) {
        const span = spans.find((entry) => entry.from === i);
        if (!span) {
          next.push(lines[i]);
          continue;
        }
        const template = TEMPLATES[span.id];
        const { params, issue: paramIssue } = readMarkerParams(lines[span.from]);
        if (!template) {
          failed.push(`${rel}:${span.from + 1}: unbekannter Baustein "${span.id}" — Datei bleibt unangetastet`);
          broken = true;
          break;
        }
        if (paramIssue) {
          failed.push(`${rel}:${span.from + 1}: ${paramIssue} — Datei bleibt unangetastet`);
          broken = true;
          break;
        }
        const missing = template.required.filter((key) => typeof params?.[key] !== 'string');
        if (missing.length) {
          failed.push(`${rel}:${span.from + 1}: Baustein "${span.id}" braucht params={${template.required.join(', ')}} (fehlt: ${missing.join(', ')}) — Datei bleibt unangetastet`);
          broken = true;
          break;
        }
        next.push(...render(regionFrom(half, rel, span, lines)));
        i = span.to;
      }
      if (broken) continue;
      const written = next.join('\n');
      if (written !== text) {
        writeFileSync(path, written);
        changed.push(rel);
      }
    }
  }
  return { changed, failed };
}
