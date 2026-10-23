/**
 * @shinon/prompter — enhance-command.js
 *
 * Die zwei Kommandos der MANUELLEN Veredelung (2026-10-23, Nutzerentscheidung):
 * Der Veredler soll auch SICHTBAR arbeiten können — im Eingabefeld, bevor der
 * Text beim Hauptmodell landet, mit einem Weg zurueck zum Original. Der
 * stille Ersetzungsweg des Pre-Step bleibt bestehen (Modus `auto`); dieser
 * Modul-Layer stellt die Gegenrichtung bereit:
 *
 *   veredeln       der Text im Eingabefeld wird veredelt (gleicher One-Shot-
 *                  Pfad, gleiche Annahme-Pruefung inkl. Inhalts-Anker) und
 *                  kommt als Text zurueck — nichts wird ersetzt, nichts wird
 *                  in der Sitzung geschrieben.
 *   veredeln-modus setzt den Sitzungs-Modus (`auto`|`manuell`). Der Pre-Step
 *                  liest ihn: in `manuell` laeuft KEIN automatischer One-Shot
 *                  (Grund `ENHANCE_MANUAL`) — genau dann ist der Knopf der
 *                  einzige Veredler, und der Mensch sieht jede Aenderung.
 *
 * WARUM KOMMANDOS: das ist der eine von DSH vorgesehene Weg fuer „eine
 * Operation, zwei Aufrufer" (UI-Aktion + Agenten-Werkzeug, gleiche
 * Host-Methode). Der Client ruft `ctx.remote.commands.execute(sessionId, …)`
 * ueber die kompilierte Remote-Liste — derselbe Weg, den die DSH-eigene
 * Plan-Chip-Oberflaeche geht. Ein Client-Bundle kann keinen Host-Endpunkt
 * registrieren; ein Kommando kann der Host REGISTRIEREN, und die UI ruft es.
 *
 * Isolation: diese Datei importiert kein Netz, kein Dateisystem und kein
 * `ctx.agents`/`ctx.shell` — der Isolationstest des Prompters scannt die
 * gesamte Laufzeit-Modulmenge, und diese Datei gehoert dazu.
 */

/** Der Befehlsname der Veredelung — CLIENT-SEITIG als Literal dupliziert (ein Client-Bundle importiert keinen Host) und vom Test gegen diese Konstante gepinnt. */
export const ENHANCE_COMMAND = 'veredeln';
/** Der Befehlsname der Moduswahl. */
export const MODE_COMMAND = 'veredeln-modus';
/** Der Vertrag der Kommando-Ergebnisse (Rueckgabe an die UI ist ein CommandResult der DSH-Kommandolaufzeit). */
export const ENHANCE_CONTRACT = 'shinon.prompter/enhance-command-v1';

/** Die zwei erlaubten Moduswerte. */
export const MODE_AUTO = 'auto';
export const MODE_MANUAL = 'manuell';

/** Obergrenze der Sitzungs-Modus-Map: ein langer Host-Zaehler nichts unbegrenzt. */
export const SESSION_MODE_CAP = 100;

/**
 * Die Sitzungs-Modi mit fester Obergrenze.
 *
 * Reihenfolge ist Alter: `set` schiebt die Sitzung ans Ende, bei Ueberlauf
 * faellt der aelteste Eintrag als erster. Ohne diese Grenze waere die Map
 * ein stilles Speckleckchen — jeder Besuch einer Sitzung hinterliess einen
 * Eintrag fuer die Lebenszeit des Hosts.
 *
 * OHNE EINTRAG gilt `auto` — der heutige Verhalten ist der Default, und ein
 * Sitzungs-Wechsel beginnt ohne Altlast.
 */
export function createSessionModes(cap = SESSION_MODE_CAP) {
  const modes = new Map();
  return {
    get: (sessionId) => (typeof sessionId === 'string' && modes.has(sessionId) ? modes.get(sessionId) : MODE_AUTO),
    set: (sessionId, mode) => {
      if (typeof sessionId !== 'string' || sessionId === '') return;
      modes.delete(sessionId);
      modes.set(sessionId, mode);
      while (modes.size > cap) modes.delete(modes.keys().next().value);
    },
    size: () => modes.size,
  };
}

