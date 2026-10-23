/**
 * repo-zwillinge.mjs — Eigentümer: Quell-Zwillinge.
 *
 * Die Besitzer-Erklärung (SOURCE_TWINS) und ihre Prüfung.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isObject, read } from './repo-basis.mjs';

/**
 * Zwillings-Regeln: EINE Regel, die als KOPIE in zwei Dateien liegen MUSS.
 *
 * Seit 2026-10-20 gilt das nur noch fuer CLIENT-HAELFTEN. Die sechs
 * Host↔Host-Regeln (Digest, Workspace-Identitaet, letzte menschliche Nachricht,
 * Narrative-Kanal/-Vertrag, Entscheidungskanal) sind fort: sie importieren
 * `@shinon/seams/core`, und der Kern ist importfrei (`node:`-Module), also kostet
 * der Import NICHT die Eigenstaendigkeit, die die Kopie einmal begruendet hat.
 * Was einstimmig war, muss nicht geprueft werden.
 *
 * Warum die Client-Kopien bleiben (Stufe 2, absichtlich hier): ein
 * selbststaendiges Client-Bundle zieht React per `require` und kann keine
 * Host-Datei laden — es gibt fuer diese Haelfte keinen Importweg. Der Transport
 * ist deshalb eine Zwillingsregel mit EINEM Besitzer; Drift kann nicht landen,
 * weil Gate und Build jede Regel bei jedem Lauf pruefen.
 *
 *   kind 'region'    Beide Seiten tragen den Regeltext zwischen zwei Markern,
 *                    BYTEGLEICH. Der Besitzer steht im Marker und in dieser Liste.
 *   kind 'literals'  Der Spiegel kann keinen Text teilen: ausgewaehlte WERTE des
 *                    Besitzers muessen als Literal im Spiegel stehen.
 *
 * Ein `mirror`, der keine `client.js` ist, waere ein zurueckgekehrter
 * Host-Spiegel — `hostMirrorIssues()` macht ihn rot, und zwar unabhaengig davon,
 * ob er hier eingetragen wurde.
 *
 * Diese Liste ist die Besitzer-Erklaerung des Repos — nicht die Datei, die
 * zufaellig zuerst da war.
 */
