/**
 * @shinon/prompter — prompt-files.js
 *
 * Die Dateien, die dieses Paket von der Platte LIEST: Kontextdatei, Zettel samt
 * Regeln, Skills samt Regeln. Die Auswahl- und Prueflogik selbst liegt in
 * `note-core.js`; hier steht die Anbindung — relative Pfade werden am PAKET
 * aufgeloest, nicht am Asset (sonst zeigte `./assets/...` auf `assets/assets/...`).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { parseNote, tokens } from './note-core.js';
import {
  CONTEXT_CONTRACT,
  NOTE_RULES_CONTRACT,
  NOTE_RULES_PATH,
  SKILL_RULES_CONTRACT,
  SKILL_RULES_PATH,
} from './mode-core.js';
import { ContextSchema } from './schema.js';

/**
 * Das PAKETVERZEICHNIS als Basis fuer relative Pfade.
 *
 * `assets/` liegt direkt unter dem Paket, also ist `..` die Paketwurzel. Vor dem
 * Modulschnitt loeste `import.meta.url` auf `packages/prompter/index.js` auf; nach
 * dem Verschieben waere dieselbe Zeile in `assets/` gelandet und haette
 * `./assets/note-rules.json` als `assets/assets/note-rules.json` gesucht
 * (gemessen: alle Zettel- und Stand-Tests rot).
 */
const PACKAGE_URL = new URL('..', import.meta.url);

/**
 * Den MAX-Kontext laden und gegen den Vertrag validieren. Wirft bei einem
 * unlesbaren oder unvollständigen Kontext — der Aufrufer behandelt das als
 * Grund, MAX zu sperren, statt halb gefüllt weiterzumachen.
 */
export function loadContext(path) {
  return loadJsonContract(path, CONTEXT_CONTRACT, (parsed) => ContextSchema(parsed));
}

/**
 * Die Regeln des Veredlers laden und gegen ihren Vertragsnamen pruefen.
 *
 * Wirft bei einem unlesbaren oder fremden Datensatz — der Aufrufer sperrt dann
 * das Lesen der Zettel, statt mit erfundenen Grenzen weiterzumachen. Eine
 * fehlende Grenze waere hier besonders teuer: sie entscheidet, WAS geladen wird.
 */
export function loadNoteRules(path = NOTE_RULES_PATH) {
  return loadJsonContract(path, NOTE_RULES_CONTRACT, (parsed) => parsed);
}

/**
 * Das Verzeichnis der Zettel aufloesen — relativ zum ARBEITSVERZEICHNIS.
 * Ein absoluter Pfad bleibt absolut (eine ausdrueckliche Angabe wird geehrt).
 */
export function notesDir(config) {
  return isAbsolute(config.notesPath) ? config.notesPath : join(process.cwd(), config.notesPath);
}

/**
 * Die Zettel eines Laufs lesen — Datei fuer Datei, in Namensreihenfolge.
 *
 * Kein Cache, und das ist Absicht: die Zettel SCHREIBT das arbeitende Modell
 * WAEHREND des Laufs. Ein Zwischenspeicher muesste an einer Uhr oder an einer
 * Aenderungszeit haengen, um eine geaenderte Datei zu bemerken — beides gibt es
 * hier nicht. Ein paar kleine Dateien je Schritt kosten weniger als ein
 * veralteter Stand.
 * → Kanon: docs/COMMENT-KANON.md#k-27780b8e524c
 */
export function readNotes(config, rules) {
  const format = rules?.format ?? {};
  if (typeof config?.notesPath !== 'string' || config.notesPath === '') return { notes: [], skipped: [], reason: 'NOTES_OFF' };
  const dir = notesDir(config);
  const extension = typeof format.extension === 'string' ? format.extension : '.json';
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    return { notes: [], skipped: [], reason: `NOTES_UNREADABLE:${error?.code ?? 'ERROR'}` };
  }

  const notes = [];
  const skipped = [];
  for (const name of names.filter((entry) => entry.endsWith(extension)).sort()) {
    let text;
    try {
      text = readFileSync(join(dir, name), 'utf8');
    } catch (error) {
      skipped.push({ file: name, reason: `NICHT_LESBAR:${error?.code ?? 'ERROR'}` });
      continue;
    }
    const parsed = parseNote(text, format);
    if (!parsed.ok) {
      skipped.push({ file: name, reason: parsed.reason });
      continue;
    }
    notes.push({ file: name, note: parsed.note });
  }
  return { notes, skipped, reason: null };
}