/** Die Sitzungs-Id aus einer Kommando-Invocation — defensiv, nie geraten. */
export function sessionIdOf(invocation) {
  const session = invocation?.agent?.session;
  return typeof session?.id === 'string' && session.id !== '' ? session.id : null;
}

/**
 * Die Veredelungs-Definition für `ctx.commands.register`.
 *
 * `deps` ist injiziert, damit diese Datei kein `ctx` importiert und ihr Test
 * mit Attrappen fahren kann:
 *
 *   enhance   async (text, { context, signal }) → { outcome, reasons, result }
 *             (in der Praxis: enhanceGuarded mit der aufgeloesten Route)
 *   loadContext () → gelieferter Kontext oder null (Datei-Quelle wie im Pre-Step)
 *   config    der gültige Prompter-Config mit `mode`
 */
export function enhanceCommandDefinition(deps) {
  return {
    name: ENHANCE_COMMAND,
    description: 'Veredelt den Text im Eingabefeld — gleicher Prüfweg wie der automatische Enhancer, aber sichtbar und ohne Ersetzung.',
    input: { hint: 'der zu veredelnde Text' },
    async handler(invocation) {
      const text = typeof invocation?.rawInput === 'string' ? invocation.rawInput.trim() : '';
      if (text === '') {
        return { kind: 'error', text: 'Veredeln: kein Text im Eingabefeld.' };
      }
      let context = null;
      try {
        context = deps.loadContext();
      } catch {
        // Ein kaputter Kontext darf die Veredelung nicht sperren: ohne Kontext
        // veredelt der One-Shot den Text allein (derselbe Fall wie MIN).
        context = null;
      }
      const outcome = await deps.enhance(text, { context, signal: invocation?.signal });
      if (outcome?.outcome === 'accepted' && typeof outcome?.result?.enhancedPrompt === 'string') {
        return { kind: 'success', text: outcome.result.enhancedPrompt };
      }
      // Verwerfen ist kein Ausfall: der Grund steht im Ergebnis, und der
      // Eingabefeld-Text bleibt ohnehin unangetastet (die UI ersetzt nur bei
      // Erfolg).
      const reasons = Array.isArray(outcome?.reasons) ? outcome.reasons.join(', ') : 'unbekannt';
      return { kind: 'error', text: `Veredelung verworfen (${reasons}) — der Text bleibt wie er ist.` };
    },
  };
}

/**
 * Die Modus-Definition für `ctx.commands.register`.
 *
 * Die UI schickt bei JEDER Umschaltung den neuen Wert — auch zurück auf
 * `auto`, wo kein Veredeln stattfindet und damit sonst nie ein Befehl zum
 * Host käme. Der Eintrag pro Sitzung ist der Zustand, den der Pre-Step liest.
 */
export function modeCommandDefinition(modes) {
  return {
    name: MODE_COMMAND,
    description: 'Setzt den Veredler-Modus dieser Sitzung: auto (der Pre-Step veredelt still) oder manuell (nur der veredeln-Befehl).',
    input: { hint: 'auto | manuell' },
    handler(invocation) {
      const sessionId = sessionIdOf(invocation);
      if (sessionId === null) {
        return { kind: 'error', text: 'veredeln-modus: keine Sitzung in der Invocation.' };
      }
      const value = typeof invocation?.rawInput === 'string' ? invocation.rawInput.trim() : '';
      if (value !== MODE_AUTO && value !== MODE_MANUAL) {
        return { kind: 'error', text: `veredeln-modus: "${value}" ist weder ${MODE_AUTO} noch ${MODE_MANUAL}.` };
      }
      modes.set(sessionId, value);
      return { kind: 'success', text: value === MODE_MANUAL
        ? 'Manueller Modus: der Enhancer läuft nur noch auf Befehl — jede Veredelung ist sichtbar.'
        : 'Automatischer Modus: der Enhancer veredelt wieder still im Pre-Step.' };
    },
  };
}
