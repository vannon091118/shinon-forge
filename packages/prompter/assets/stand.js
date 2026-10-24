/**
 * @shinon/prompter — stand.js
 *
 * Der Stand (Zug 4/5): was Shinon ueber sich weiss — gewaehlte Zettel als Block
 * fuer den Prompt, Haltung, Ton und Narrative-Lage als Datensatz fuer die Spur.
 * Liest Zettel ueber die Naht in `prompt-files.js`.
 *
 * KEINE SKILLS: der Veredler redigiert Text, die ausfuehrbaren Skills erreichen
 * das Hauptmodell ueber die native DSH-Discovery. Eine Auswahl hier waere Arbeit
 * ohne Abnehmer — und ein Datensatz, der "geladen" behauptet, was niemand liest.
 */
import { renderStand, selectNotes } from './note-core.js';
import { SCORING_SERVICE, SCORING_SERVICE_CONTRACT } from './mode-core.js';
import { readNotes } from './prompt-files.js';

/**
 * Den Stand dieses Schritts bauen: die passenden Zettel aus dem AUFGELOESTEN
 * Kontext (dieselbe Naht, die auch den MAX-Kontext liefert).
 *
 * Der Heuhaufen ist bewusst NICHT der Dateiinhalt: die Thema-Marke wird gegen
 * Projekt, Pfade, Symbole, Randbedingungen, Touches, Abhaengigkeiten und den
 * Prompt geprueft. Dateiinhalte wuerden jeden Zettel laden, dessen Thema
 * irgendwo im Projekt vorkommt — und damit jeden.
 */
export function standFor(config, runtime, promptText, context, toneState = null) {
  const tone = toneState?.tone ?? null;
  const stance = typeof tone?.stance === 'string' ? tone.stance : null;
  const tendencies = Array.isArray(tone?.tendencies) ? tone.tendencies : [];

  // Zwei Gruende, in dieser Reihenfolge: abgeschaltet ist eine Entscheidung,
  // fehlende Regeln sind ein Defekt. Ohne Regeln kein Zettel — welche Marke
  // passt und wie viele laden duerfen, steht NUR in der Regeldatei; ohne sie
  // waere jede Auswahl geraten.
  const off = typeof config?.notesPath !== 'string' || config.notesPath === '';
  const read = off || (runtime?.noteRules ?? null) === null
    ? { notes: [], skipped: [], reason: off ? 'NOTES_OFF' : 'NOTES_NO_RULES' }
    : readNotes(config, runtime.noteRules, runtime?.workspace?.root ?? '');
  const haystack = [
    promptText,
    context?.project ?? '',
    ...(context?.files ?? []).map((file) => file?.path ?? ''),
    ...(context?.symbols ?? []),
    ...(context?.constraints ?? []),
    ...(context?.touches ?? []),
    ...(context?.dependencies ?? []),
  ];
  const selected = off || (runtime?.noteRules ?? null) === null
    ? { loaded: [], skipped: [] }
    : selectNotes(read.notes, haystack, runtime.noteRules.reading ?? {});
  const notes = selected.loaded.map((entry) => entry.note);

  // Narrative-Lage (Zug 6): der letzte Composite vom Kanal, den `apply` hält.
  // Sie reist NUR als Datensatz (arc/narrator/beziehung) mit der Entscheidung —
  // nicht in den Block: der Veredler soll Text redigieren, nicht die Deutung
  // einer zweiten Engine uebernehmen. Ein Fremdwert (kein Objekt, oder ein
  // Array) ist KEINE Lage: der Kanal steht jedem offen, und ein String als
  // Narrative waere eine Lage, die niemand geschrieben hat.
  const narrative = typeof runtime?.narrative === 'object' && runtime.narrative !== null && !Array.isArray(runtime.narrative)
    ? runtime.narrative
    : null;

  // Der Block traegt NUR die Zettel: Haltung, Tendenzen und Narrative-Lage
  // gehoeren nicht in den Veredler — sie stehen im Live-Block des Hauptmodells
  // oder in der Entscheidungsspur. Was sie WAREN, haelt der Datensatz unten
  // (standTrace); der Block ist Prompt.
  const block = renderStand({ notes });

  return {
    block,
    stance,
    tendencies,
    // Die Lage als DATENSATZ neben dem Block: die drei benannten Felder reisen
    // mit der Entscheidung. Dass es keine Lage GIBT, wird `null` genannt und
    // nicht durch ein fehlendes Feld verschwiegen — sonst waere "kein Composite
    // gelesen" von "das Feld gibt es nicht" nicht zu unterscheiden.
    narrative: narrative === null
      ? null
      : {
          arc_id: narrative.arc_id ?? null,
          narrator: narrative.narrator ?? null,
          relationship_state: narrative.relationship_state ?? null,
        },
    tone: toneState?.source ?? 'none',
    thema: notes.map((note) => note.thema),
    skipped: [...read.skipped, ...selected.skipped],
    reason: read.reason,
  };
}

