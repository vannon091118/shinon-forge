/**
 * Der Struktur-Riegel: Klassen, Grenzen, Eigentum.
 *
 * Warum es diese Datei gibt: Die Zahlen in `docs/ZAHLEN.md` sagen, WIE VIELE
 * Dateien es gibt, aber nicht, wie groß eine werden darf. Ohne Grenze wächst
 * jede Datei genau so lange, bis niemand sie mehr am Stück liest — und die
 * Grenze, die man dann rät, ist entweder zu eng (Arbeit, die niemand braucht)
 * oder zu weit (sie greift nie). Deshalb stehen die Grenzen in
 * `docs/contracts/structure.json` zusammen mit der Messung, aus der sie folgen
 * (Median und Maximum je Klasse am 2026-10-20).
 *
 * Drei Dinge macht dieser Schritt rot, und jedes hat einen eigenen Befund:
 *
 *   1. Zeilen über der Klassengrenze. Es gibt KEINEN Bestand mehr: eine Datei
 *      über ihrer Grenze ist rot, fertig. Das ist am 2026-10-23 scharf
 *      geworden, nachdem die Client-Hälften in Quellteile zerlegt wurden
 *      (`scripts/build-client.mjs`) und damit jede handgeschriebene Datei ihre
 *      Grenze einhielt. Die einzige Ausnahme ist GENERIERTER Text: er hat
 *      keine Lesegrenze, weil ihn niemand am Stück liest — dafür muss er
 *      bytegleich aus seinen Quellen reproduzierbar sein, und das prüft
 *      `scripts/gate/tests/client-montage.test.mjs`.
 *   2. Eine Datei ohne deklarierten Eigentümer: kein Klassenmuster trifft sie.
 *      Das ist der Fall, in dem eine neue Rolle entstanden ist, ohne dass
 *      jemand ihre Grenze entschieden hat.
 *   3. Eine Datei, die den Vertrag ihrer Klasse verletzt. Die Klassen-Registry
 *      sagt, was eine Hälfte AUSMACHT (z. B. `client.js` trägt kein Schema,
 *      `index.js` trägt `apply`); ohne diese Prüfung wäre ein Klassenname nur
 *      ein Ordner-Etikett.
 *
 * Was der Schritt bewusst NICHT tut: er zählt keine `export function` und
 * keine Zustands-Eigentümer. Verantwortung ist nicht maschinell messbar, und
 * eine Heuristik darauf würde beim ersten Fehlalarm abgeschaltet. Getrennt
 * wird nach Eigentum (unten im Vertrag jeder Klasse benannt); die Grenze
 * verhindert nur, dass die Trennung wieder zuwächst.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Der Baum, den dieser Riegel meint, ist der, in dem er liegt — nicht das
// Arbeitsverzeichnis des Aufrufers. Ein Gate, dessen Ergebnis von `cd` abhängt,
// ist keins.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const STRUCTURE_FILE = 'docs/contracts/structure.json';
export const CONTRACT = 'shinon.structure/v1';

/**
 * Alle Dateien des Baums, die eine Klasse haben können — dieselbe Auswahl wie
 * die Zählung in `docs/ZAHLEN.md`, damit Grenze und Zahl nicht auseinander
 * laufen. `dist/`, `node_modules/` und das geseedete DSH-Home sind erzeugt und
 * gehen niemanden an.
 */
const WURZELN = ['packages', 'scripts', 'bin'];
const AUSGESCHLOSSEN = /(^|\/)(node_modules|dist|dev-dsh-home|\.git)(\/|$)/;

/** Alle Code-Dateien unter den Wurzeln, relativ und sortiert. */
function codeDateien(root) {
  const dateien = [];
  for (const base of WURZELN) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const name of readdirSync(current)) {
        const abs = join(current, name);
        if (AUSGESCHLOSSEN.test(zuRelative(root, abs))) continue;
        if (statSync(abs).isDirectory()) stack.push(abs);
        else if (CODE.test(name)) dateien.push(abs);
      }
    }
  }
  return dateien.sort();
}

/** Datei-Endungen, die als Code zählen. Markdown und JSON tragen keine Grenze. */
const CODE = /\.(js|mjs|cjs)$/;

