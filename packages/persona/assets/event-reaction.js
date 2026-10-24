/**
 * event-reaction.js — was die Persona mit EINEM Spine-Ereignis tut.
 *
 * Eigentuemer-Grenze (Schnitt 2026-10-24): der Eintrag REGISTRIERT den Handler
 * am Bus, die Reaktion steht hier. Sie ist bewusst klein und ohne Modell: das
 * Ereignis lesen (Rechnung im Kern), die Sitzung merken, den Text der letzten
 * Menschen-Nachricht setzen, das Langzeitgedaechtnis beobachten und Anrede bzw.
 * Stimmung umschalten. Geschrieben wird nur in die Halter, die der Eintrag
 * besitzt — ueber die Callbacks, nicht ueber eine zweite Kopie des Zustands.
 */
import { logEventRead } from '@shinon/seams/core';
import { beobachten, turnSummary } from './interaction-core.js';

/**
 * Den Handler bauen.
 *
 * `getTrigger`/`getMood` lesen den ZULETZT erkannten Stand (die Erkennung ist
 * zustandsbehaftet: eine Anrede bleibt stehen, bis eine neue kommt), `setTrigger`
 * schreibt ihn und laesst den Abschnitt neu rendern. `resetDecision` oeffnet
 * keine alte Auftragsklasse in einem neuen Turn.
 */
export function createEventReaction({
  triggers,
  channel,
  getTrigger,
  getMood,
  setTrigger,
  setMood,
  resetDecision,
  runtime,
  persona,
  promptText,
  tally,
  log = console,
}) {
  return (envelope, payload) => {
    // Das Lesen des Ereignisses ist Rechnung und liegt im Kern.
    const gelesen = beobachten(envelope, payload, {
      triggers,
      letzterTrigger: getTrigger(),
      letzteStimmung: getMood(),
      tally,
    });
    if (gelesen === null) return;
    if (gelesen.sessionId !== null) runtime.lastSessionId = gelesen.sessionId;
    // EINE Zeile je TURN, nicht je Ereignis: was ANKAM und wie viel davon von
    // einem Menschen kam, ist die Auskunft, die jemand liest; zwoelf Zeilen
    // „gelesen“ in einem Turn sind Rauschen (gemessen 2026-10-23).
    const turnLine = gelesen.eventType === 'turn.end' ? turnSummary(gelesen.tally) : null;
    if (gelesen.eventType === 'message.received' && gelesen.human) {
      // Nur der Mensch setzt „die letzte Nachricht\": sonst ueberschreibt der
      // eingeblendete Live-Block (der NACH der Menschen-Nachricht kommt) den
      // Text, an dem die Abschnitts-Gates und das Gedaechtnis haengen.
      promptText.remember(gelesen.sessionId, gelesen.text);
      resetDecision();
    }
    // Jedes relevante Ereignis geht in das Langzeitgedaechtnis.
    runtime.remember('event', { type: gelesen.eventType, payload: gelesen.eventPayload });
    persona.observe(gelesen.eventType, gelesen.eventPayload);
    if (gelesen.triggerGewechselt) {
      setTrigger(gelesen.trigger);
      log.log(`[shinon-persona] Anrede erkannt (${gelesen.trigger}) — narrative Selbstauskunft aktiv`);
    }
    if (gelesen.stimmungGewechselt) {
      setMood(gelesen.stimmung);
      if (gelesen.stimmung !== null) log.log(`[shinon-persona] User-Lage erkannt (${gelesen.stimmung})`);
    }
    // `umfang=0`, weil diese Zeile selbst kein gelesenes Ereignis ist.
    if (turnLine !== null) {
      logEventRead({ quelle: channel, ziel: 'persona:turn.zusammenfassung', umfang: 0, grund: turnLine, trace_id: gelesen.traceId });
      if (tally !== undefined && tally !== null) tally.events = 0; // neuer Turn, neuer Zaehler
    }
  };
}