export const SOURCE_TWINS = [
  {
    // Die zweite Richtung derselben Beziehung: die Persona schiebt ihren Zustand
    // in die Seite. Ohne den Namen als Zwilling zeigt die Leiste weiter ihren
    // Platzhalter, obwohl der Host den echten Zustand laengst hat.
    rule: 'Naht Persona -> Core-UI (Zustandsglobal + Live-Route)',
    kind: 'literals',
    owner: 'packages/persona/index.js',
    mirror: 'packages/core/client.js',
    values: [
      { export: 'UI_STATE_GLOBAL', literal: 'string' },
      { export: 'UI_STATE_ROUTE', literal: 'string' },
    ],
  },
  {
    // Die Pruef-Naht zeigt in BEIDE Richtungen: der Host legt den Startstand ins
    // Fenster und oeffnet die Route, das Panel liest beides. Ein falscher Name
    // hiesse nur, dass das Panel leer aussieht — wie „nichts zu entscheiden“.
    rule: 'Naht Persona-Pruefung (Panel <-> Host)',
    kind: 'literals',
    owner: 'packages/persona/index.js',
    mirror: 'packages/persona/client.js',
    values: [
      { export: 'REVIEW_ROUTE', literal: 'string' },
      { export: 'REVIEW_GLOBAL', literal: 'string' },
      { export: 'REVIEW_CONTRACT', literal: 'string' },
      // Das Panel haengt an der BESTEHENDEN Zustands-Route (SSE), nicht an einem
      // zweiten Kanal: derselbe Name, derselbe Strom.
      { export: 'UI_STATE_ROUTE', literal: 'string' },
    ],
  },
  {
    rule: 'Naht-Namen Client -> Host',
    kind: 'literals',
    owner: 'packages/codingmon/assets/uebergabe.js',
    mirror: 'packages/codingmon/client.js',
    values: [
      { export: 'UEBERGABE_NAMESPACE', literal: 'string' },
      { export: 'UEBERGABE_METHOD', literal: 'string' },
    ],
  },
  {
    rule: 'Marker-Nutzlast-Format und -Grenzen',
    kind: 'literals',
    owner: 'packages/markers/assets/marker-model.json',
    mirror: 'packages/markers/client.js',
    values: [
      { jsonPath: 'payload.line', literal: 'string' },
      { jsonPath: 'payload.comment', literal: 'string' },
      { jsonPath: 'limits.text', literal: 'number' },
      { jsonPath: 'limits.comment', literal: 'number' },
      // Die Markenmenge ist seit Schritt 2.3 nicht mehr nur eine Vertragszahl: sie
      // kommt aus den wirksamen Grenzen der Seite. Die Vertragsgabe steht als
      // Rueckfall im Client und muss dort bleiben.
      { jsonPath: 'limits.marks', literal: 'number' },
      // Und der Vertragsname: der Client verwirft einen Datensatz aus einem fremden
      // Vertrag — dafuer muss er den eigenen Namen als Literal tragen (er kann
      // index.js nicht importieren).
      { jsonPath: 'contract', literal: 'string' },
    ],
  },
  {
    // Der Schluessel, unter dem DSH die berechneten Token je Sitzung fuehrt
    // (Sitzungs-Projektion `tokenUsage` aus @deepseek-ai/dsh-token-meter). Der
    // Besitzer der Rechnung ist das assets-Core; die Client-Haelfte kann es
    // nicht importieren und traegt den Namen als Literal. Drift waere hier
    // teuer: eine Anzeige mit falschem Schluessel faellt still auf den
    // Ersatztext zurueck und sieht aus wie "keine Daten".
    rule: 'Projektions-Schluessel der Token-Anzeige',
    kind: 'literals',
    owner: 'packages/token-usage/assets/token-core.js',
    mirror: 'packages/token-usage/client.js',
    values: [{ export: 'TOKEN_USAGE_KEY', literal: 'string' }],
  },
  {
    // Der Slot, an dem das Popup-Overlay haengt: der Host kennt ihn als
    // Schema-Default + Profilwert, die Client-Haelfte muss ihn (als eigenes
    // Bundle ohne `import`) als Literal tragen. Drift waere still und teuer: die
    // Haelfte registrierte sich in einem Slot, den niemand rendert — das Overlay
    // existierte und waere unsichtbar, genau der Zustand, den dieses Paket
    // hinter sich hat.
    rule: 'Slot des Popup-Overlays',
    kind: 'literals',
    owner: 'packages/popup/index.js',
    mirror: 'packages/popup/client.js',
    values: [{ export: 'DEFAULT_SLOT', literal: 'string' }],
  },
  {
    // Dasselbe Muster für das Popup-Overlay: die Faltung des Sitzungsfensters
    // steht im Core (unit-testbar in CI, ohne node_modules) und als bytegleiche
    // Region in der Client-Hälfte, die den Core nicht importieren kann. Drift
    // wäre hier still und teuer: eine Anzeige, die andere Ereignisarten liest,
    // zeigt entweder nichts oder den falschen Vorgang — und beides sieht aus wie
    // "keine Daten".
    rule: 'Regel des Popup-Overlays (Faltung des Sitzungsfensters, Lesart)',
    kind: 'region',
    marker: 'zwilling:popup-trajectory',
    owner: 'packages/popup/assets/trajectory-core.js',
    mirror: 'packages/popup/client.js',
  },
  {
    // Die Rechnung der Token-Anzeige selbst: die Faltung der Turn-Ereignisse,
    // die Prozent-Regel und die Form. Sie steht im Core (unit-testbar, ohne
    // node_modules) und als bytegleiche Region in der Client-Haelfte, die das
    // Core nicht importieren kann (ein Client-Bundle zieht React per `require`).
    // Ein Test gegen DSHs eigene Funktionen kann nur die Kopie im Core pruefen —
    // diese Region ist der Beweis, dass die Haelfte im Browser dieselbe ist.
    rule: 'Regel der Token-Anzeige (Turn-Faltung, Prozent, Form)',
    kind: 'region',
    marker: 'zwilling:token-turn',
    owner: 'packages/token-usage/assets/token-core.js',
    mirror: 'packages/token-usage/client.js',
  },
  {
    // Die Rechnung der Toast-Anzeige selbst: die Faltung des Ereignisfensters
    // steht im Core (unit-testbar, ohne node_modules) und als bytegleiche Region
    // in der Client-Hälfte, die den Core nicht importieren kann. Drift wäre hier
    // STILL und teuer: eine Anzeige, die andere Record-Typen liest oder die
    // Schließung ueber callId verliert, zeigt dauerhaft dasselbe — und das sieht
    // aus wie "der Toast funktioniert nicht".
    rule: 'Regel der Traceability-Toasts (Faltung des Ereignisfensters)',
    kind: 'region',
    marker: 'zwilling:trace-toasts',
    owner: 'packages/traceability/assets/trace-core.js',
    mirror: 'packages/traceability/client.js',
  },
  {
    // Die Naht Host -> Browser: der Name des Globals, in das der Host die
    // WIRKSAMEN Grenzen legt (`webserver/index-inject`, dieselbe Naht wie die
    // Marker-Grenzen), und der Vertragsname, den der Client liest, um fremde
    // Datensätze zu verwerfen. Beides kann die Client-Hälfte nicht importieren.
    // Drift wäre STILL und teuer: die Seite trüge keinen Datensatz (Rückfall auf
    // den Vertrag) oder wirfe ihn als fremd weg — beides sähe aus wie "die
    // Profilwerte wirken nicht", und niemand bekäme eine Meldung.
    rule: 'Naht Host -> Browser (Traceability-Grenzen)',
    kind: 'literals',
    owner: 'packages/traceability/index.js',
    mirror: 'packages/traceability/client.js',
    values: [
      { export: 'TRACE_GLOBAL', literal: 'string' },
      { export: 'TOAST_CONTRACT', literal: 'string' },
    ],
  },
];