function zeilen(abs) {
  const text = readFileSync(abs, 'utf8');
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  // Dieselbe Zählung wie `wc -l`: die Zeilenzahl, die eine Leserin im Editor
  // sieht, wenn die Datei mit einem Zeilenumbruch endet (was sie soll).
  return text.length > 0 && !text.endsWith('\n') ? n + 1 : n;
}

function zuRelative(root, abs) {
  return relative(root, abs).split(sep).join('/');
}

/**
 * Der Befund zu EINER Datei — oder null. Getrennt von der Schleife, damit der
 * Test genau eine Regel einzeln anfahren kann, ohne einen ganzen Baum zu bauen.
 */
export function dateiBefund({ datei, lines, struktur, generiert = false }) {
  const klasse = (struktur.klassen ?? []).find((k) => new RegExp(k.muster).test(datei));
  if (klasse === undefined) {
    return `${datei}: keine Klasse — kein Muster in ${STRUCTURE_FILE} trifft einen Eigentümer`;
  }
  // Ein generierter Text ist keine Lese-Einheit: seine Grenze ist nicht die
  // Zeilenzahl, sondern die Bytegleichheit zu seinen Quellen. Die Marke steht
  // im Dateikopf (`GENERIERT aus …`) und wird von `generiertMarke()` gelesen.
  // Sie gilt NUR fuer die Client-Haelfte: jeder andere generierte Text haette
  // keinen Generator, den ein Test bytegleich nachrechnen kann — die Marke
  // waere dort ein Etikett auf einer handgepflegten Datei und damit eine
  // stille Abschaltung der Grenze. Deshalb ist sie ausserhalb ein Befund.
  if (generiert) {
    return klasse.id === 'client'
      ? null
      : `${datei}: Kopfmarke \`GENERIERT aus\` in der Klasse ${klasse.id} — nur eine Client-Hälfte wird generiert`;
  }
  if (lines > klasse.grenze) {
    return `${datei}: ${lines} Zeilen über der Grenze ${klasse.grenze} (${klasse.id}) — entweder trennen oder generieren`;
  }
  return null;
}

/**
 * Trägt die Datei die Marke eines generierten Textes? Gemeint ist der KOPF:
 * der Markenkommentar vor der ersten Zeile echten Codes.
 *
 * Warum so streng: `slice(0, 40)` war eine Zeilenzahl, geraten statt geprüft,
 * und eine Zeichenkette in einem Testfixtur-String (`client-montage.test.mjs`
 * baut einen generierten Kopf nach) zählte als zweiter generierter Text. Der
 * Kopf endet, wo der Code beginnt — das ist die einzige Grenze, die ein
 * Dateikopf von sich aus hat.
 */
export function generiertMarke(text) {
  let first = true;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (first && trimmed.startsWith('#!')) { first = false; continue; }
    first = false;
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')
      || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
      if (trimmed.includes('GENERIERT aus ')) return true;
      continue;
    }
    return false;
  }
  return false;
}

/**
 * Alle Befunde des Baums. Reihenfolge: Klassenzuordnung, Grenze, toter
 * Bestandseintrag, Vertrag — damit der erste Befund schon die Ursache nennt.
 */
