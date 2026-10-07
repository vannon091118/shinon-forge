import z from '@deepseek-ai/schemastery';

/**
 * shinon-hook — Event-Spine für Shinon.
 *
 * Beobachtet definierte DSH-Events, normalisiert sie gegen ein
 * einheitliches Schema, validiert gegen einen Contract-Gate und
 * emittiert korrelierbare Event-Datensätze. Keine autonome Aktion.
 */

/** Event-Schema: Jeder beobachtete Event wird gegen dieses Schema validiert. */
export const EventSchema = z.object({
  event_id: z.string().min(1, 'event_id muss nicht leer sein'),
  event_type: z.union([
    z.const('session.created'),
    z.const('message.received'),
    z.const('message.completed'),
    z.const('claim.created'),
    z.const('tool.requested'),
    z.const('tool.completed'),
    z.const('gate.failed'),
    z.const('gate.passed'),
    z.const('action.blocked'),
  ]),
  session_id: z.string().min(1, 'session_id muss nicht leer sein'),
  source: z.const('dsh'),
  timestamp: z.string().min(1, 'timestamp muss nicht leer sein'),
  payload_ref: z.string().default(''),
  contract: z.string().min(1, 'contract muss nicht leer sein'),
  trace_id: z.string().min(1, 'trace_id muss nicht leer sein'),
});

/**
 * Hook-Konfiguration (Schemastery).
 * Beobachtete Events und Steuerung des Contract-Gates.
 */
export const Config = z.object({
  observeEvents: z.array(z.string()).default([
    'session.created',
    'message.received',
    'message.completed',
  ]),
  failClosed: z.boolean().default(true),
  contractGateEnabled: z.boolean().default(true),
});

/** Normalisiert ein rohes Event-Objekt gegen EventSchema. */
export function normalizeEvent(raw) {
  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`[shinon-hook] Normalisierung fehlgeschlagen: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Validiert einen normalisierten Event gegen den Contract-Gate. */
export function validateEvent(event, config = { failClosed: true }) {
  if (!event.event_id || event.event_id.length < 5) {
    if (config.failClosed) {
      throw new Error(`[shinon-hook] Event-ID zu kurz (${event.event_id}) — fail-closed`);
    }
    return false;
  }
  if (config.contractGateEnabled && (!event.contract || event.contract.trim() === '')) {
    if (config.failClosed) {
      throw new Error(`[shinon-hook] Contract fehlt für Event ${event.event_id} — fail-closed`);
    }
    return false;
  }
  return true;
}

/**
 * Registriert den Event-Observer im DSH-Kontext.
 * Keine autonome Aktion: observe → normalize → validate → emit.
 */
export function apply(ctx, config) {
  console.log('[shinon-hook] Aktiviert — Event-Spine beobachtet:', config.observeEvents);

  // Der Observer stellt die vier Kern-Operationen bereit.
  // Er entscheidet nicht autonom; er beobachtet, normalisiert, validiert und emittet.
  const observer = {
    observe(eventType, handler) {
      // Beobachtung: In einer echten DSH-Pipeline würde hier ein Listener
      // registriert. Für Wave 2: Schema-Referenz und Protokollierung.
      if (!config.observeEvents.includes(eventType)) {
        console.log(`[shinon-hook] Event-Typ nicht beobachtet: ${eventType}`);
      }
      console.log(`[shinon-hook] Beobachte: ${eventType}`);
      return () => { /* dispose */ };
    },

    normalize(rawEvent) {
      return normalizeEvent(rawEvent);
    },

    validate(event) {
      return validateEvent(event, { failClosed: config.failClosed, contractGateEnabled: config.contractGateEnabled });
    },

    emit(rawEvent) {
      const normalized = this.normalize(rawEvent);
      this.validate(normalized);
      console.log(`[shinon-hook] Emit: ${normalized.event_type} (id=${normalized.event_id}, trace=${normalized.trace_id}, session=${normalized.session_id})`);
      return normalized;
    },
  };

  // Beobachte die konfigurierten Events mit einer Referenz-Registrierung.
  for (const eventType of config.observeEvents) {
    observer.observe(eventType, (raw) => {
      try {
        observer.emit(raw);
      } catch (e) {
        // Fail-closed: Ungültige Events führen nicht zu einer autonomen Handlung,
        // sondern zu einem protokollierten Fehler.
        console.error(`[shinon-hook] Fail-closed bei Event ${eventType}:`, e.message);
      }
    });
  }

  return () => {
    console.log('[shinon-hook] Deaktiviert — Event-Spine gestoppt');
  };
}
