/**
 * source-scan.mjs — Quelltext-Scan für die Gate-Plugins.
 *
 * Warum als eigene Datei: „dieser Code darf X nie aufrufen" ist ein Vertrag,
 * und ein Vertrag gehört an eine Stelle.
 *
 * Zwei Genauigkeiten, die den Unterschied machen:
 *   - Kommentare zählen nicht. Ein Modul darf erklären, was es NICHT tut,
 *     ohne dass das Gate rot wird (deshalb wird der Kommentar entfernt, nicht
 *     der Kommentar verboten).
 *   - Strings zählen nur dort, wo sie Code sein können. Die Persona trägt
 *     Prompt-Texte, in denen „Math.random()" als Warnung für das Modell steht —
 *     das ist Dateninhalt, kein Aufruf. `Math.random()` im Code daneben bleibt
 *     ein Befund.
 * Modul-Importe (`require('child_process')`) werden weiterhin erkannt: für
 * solche Token liest der Scan die Strings mit (`mode: 'module'`).
 *
 * EIN Durchlauf statt zwei Schritten, und zwar aus gemessenem Grund: die fruehere
 * Fassung entfernte erst Kommentare und dann Strings, jeder Schritt mit einem
 * eigenen Muster. Sobald ein Template-Literal Quelltext als TEXT enthaelt (der
 * Worker-Quelltext des Project Index) oder ein Kommentar eine ungerade Zahl von
 * Anfuehrungszeichen mitbringt, verschiebt sich die Paarung: der String-Entferner
 * verschluckt dann echten Code, und ein Gate kann blind werden, ohne rot zu sein.
 * Gemessen war das genau so: `new DatabaseSync(file)` verschwand aus dem
 * 'codeOnly'-Ergebnis, waehrend die Kontrolle in tests/project-index.test.mjs
 * weiterhin gruen war. Deshalb erkennt `tokenize` Kommentar, String und Template
 * in einem Zug — und `${…}` in einem Template bleibt CODE, weil dort Code steht.
 *
 * Bewusst naiv gehalten: kein Parser, kein node_modules. Was der Scanner zusagt,
 * ist unten als Tabelle geprueft (scripts/gate/tests/source-scan.test.mjs).
 */

/**
 * Den Quelltext in Abschnitte zerlegen: 'code', 'comment', 'string'.
 *
 * Zusagen, die der Zustandsautomat gibt:
 *   - Kommentar-Start (`//`, `/*`) zaehlt nur im Code, nicht im String.
 *   - Ein String endet am passenden Anfuehrungszeichen oder (einfache Quotes)
 *     am Zeilenende; ein Backslash schluckt das naechste Zeichen.
 *   - In einem Template-Block ist `${…}` CODE (verschachtelt, mit Zaehler).
 *   - Ein Regex-Literal wird als CODE gelesen, nicht als String: ein Muster kann
 *     Anfuehrungszeichen und Backticks enthalten (`/^\s*(```|~~~)/`), und ohne
 *     Regex-Zustand kippt der String-Zustand daran. Gemessen war genau das ein
 *     blinder Fleck: die Doc-Kommentare nach einem solchen Muster galten dann als
 *     String und der Code dahinter verschwand. Regex-Inhalt bleibt sichtbar —
 *     lieber ein sichtbarer Fehlalarm als eine stille Luecke.
 *   - Ein unfertiges Literal am Ende wird als solches gemeldet, nicht als Code.
 */