export function structureIssues(root = ROOT) {
  const issues = [];
  const file = join(root, STRUCTURE_FILE);
  if (!existsSync(file)) return [`${STRUCTURE_FILE} fehlt — ohne Registry gibt es keine Grenze`];
  let struktur;
  try {
    struktur = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [`${STRUCTURE_FILE}: kein JSON (${error.message})`];
  }
  if (struktur.contract !== CONTRACT) {
    return [`${STRUCTURE_FILE}: Vertrag ${struktur.contract ?? '(fehlt)'} statt ${CONTRACT}`];
  }
  for (const key of ['rules', 'klassen', 'vertraege', 'profil']) {
    if (struktur[key] === undefined) issues.push(`${STRUCTURE_FILE}: Feld \`${key}\` fehlt`);
  }
  for (const klasse of struktur.klassen ?? []) {
    if (typeof klasse.grenze !== 'number' || klasse.grenze <= 0) {
      issues.push(`${STRUCTURE_FILE}: Klasse ${klasse.id} ohne positive Grenze`);
    }
    if (klasse.gemessen === undefined) {
      issues.push(`${STRUCTURE_FILE}: Klasse ${klasse.id} ohne Messung — die Grenze wäre geraten`);
    }
  }
  if (issues.length > 0) return issues;

  for (const abs of codeDateien(root)) {
    const datei = zuRelative(root, abs);
    const lines = zeilen(abs);
    const text = readFileSync(abs, 'utf8');
    const befund = dateiBefund({ datei, lines, struktur, generiert: generiertMarke(text) });
    if (befund !== null) {
      issues.push(befund);
      continue;
    }
    const klasse = struktur.klassen.find((k) => new RegExp(k.muster).test(datei));
    for (const nadel of klasse.vertrag ?? []) {
      if (!text.includes(nadel)) issues.push(`${datei}: Vertrag der Klasse ${klasse.id} verlangt \`${nadel}\``);
    }
    for (const nadel of klasse.verboten ?? []) {
      if (text.includes(nadel)) issues.push(`${datei}: Klasse ${klasse.id} verbietet \`${nadel}\``);
    }
  }

  issues.push(...vertragsBefunde(root, struktur), ...profilBefunde(root, struktur));
  return issues;
}

/**
 * Zwei Riegel, die nicht ueber Zeilen laufen — deshalb wohnen sie in derselben
 * Datei: sie beantworten dieselbe Frage („hat das einen Eigentuemer?") fuer die
 * zwei Orte, die keine Code-Dateien sind.
 *
 * `docs/contracts/` traegt dreizehn Vertraege, von denen heute nur fuenf von
 * Code gelesen werden (Kanon, Struktur, Commit-Policy, Commit-Trailer,
 * Faehigkeiten). Die anderen acht sind menschenlesbare Zusammenfassungen —
 * ihre maschinenlesbare Quelle liegt im Paket. Beides ist in Ordnung, aber
 * beides muss GESAGT sein: ein Vertrag ohne Eigentuemer ist die Doppelung, die
 * der Kanon verhindern soll, eine Ebene tiefer. Der Unterschied zwischen
 * `art: quelle` und `art: zusammenfassung` ist der Unterschied zwischen „der
 * Code liest das hier" und „der Code liest woanders, das hier erklaert es".
 * Ein Leser, der die Datei nicht einmal NENNT, ist keine Quelle, sondern eine
 * Behauptung — deshalb wird der Name im Leser geprueft.
 *
 * `profiles/` traegt Daten und Links, keine Logik. Ein `.js` in einem Profil
 * waere eine zweite Fassung eines Pakets, die kein Gate sieht: der Modul-Loader
 * loest `profiles/<name>/node_modules` VOR dem Root auf, ein dort liegendes
 * Skript schattet also das Repo-Paket (genau der Fehler aus den Pitfalls). Die
 * Pflichtdateien (Manifest und Patch) sind benannt, `cordis.<variante>.yml`
 * bleibt als Variante erlaubt, alles andere braucht eine Entscheidung.
 */
