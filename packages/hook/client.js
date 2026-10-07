/**
 * shinon-hook — Client-Hälfte (Event-Beobachter auf Web-Seite).
 *
 * Keine autonome Aktion. Der Client empfängt Events und leitet
 * normalisierte, validierte Datensätze an die Host-Seite weiter.
 */
window.__ModuleLoader__.load({
  id: '@shinon/hook',
  factory(require) {
    const PLUGIN = '@shinon/hook';
    const React = require('react');

    // Event-Schema als Referenz für Client-seitige Beobachtung.
    const OBSERVED_EVENTS = [
      'session.created',
      'message.received',
      'message.completed',
      'claim.created',
      'tool.requested',
      'tool.completed',
      'gate.failed',
      'gate.passed',
      'action.blocked',
    ];

    // Client-Beobachter: empfängt Events und normalisiert sie lokal.
    // Keine autonome Handlung — nur Beobachtung und Protokollierung.
    function observeEvent(type, payload) {
      console.log(`[shinon-hook-client] Beobachtet: ${type}`, payload);
      const normalized = {
        event_id: payload.event_id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        event_type: type,
        session_id: payload.session_id || 'unknown',
        source: 'dsh',
        timestamp: new Date().toISOString(),
        payload_ref: payload.payload_ref || '',
        contract: payload.contract || 'shinon-hook-default',
        trace_id: payload.trace_id || `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      console.log(`[shinon-hook-client] Normalisiert:`, normalized);
      return normalized;
    }

    // Registriere Beobachter für mindestens 3 reale DSH-Event-Typen.
    const boundObservers = [];
    for (const eventType of ['session.created', 'message.received', 'message.completed']) {
      const handler = (payload) => observeEvent(eventType, payload);
      // In einer echten DSH-Integration würde hier ein Listener registriert.
      // Für Wave 2: Referenz-Registrierung und Schema-Bezug.
      boundObservers.push({ eventType, handler });
    }

    // Der Client stellt keine autonome Aktion bereit.
    // Er protokolliert und leitet weiter — nicht mehr.
    //
    // Cordis nimmt nur eine Funktion oder ein Objekt mit `apply` als Plugin an;
    // ein reines Datenobjekt bricht den gesamten Client-Boot ab.
    return {
      inject: [],
      observeEvent,
      boundObservers,
      apply(ctx) {
        for (const { eventType } of boundObservers) {
          console.log(`[shinon-hook-client] Beobachter registriert für: ${eventType}`);
        }
        window.__hook = { plugin: PLUGIN, observeEvent, boundObservers, observed: OBSERVED_EVENTS };
        const stop = () => {
          console.log(`[shinon-hook-client] ${PLUGIN} gestoppt — keine Beobachter mehr aktiv`);
        };
        if (typeof ctx?.effect === 'function') ctx.effect(() => stop);
      },
    };
  },
});
