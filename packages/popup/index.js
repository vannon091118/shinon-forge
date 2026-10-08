import z from '@deepseek-ai/schemastery';

export const Config = z.object({
  enabled: z.boolean().default(true),
  slotName: z.string().default('conversation.composer.dock'),
  trigger: z.union([z.const('agent/pre-step'), z.const('user/message'), z.const('session/event')]).default('user/message'),
  showOriginal: z.boolean().default(true),
  showOutput: z.boolean().default(true),
  showProcess: z.boolean().default(true),
  category: z.string().default('process-step'),
  color: z.string().default('#ff8800'),
  /** Kanal, auf dem die Trajectory-Einträge den Host verlassen. */
  trajectoryChannel: z.string().default('shinon/trajectory'),
});

/**
 * Trigger → Signal, als EINE Tabelle.
 *
 * Vorher deckte der Zweig in `apply` nur 'user/message' und 'agent/pre-step' ab;
 * der dritte im Schema erlaubte Wert ('session/event') fiel in einen stillen
 * No-Op — eine Zeile in einem Profil, die nichts registriert und nichts meldet.
 *
 * 'user/message' hängt am kanonischen Spine-Signal `shinon/message/received`
 * (packages/events/assets/event-spine.json), nicht am Carrier `session/event`:
 * der Spine normalisiert bereits, ein zweiter Weg wäre eine zweite Wahrheit.
 */
export const TRIGGER_SIGNALS = {
  'user/message': 'shinon/message/received',
  'agent/pre-step': 'agent/pre-step',
  'session/event': 'session/event',
};

/**
 * Die Nutzlast ist das LETZTE Objektargument: DSH dispatcht `session/event` als
 * (session, event). Der frühere Handler nahm `(msg)` und bekam damit die Session
 * — die Trajectory trug den Session-Datensatz statt der Nachricht.
 */
export function lastPayload(...args) {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const value = args[index];
    if (value !== null && typeof value === 'object') return value;
  }
  return null;
}

export function apply(ctx, config) {
  if (!config.enabled) {
    console.log('[shinon-popup] deaktiviert (enabled=false) — kein Listener registriert');
    return () => {};
  }

  const signal = TRIGGER_SIGNALS[config.trigger];
  if (signal === undefined || typeof ctx?.on !== 'function') {
    console.warn(`[shinon-popup] nicht registriert (trigger=${config.trigger}, ctx.on=${typeof ctx?.on})`);
    return () => {};
  }

  console.log(`[shinon-popup] Aktiviert — ${signal} → ${config.trajectoryChannel} (Kategorie ${config.category})`);

  // Ein Trigger, ein Eintrag. Der Datensatz ist eine Auskunft über den Schritt,
  // keine Kopie der Nutzlast: nur die ausdrücklich eingeschalteten Felder.
  const trajectory = (entry) => {
    if (typeof ctx?.emit !== 'function') return;
    ctx.emit(config.trajectoryChannel, {
      category: config.category,
      color: config.color,
      original: config.showOriginal ? entry.original ?? null : null,
      output: config.showOutput ? entry.output ?? null : null,
      process: config.showProcess ? entry.process ?? null : null,
      timestamp: new Date().toISOString(),
    });
  };

  const handler = (...args) => trajectory({ original: lastPayload(...args), output: null, process: 'pending' });
  const dispose = ctx.on(signal, handler);

  return () => {
    if (typeof dispose === 'function') dispose();
    console.log('[shinon-popup] Deaktiviert — Listener abgemeldet');
  };
}