function vertragsBefunde(root, struktur) {
  const registry = struktur.vertraege;
  if (registry === undefined || typeof registry !== 'object' || Array.isArray(registry)) {
    return [`${STRUCTURE_FILE}: Feld \`vertraege\` fehlt — jeder Vertrag braucht einen Eigentuemer`];
  }
  const dir = join(root, 'docs/contracts');
  if (!existsSync(dir)) return ['docs/contracts fehlt — ohne Vertraege kein Kanon'];
  const dateien = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const issues = [];
  for (const name of dateien) {
    const datei = `docs/contracts/${name}`;
    const eintrag = registry[datei];
    if (eintrag === undefined) {
      issues.push(`${datei}: kein Eintrag in \`vertraege\` — ein Vertrag ohne Eigentuemer`);
      continue;
    }
    const art = eintrag?.art;
    if (art === 'quelle') {
      const leser = Array.isArray(eintrag.leser) ? eintrag.leser : [];
      if (leser.length === 0) {
        issues.push(`${datei}: art=quelle ohne Leser — wer liest diesen Vertrag?`);
        continue;
      }
      for (const pfad of leser) {
        const abs = join(root, pfad);
        if (!existsSync(abs)) {
          issues.push(`${datei}: Leser ${pfad} existiert nicht`);
          continue;
        }
        if (!readFileSync(abs, 'utf8').includes(name)) {
          issues.push(`${datei}: Leser ${pfad} nennt die Datei nicht — der Eintrag ist eine Behauptung`);
        }
      }
      continue;
    }
    if (art === 'zusammenfassung') {
      const quellen = Array.isArray(eintrag.quelle) ? eintrag.quelle : [];
      if (quellen.length === 0) {
        issues.push(`${datei}: art=zusammenfassung ohne \`quelle\` — dann ist es keine Zusammenfassung`);
        continue;
      }
      for (const pfad of quellen) {
        if (!existsSync(join(root, pfad))) issues.push(`${datei}: Quelle ${pfad} existiert nicht`);
      }
      continue;
    }
    issues.push(`${datei}: art muss \`quelle\` oder \`zusammenfassung\` sein (ist: ${String(art)})`);
  }
  for (const datei of Object.keys(registry)) {
    if (!datei.startsWith('docs/contracts/')) {
      issues.push(`${datei}: Eintrag in \`vertraege\` ausserhalb von docs/contracts/`);
      continue;
    }
    if (!dateien.includes(datei.slice('docs/contracts/'.length))) issues.push(`${datei}: Eintrag ohne Vertragsdatei — Eintrag entfernen`);
  }
  return issues;
}

function profilBefunde(root, struktur) {
  const cfg = struktur.profil;
  if (cfg === undefined || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return [`${STRUCTURE_FILE}: Feld \`profil\` fehlt — ein Profil ohne Riegel ist ein zweiter Paketbaum`];
  }
  const wurzel = typeof cfg.wurzel === 'string' && cfg.wurzel !== '' ? cfg.wurzel : 'profiles';
  const pflicht = Array.isArray(cfg.pflicht) ? cfg.pflicht : [];
  const dir = join(root, wurzel);
  if (!existsSync(dir)) return cfg.erforderlich === true ? [`${wurzel} fehlt — das Profil ist der Start des Produkts`] : [];
  const issues = [];
  for (const name of readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isDirectory()).sort()) {
    const ordner = join(dir, name);
    const dateien = readdirSync(ordner).filter((entry) => statSync(join(ordner, entry)).isFile()).sort();
    for (const datei of pflicht) {
      if (!dateien.includes(datei)) issues.push(`${wurzel}/${name}: Pflichtdatei ${datei} fehlt`);
    }
    for (const datei of dateien) {
      if (CODE.test(datei)) {
        issues.push(`${wurzel}/${name}/${datei}: ein Profil traegt Daten und Links, keine Logik`);
        continue;
      }
      if (!pflicht.includes(datei) && !/^cordis\.[\w-]+\.yml$/.test(datei)) {
        issues.push(`${wurzel}/${name}/${datei}: Datei, die die Profil-Regel nicht kennt`);
      }
    }
  }
  return issues;
}

/**
 * Die gemessenen Zahlen des Riegels — EINE Quelle für `docs/ZAHLEN.md` §1.2 und
 * `npm run zahlen:check`.
 *
 * Warum hier und nicht im Doku-Skript: die Zahl der Code-Dateien ist nur dann
 * dieselbe wie die des Riegels, wenn BEIDE `codeDateien()` lesen. `ohneKlasse`
 * und `vertragsverstoesse` werden aus den Befunden gezählt, die `npm test` rot
 * machen — eine Zahl, die den Riegel wiederholt, kann nicht neben ihm driften.
 *
 * @returns {{dateien: number, klassen: number, generiert: number, ohneKlasse: number, vertragsverstoesse: number}}
 */
export function strukturZahlen(root = ROOT) {
  const file = join(root, STRUCTURE_FILE);
  const struktur = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { klassen: [] };
  const issues = structureIssues(root);
  const ohneKlasse = issues.filter((issue) => issue.includes('keine Klasse')).length;
  const generiert = codeDateien(root).filter((abs) => generiertMarke(readFileSync(abs, 'utf8'))).length;
  return {
    dateien: codeDateien(root).length,
    klassen: Array.isArray(struktur.klassen) ? struktur.klassen.length : 0,
    generiert,
    ohneKlasse,
    vertragsverstoesse: issues.length - ohneKlasse,
  };
}