/**
 * Die Regeln der Skill-Selektion (Zug 6) laden und gegen ihren Vertragsnamen
 * pruefen — dieselbe Bauform wie die Zettel-Regeln. Ein fehlendes Verzeichnis
 * ist kein Defekt: Skills gehoeren dem PROJEKT, nicht dem Tarball, und ein
 * Projekt ohne .agents/skills lauft einfach ohne Skill-Block (fail-open).
 */
export function loadSkillRules(path = SKILL_RULES_PATH) {
  return loadJsonContract(path, SKILL_RULES_CONTRACT, (parsed) => parsed);
}

/** Das Skill-Verzeichnis auflösen — relativ zum ARBEITSVERZEICHNIS. */
export function skillsDir(config) {
  return isAbsolute(config.skillsPath) ? config.skillsPath : join(process.cwd(), config.skillsPath);
}

/**
 * Beschreibung aus einer SKILL.md lesen, ohne einen YAML-Parser einzuschleppen.
 *
 * Unterstützt die Frontmatter-Formen, die Skills hier verwenden: einzeilig,
 * einfache/doppelte Quotes und gefaltete/literale YAML-Skalare. Der Body bleibt
 * unangetastet; Skills liefern in diesem Vertrag Metadaten, nicht ihren ganzen
 * Anweisungsinhalt.
 */
export function readSkillDescription(text) {
  const source = String(text ?? '');
  const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (frontmatter) {
    const lines = frontmatter[1].split(/\r?\n/);
    const index = lines.findIndex((line) => /^description\s*:/i.test(line));
    if (index === -1) return '';

    let value = lines[index].replace(/^description\s*:/i, '').trim();
    if (value === '' || /^[>|][+-]?$/.test(value)) {
      const folded = value.startsWith('>');
      const parts = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor];
        if (line.trim() === '') {
          if (parts.length > 0) parts.push('');
          continue;
        }
        if (!/^[ \t]+/.test(line)) break;
        parts.push(line.trim());
      }
      value = parts.join(folded ? ' ' : '\n').trim();
    } else if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    } else {
      value = value.replace(/[ \t]+#.*$/, '').trim();
    }
    return typeof value === 'string' ? value.trim() : '';
  }

  // Legacy Skills mit freiem Text dürfen weiterhin die erste sinnvolle Zeile
  // als Beschreibung verwenden. YAML-Trenner und Markdown-Überschriften zählen
  // ausdrücklich nicht als Beschreibung.
  return source.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && line !== '---' && !line.startsWith('#')) ?? '';
}

/**
 * Ein Skill lesen: Name + Beschreibung + Use-When aus seinem Ordner.
 *
 * Ein Skill liegt in `.agents/skills/<name>/` mit einer `SKILL.md` (Frontmatter
 * oder freier Text). Das Feld, das die Auswahl steuert, ist die BESCHREIBUNG
 * (name + description + use-when) — nicht der Inhalt. Wie bei den Zetteln gilt:
 * nur was geladen wird, geht in den Block; was nicht passt, bleibt außen vor.
 *
 * → Kanon: docs/COMMENT-KANON.md#k-df74878c5180
 */
export function readSkills(config, rules) {
  const reading = rules?.reading ?? {};
  if (typeof config?.skillsPath !== 'string' || config.skillsPath === '') return { skills: [], skipped: [], reason: 'SKILLS_OFF' };
  const dir = skillsDir(config);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return { skills: [], skipped: [], reason: `SKILLS_UNREADABLE:${error?.code ?? 'ERROR'}` };
  }

  const skills = [];
  const skipped = [];
  for (const entry of entries.filter((dirEntry) => dirEntry.isDirectory()).map((dirEntry) => dirEntry.name).sort()) {
    const file = join(dir, entry, 'SKILL.md');
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      skipped.push({ file: entry, reason: `NICHT_LESBAR:${error?.code ?? 'ERROR'}` });
      continue;
    }
    // SKILL.md nutzt normalerweise YAML-Frontmatter. Freier Text bleibt als
    // kompatibler Fallback erlaubt; ein kaputter/fehlender Beschreibungseintrag
    // wird benannt übersprungen, statt "---" oder "name:" als Treffer zu verwenden.
    const description = readSkillDescription(text);
    if (description === '') {
      skipped.push({ file: entry, reason: 'BESCHREIBUNG_FEHLT' });
      continue;
    }
    skills.push({ name: entry, description, path: file });
  }
  if (skills.length === 0) return { skills: [], skipped, reason: 'SKILLS_EMPTY' };

  // Nicht hier begrenzen: maxSkills gilt NACH dem Relevanzranking in selectSkills.
  // Alphabetisch abgeschnittene Kandidaten koennen sonst niemals gewinnen.
  const minHits = Number.isFinite(reading.minHits) ? reading.minHits : 1;
  return { skills, skipped, reason: null, minHits };
}

