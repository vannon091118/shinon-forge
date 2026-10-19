/**
 * @shinon/prompter — render-context.js
 *
 * Kontext-Rendering (Plan §15): den Kontext als markierten Datenblock, die Skills als
 * eigenen Block, dazu die Neutralisierung der Marken im Inhalt. Reine Textfunktionen
 * ohne Host und ohne Dateisystem.
 */
import { CONTEXT_CONTRACT, CONTEXT_TAG } from './mode-core.js';

/** Ein Attribut fuer den Kontextblock entschaerfen — Pfade kommen vom Dateisystem, nicht vom Modell. */
export const escapeAttribute = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Die Marken des Blocks, die ein Dateiinhalt nicht selbst tragen darf. */
export const TAG_MARKER = new RegExp(`</?${CONTEXT_TAG}[^>]*>`, 'g');
export const FILE_MARKER = /<\/?file(\s[^>]*)?>/g;

/**
 * Die Marken des Blocks in einem DATEIINHALT entschaerfen.
 *
 * §15 sagt ausdruecklich: die XML-Markierung ist KEINE Sicherheitsgrenze. Das
 * stimmt — die Grenze ist die fehlende Faehigkeit (kein `tools`-Feld, siehe
 * buildEnhancerRequest). Aber die Markierung ist die einzige Auskunft darueber,
 * was Daten sind, und ein Inhalt, der die Marken SELBST traegt, hebt genau diese
 * Auskunft auf: er schliesst den Block vorzeitig, und alles danach liest das
 * Modell als Anweisung ausserhalb des Datenblocks. Das ist kein konstruierter
 * Fall — gemessen am echten Index dieses Repos: der Prompt, der die Plan-Datei
 * nennt, erzeugte ZWEI Abschluesse und 10431 Zeichen ausserhalb der Markierung.
 *
 * Entschaerft werden NUR die Marken des Blocks, nicht der Code: aus `a < b`
 * wird nichts, und eine Datei, die diese Zeichenfolgen als TEXT beschreibt (wie
 * die Plan-Datei selbst), bleibt lesbar — sie steht dann als Text im
 * Datenblock, was sie auch ist.
 */
export function neutralizeMarkers(text) {
  return String(text)
    .replace(TAG_MARKER, (match) => `&lt;${match.slice(1, -1)}&gt;`)
    .replace(FILE_MARKER, (match) => `&lt;${match.slice(1, -1)}&gt;`);
}

/**
 * Einen Skills-Block rendern — unabhaengig vom Modus.
 *
 * Skills werden IMMER injiziert (Zug 6): unabhaengig davon, ob der Kontext
 * geliefert wurde oder nicht. Sie geben dem Modell Zugriff auf projekspezifisches
 * Wissen (Best Practices, Architekturregeln, veraltete Patterns) — immer, nicht
 * nur in MAX.
 */
export function renderSkillsBlock(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return null;
  const lines = ['<shinon_skills>'];
  for (const skill of skills) {
    if (typeof skill !== 'object' || skill === null) continue;
    const name = typeof skill.name === 'string' ? skill.name : '';
    const description = typeof skill.description === 'string' ? skill.description : '';
    if (name === '') continue;
    lines.push(`  <skill name="${escapeAttribute(name)}">${escapeAttribute(description)}</skill>`);
  }
  lines.push('</shinon_skills>');
  return lines.join('\n');
}

/**
 * Den Kontext als `<untrusted_project_context>` rendern (Plan §15). Die
 * Markierung ist eine ANWEISUNG an das Modell, keine Grenze — die Grenze ist,
 * dass der Aufruf keine Fähigkeiten hat.
 *
 * Der Aufbau ist insofern belastbar, als genau EINE Region entsteht: alles aus
 * dem Projekt liegt zwischen den beiden Marken, auch wenn ein Inhalt sie selbst
 * enthaelt (neutralizeMarkers).
 */
export function renderContext(context) {
  const lines = [`<${CONTEXT_TAG}>`, `<context_contract>${CONTEXT_CONTRACT}</context_contract>`, `<project>${escapeAttribute(context.project)}</project>`];
  for (const file of context.files) {
    lines.push(`<file path="${escapeAttribute(file.path)}">`);
    lines.push(neutralizeMarkers(file.content));
    lines.push('</file>');
  }
  for (const [tag, values] of [['symbols', context.symbols], ['constraints', context.constraints], ['touches', context.touches], ['dependencies', context.dependencies]]) {
    if (values.length > 0) lines.push(`<${tag}>${values.map(escapeAttribute).join(', ')}</${tag}>`);
  }
  lines.push(`</${CONTEXT_TAG}>`);
  return lines.join('\n');
}


