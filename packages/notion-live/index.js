import z from '@deepseek-ai/schemastery';

/**
 * @shinon/notion-live — experimental status/control-plane scaffold.
 *
 * This bundle intentionally does not connect to Notion, start a relay, or
 * coordinate filesystem mutations. It makes that absence visible in the DSH
 * UI instead of pretending that configuration equals a working connection.
 */
export const STATUS_CHANNEL = 'shinon/notion-live/status';
export const REQUEST_STATUS_CHANNEL = 'shinon/notion-live/request-status';
export const STATUS_CONTRACT = 'shinon.notion-live/status-v1';

export const Config = z.object({
  enabled: z.boolean().default(false),
  relayUrl: z.string().default(''),
});

/** Syntactic URL check only; never performs a network request. */
export function validRelayUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  } catch {
    return false;
  }
}

/** Return truthful configuration state. relayConfigured is not connected. */
export function statusFromConfig(config = {}, checkedAt = new Date().toISOString()) {
  const enabled = config.enabled === true;
  const relayConfigured = validRelayUrl(config.relayUrl);
  const state = !enabled ? 'disabled' : !relayConfigured ? 'relay_missing' : 'scaffold_only';
  const note = state === 'disabled'
    ? 'Plugin ist deaktiviert. Es wird keine Verbindung aufgebaut.'
    : state === 'relay_missing'
      ? 'Aktiviert, aber keine gültige HTTPS-Relay-Adresse konfiguriert. Es wird keine Verbindung aufgebaut.'
      : 'Relay-Adresse ist eingetragen, aber OAuth, Notion-Synchronisierung und Bench-Koordination sind noch nicht implementiert.';

  return {
    contract: STATUS_CONTRACT,
    state,
    enabled,
    relayConfigured,
    relayReachability: 'not_checked',
    notionOAuthConnected: false,
    syncRunning: false,
    benchCoordinatorConnected: false,
    agentExecutionEnabled: false,
    checkedAt,
    note,
  };
}

export function apply(ctx, config) {
  let status = statusFromConfig(config);

  const publishStatus = () => {
    status = statusFromConfig(config);
    if (typeof ctx?.emit === 'function') ctx.emit(STATUS_CHANNEL, status);
  };

  // Client asks after it mounts, so it cannot miss the initial status event.
  const disposeRequest = typeof ctx?.on === 'function'
    ? ctx.on(REQUEST_STATUS_CHANNEL, publishStatus)
    : null;

  publishStatus();
  console.log('[shinon-notion-live] ' + status.state + '; no OAuth, sync, or bench lock is active');

  return () => {
    if (typeof disposeRequest === 'function') disposeRequest();
    if (typeof ctx?.emit === 'function') {
      ctx.emit(STATUS_CHANNEL, {
        ...status,
        state: 'stopped',
        syncRunning: false,
        benchCoordinatorConnected: false,
        agentExecutionEnabled: false,
        note: 'Plugin wurde entladen.',
      });
    }
  };
}