/** Nach diesen Zeichen kann ein `/` ein Regex-Literal beginnen (nicht Division). */
const REGEX_AFTER_CHAR = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '']);
/** Nach diesen Woertern kann ein `/` ein Regex-Literal beginnen. */
const REGEX_AFTER_WORD = /(?:^|[^A-Za-z0-9_$])(?:return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await|throw)$/;
export function tokenize(source) {
  const text = String(source);
  const segments = [];
  let buffer = '';
  let state = 'code';
  let quote = '';
  let depth = 0;
  let inClass = false;
  let lastCode = '';
  let tail = '';
  /** Den Puffer mit seinem Zustand abschliessen. */
  const push = (kind) => {
    if (buffer !== '') segments.push({ kind, text: buffer });
    buffer = '';
  };
  /**
   * VOR jedem Zustandswechsel muss der Puffer als Code abgeschlossen werden —
   * sonst wandert der Code vor einem Literal in den Literal-Abschnitt und
   * verschwindet beim Entfernen der Strings. Genau das war ein echter Fehler in
   * der ersten Fassung dieses Scanners (gemessen an diesem Paket).
   */
  const start = (next) => {
    push('code');
    buffer = next;
  };
  /** Kann an dieser Stelle ein Regex-Literal beginnen? */
  const regexAllowed = () => REGEX_AFTER_CHAR.has(lastCode) || REGEX_AFTER_WORD.test(tail);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (state === 'line-comment') {
      buffer += char;
      if (char === '\n') {
        state = 'code';
        push('comment');
      }
      continue;
    }
    if (state === 'block-comment') {
      buffer += char;
      if (char === '*' && next === '/') {
        buffer += next;
        i += 1;
        state = 'code';
        push('comment');
      }
      continue;
    }
    if (state === 'regex') {
      if (char === '\\') {
        buffer += char + (next ?? '');
        i += 1;
        continue;
      }
      if (char === '[') inClass = true;
      else if (char === ']') inClass = false;
      if ((char === '/' && !inClass) || char === '\n') {
        buffer += char;
        state = 'code';
        push('code');
        continue;
      }
      buffer += char;
      continue;
    }
    if (state === 'string') {
      if (char === '\\') {
        buffer += char + (next ?? '');
        i += 1;
        continue;
      }
      if (quote === '`' && char === '$' && next === '{') {
        // Der Template-Text bis hierher ist String; `${` und der Ausdruck darin
        // sind Code — dort kann ein verbotener Aufruf stehen.
        push('string');
        segments.push({ kind: 'code', text: '${' });
        i += 1;
        depth += 1;
        state = 'code';
        continue;
      }
      if (quote === '`' ? char === '`' : char === quote || char === '\n') {
        buffer += char;
        state = 'code';
        push('string');
        continue;
      }
      buffer += char;
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      start(char + next);
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      start(char + next);
      i += 1;
      continue;
    }
    if (char === '/' && regexAllowed()) {
      state = 'regex';
      inClass = false;
      start(char);
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      push('code');
      // Die schliessende Klammer der Interpolation ist Code, nicht String-Text.
      segments.push({ kind: 'code', text: '}' });
      quote = '`';
      state = 'string';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      state = 'string';
      start(char);
      continue;
    }
    buffer += char;
    if (!/\s/.test(char)) {
      lastCode = char;
      tail = `${tail}${char}`.slice(-24);
    }
  }
  const kind = state === 'line-comment' || state === 'block-comment' ? 'comment' : state === 'string' ? 'string' : 'code';
  push(kind);
  return segments;
}

/**
 * Block- und Zeilenkommentare entfernen, String-Inhalte bleiben.
 * URLs wie https://… im Code und `//` IN einem String ueberleben.
 */
export function stripComments(source) {
  return tokenize(source)
    .map((segment) => (segment.kind === 'comment' ? ' ' : segment.text))
    .join('');
}

/**
 * String-Literale leeren: Inhalt raus, Anfuehrungszeichen bleiben. Der CODE in
 * `${…}` bleibt stehen — dort kann ein verbotener Aufruf stehen.
 */
export function stripStrings(source) {
  return tokenize(source)
    .map((segment) => (segment.kind === 'string' ? segment.text.replace(/[^'"`]/g, '') : segment.text))
    .join('');
}

/** Laufzeitcode ohne Kommentare und ohne String-Inhalte. */
export function codeOnly(source) {
  return stripStrings(stripComments(source));
}

/**
 * Verbotene Token finden.
 * @param {string} source
 * @param {string[]} tokens
 * @param {{ mode?: 'code' | 'module' | 'raw' }} [options]
 *   code   — ohne Kommentare und ohne Strings (Standard: echte Aufrufe)
 *   module — ohne Kommentare, mit Strings (Import-/Modulnamen)
 *   raw    — ungefiltert (nur wenn ausdrücklich gewollt)
 */
export function findForbidden(source, tokens, options = {}) {
  const mode = options.mode ?? 'code';
  const haystack = mode === 'raw' ? String(source) : mode === 'module' ? stripComments(source) : codeOnly(source);
  return tokens.filter((token) => haystack.includes(token));
}

/**
 * Pflicht-Token finden.
 * @param {{ mode?: 'code' | 'module' | 'raw' }} [options]
 *   code   — ohne Kommentare und ohne Strings (Standard: der Token muss Code sein)
 *   module — ohne Kommentare, mit Strings; für Pflicht-Token, die selbst Strings
 *            sind (Slot-Namen, Speicherschlüssel, Vertrags-Vorlagen)
 *   raw    — ungefiltert
 * Dieselbe Genauigkeits-Regel wie findForbidden — nur die andere Richtung
 * (hier fehlen Token, dort sind welche verboten).
 */
export function findMissing(source, tokens, options = {}) {
  const mode = options.mode ?? 'code';
  const haystack = mode === 'raw' ? String(source) : mode === 'module' ? stripComments(source) : codeOnly(source);
  return tokens.filter((token) => !haystack.includes(token));
}