/** Der Text zwischen `// #region <marker>` und `// #endregion <marker>` (oder null). */
function regionOf(text, marker) {
  const start = text.indexOf(`// #region ${marker}`);
  const end = text.indexOf(`// #endregion ${marker}`);
  if (start < 0 || end < 0 || end < start) return null;
  return text.slice(start, end + `// #endregion ${marker}`.length);
}

/** Ein String, wie er als einfaches JS-Literal im Quelltext steht. */
const jsLiteral = (value) => `'${value
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\r/g, '\\r')
  .replace(/\n/g, '\\n')
  .replace(/\t/g, '\\t')}'`;

/**
 * Ein `export const NAME = '…'` als Wert (oder null).
 *
 * Die zweite, gleichwertige Schreibweise zaehlt mit: eine Deklaration
 * `const NAME = '…'`, die die Datei in einer `export { … }`-Liste herausgibt.
 * Beide verlangen dieselbe Zusage (der Name ist deklariert UND ausgeliefert),
 * und der Grund fuer die zweite ist real: derselbe Text steht als Region auch im
 * Client-Bundle in einem Funktionsrumpf, wo `export` ein Syntaxfehler waere. Ein
 * fehlendes `export` bleibt ein Issue — die Liste wird mitgeprueft.
 */
function exportedString(text, name) {
  const direct = new RegExp(`export const ${name} = '([^']*)'`).exec(text);
  if (direct !== null) return direct[1];
  const declared = new RegExp(`(?:^|\\n)const ${name} = '([^']*)'`).exec(text);
  if (declared === null) return null;
  return new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\}`).test(text) ? declared[1] : null;
}

/** Ein Punktpfad in geparsten Vertragsdaten. */
function dotPath(value, path) {
  return path.split('.').reduce((current, key) => (isObject(current) ? current[key] : undefined), value);
}

/**
 * Die Zwillings-Regeln pruefen. Ein fehlender Besitzer, ein fehlender Spiegel,
 * eine fehlende oder abweichende Region und ein fehlendes Literal sind je ein
 * Issue — Drift faellt damit im Gate (`scripts/dsh-test.mjs`) und im Build
 * (`scripts/build.mjs`) auf, nicht erst im Betrieb.
 * @param {string} root - Wurzel, in der die deklarierten Pfade gesucht werden.
 * @returns {string[]} Verstoesse (leer = alle Zwillinge stimmen).
 */
/**
 * Der Spiegeltext eines Zwillings. `mirrorScope: 'package'` liest das ganze
 * Runtime-Paket (index.js + assets/*.js): ein Modulschnitt verschiebt einen
 * Namen, er ändert die Zusage nicht. Ohne den Scope bleibt es bei der einen
 * Datei — die enge Vorgabe gilt weiter, wo sie steht.
 */
function mirrorTextOf(twin, root) {
  const file = join(root, twin.mirror);
  if (twin.mirrorScope !== 'package') return read(file);
  const texts = [read(file)];
  const assets = join(dirname(file), 'assets');
  if (existsSync(assets)) {
    for (const entry of readdirSync(assets, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) texts.push(read(join(assets, entry.name)));
    }
  }
  return texts.join('\n');
}

/**
 * Die Zwillings-Regeln prüfen. Ein fehlender Besitzer, ein fehlender Spiegel,
 * eine fehlende oder abweichende Region und ein fehlendes Literal sind je ein
 * Issue — Drift fällt damit im Gate (`scripts/shinon-test.mjs`) und im Build
 * (`scripts/build.mjs`) auf, nicht erst im Betrieb.
 * @param {string} root - Wurzel, in der die deklarierten Pfade gesucht werden.
 * @param {Array} twins - die zu prüfenden Regeln (Default: `SOURCE_TWINS`);
 *   der Parameter existiert für Mutationsproben an einem Miniatur-Baum.
 * @returns {string[]} Verstoesse (leer = alle Zwillinge stimmen).
 */
export function twinIssues(root = ROOT, twins = SOURCE_TWINS) {
  const issues = [];
  for (const twin of twins) {
    const ownerFile = join(root, twin.owner);
    const mirrorFile = join(root, twin.mirror);
    if (!existsSync(ownerFile)) {
      issues.push(`${twin.rule}: Besitzer ${twin.owner} fehlt`);
      continue;
    }
    if (!existsSync(mirrorFile)) {
      issues.push(`${twin.rule}: Spiegel ${twin.mirror} fehlt`);
      continue;
    }
    const ownerText = read(ownerFile);
    const mirrorText = mirrorTextOf(twin, root);

    if (twin.kind === 'region') {
      const ownerRegion = regionOf(ownerText, twin.marker);
      const mirrorRegion = regionOf(mirrorText, twin.marker);
      if (ownerRegion === null) issues.push(`${twin.rule}: Region ${twin.marker} fehlt in ${twin.owner}`);
      if (mirrorRegion === null) issues.push(`${twin.rule}: Region ${twin.marker} fehlt in ${twin.mirror}`);
      if (ownerRegion !== null && mirrorRegion !== null && ownerRegion !== mirrorRegion) {
        issues.push(`${twin.rule}: Region ${twin.marker} in ${twin.mirror} ist nicht bytegleich zu ${twin.owner}`);
      }
      continue;
    }

    let parsed = null;
    if (twin.owner.endsWith('.json')) {
      try {
        parsed = JSON.parse(ownerText);
      } catch (error) {
        issues.push(`${twin.rule}: Besitzer ${twin.owner} ist kein gueltiges JSON (${error.message})`);
        continue;
      }
    }
    for (const spec of twin.values ?? []) {
      const value = spec.jsonPath === undefined ? exportedString(ownerText, spec.export) : dotPath(parsed, spec.jsonPath);
      const label = spec.jsonPath ?? spec.export;
      if (value === undefined || value === null || String(value) === '') {
        issues.push(`${twin.rule}: Besitzer ${twin.owner} liefert ${label} nicht`);
        continue;
      }
      const wanted = spec.literal === 'number' ? new RegExp(`\\b${String(value)}\\b`) : null;
      const present = wanted === null ? mirrorText.includes(jsLiteral(String(value))) : wanted.test(mirrorText);
      if (!present) {
        issues.push(`${twin.rule}: ${twin.mirror} spiegelt ${label} (${JSON.stringify(value)}) nicht`);
      }
    }
  }
  return issues;
}