/**
 * Der Stand als Feld des Entscheidungsdatensatzes — kurz und ohne Inhalt.
 *
 * Benannt wird, was WIRKTE (Haltung, Stufen, geladene Marken) und was nicht
 * (Gruende). Den Text selbst traegt die Spur nicht: der Entscheidungsdatensatz
 * reist als Ereignis durch den Host, und ein Prompt-Block hat dort nichts zu
 * suchen.
 */
export function standTrace(stand) {
  if (stand === null || stand === undefined) return null;
  const reasons = [...new Set(stand.skipped.map((entry) => entry.reason))].sort();
  return {
    stance: stand.stance,
    tone: stand.tone,
    tendencies: stand.tendencies.map((entry) => `${entry.klasse} ${entry.stufe}`),
    // Die Narrative-Lage ohne Fliesstext: der Datensatz reist als Ereignis durch
    // den Host, ein Prompt-Block hat dort nichts zu suchen.
    narrative: stand.narrative ?? null,
    notes: { loaded: stand.thema, skipped: stand.skipped.length, reasons, reason: stand.reason },
  };
}

/**
 * Den Ton beim Scoring holen — optional, mit geprueftem Vertrag.
 *
 * Vier Richtungen, jede benannt, genau wie beim Index: kein Dienst (`none`),
 * fremder Vertrag (`invalid`), eine Antwort, die keine ist (`invalid`), oder ein
 * gelesener Ton (`scoring`). Ein FEHLENDER Dienst ist der Normalfall in einem
 * Profil ohne Scoring und kein Grund zum Abbruch — ein fremder Dienst unter
 * diesem Namen dagegen ist einer, und deshalb wird er einmal laut gemeldet.
 */
export function readTone(ctx, runtime) {
  let service;
  try {
    service = typeof ctx?.get === 'function' ? ctx.get(SCORING_SERVICE) : undefined;
  } catch {
    service = undefined;
  }
  if (service === undefined || service === null) return { tone: null, source: 'none' };
  if (service.contract !== SCORING_SERVICE_CONTRACT || typeof service.read !== 'function') {
    if (!runtime.toneWarned) {
      runtime.toneWarned = true;
      console.error(`[shinon-prompter] ${SCORING_SERVICE} verletzt den Vertrag ${SCORING_SERVICE_CONTRACT} — kein Ton im Stand`);
    }
    return { tone: null, source: 'invalid' };
  }
  let raw;
  try {
    raw = service.read();
  } catch (error) {
    console.error(`[shinon-prompter] Ton nicht lesbar (${error?.message ?? error}) — kein Ton im Stand`);
    return { tone: null, source: 'invalid' };
  }
  // `null` heisst: es gibt nichts zu sagen (kein Signal). Kein Ton ist hier die
  // richtige Antwort — nicht ein leerer.
  if (raw === null || raw === undefined) return { tone: null, source: 'none' };
  if (typeof raw !== 'object') return { tone: null, source: 'invalid' };
  return { tone: raw, source: 'scoring' };
}