/**
 * Die passenden Skills wählen — über die Beschreibung, nicht über eine Uhr.
 *
 * Dieselbe Rechnung wie `selectNotes`: Begriffe der Beschreibung müssen im
 * Haystack (Prompt + Kontext) vorkommen. Mehr Treffer zuerst, bei Gleichstand
 * alphabetisch. Ein Skill, dessen Beschreibung niemand auflösen kann, lädt
 * nicht (fail-closed, eigener Grund).
 * @param skills - `{ name, description, path }`, so wie der Host sie liest.
 * @returns { loaded, skipped } — geladene Skills und die übrigen mit Grund.
 */
export function selectSkills(skills = [], haystack = [], reading = {}) {
  const minLength = typeof reading.minTokenLength === 'number' ? reading.minTokenLength : 4;
  const minHits = typeof reading.minHits === 'number' ? reading.minHits : 1;
  const stopWords = new Set((Array.isArray(reading.stopWords) ? reading.stopWords : [])
    .map((word) => String(word).toLocaleLowerCase()));
  const meaningfulTokens = (value) => tokens(value, minLength)
    .filter((token) => !stopWords.has(token));
  const words = new Set(meaningfulTokens(haystack.join(' ')));
  const normalizePhrase = (value) => tokens(value, 1).join(' ');
  const explicitText = ` ${normalizePhrase(reading.explicitText ?? '')} `;

  const scored = [];
  const skipped = [];
  for (const skill of skills) {
    if (skill === null || typeof skill !== 'object') {
      skipped.push({ file: skill, reason: 'KEIN_SKILL' });
      continue;
    }
    const marks = meaningfulTokens(`${skill.name} ${skill.description}`);
    if (marks.length === 0) {
      skipped.push({ file: skill.name, reason: 'SKILL_OHNE_BESCHREIBUNG' });
      continue;
    }
    const namePhrase = normalizePhrase(skill.name);
    const explicitlyNamed = namePhrase !== '' && explicitText.includes(` ${namePhrase} `);
    const hits = marks.filter((mark) => words.has(mark)).length;
    if (!explicitlyNamed && hits < minHits) {
      skipped.push({ file: skill.name, reason: 'SKILL_NICHT_IM_KONTEXT' });
      continue;
    }
    scored.push({ ...skill, hits, explicitlyNamed });
  }

  // Ein im eigentlichen Nutzerprompt benannter Skill gewinnt vor reinem
  // Wort-Overlap. Die Namen aus Projektkontext/Dateipfaden gelten nicht als
  // explizite Nutzeranweisung.
  scored.sort((left, right) => Number(right.explicitlyNamed) - Number(left.explicitlyNamed)
    || right.hits - left.hits
    || left.name.localeCompare(right.name));
  const maxSkills = typeof reading.maxSkills === 'number' ? reading.maxSkills : Infinity;
  for (const entry of scored.slice(maxSkills)) {
    skipped.push({ file: entry.name, reason: 'UEBER_DEM_LIMIT' });
  }
  return { loaded: scored.slice(0, maxSkills), skipped };
}


/**
 * Eine JSON-Datei ueber ihren Vertragsnamen laden und pruefen — EIN Weg fuer
 * beide Dateien dieses Pakets. Wirft mit Grund; die Aufrufer behandeln das.
 */
export function loadJsonContract(path, contract, validate) {
  // Lesen UND parsen liegen im try: eine fehlende oder gesperrte Datei ist ein
  // eigener Grund (ENOENT/EACCES) und nicht "kein gueltiges JSON" — vorher nannte
  // die Meldung fuer beide Faelle die falsche Ursache.
  let raw;
  try {
    raw = readFileSync(new URL(path, PACKAGE_URL), 'utf8');
  } catch (error) {
    throw new Error(`${contract}: Datei nicht lesbar (${error?.code ?? error?.message})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${contract}: kein gueltiges JSON (${error?.message})`);
  }
  if (contract !== CONTEXT_CONTRACT && parsed?.contract !== contract) {
    throw new Error(`${contract}: fremder Vertrag ${JSON.stringify(parsed?.contract)}`);
  }
  return validate(parsed);
}

