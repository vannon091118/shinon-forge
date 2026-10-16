import z from '@deepseek-ai/schemastery';

/**
 * @shinon/traceability — HOST-HÄLFTE: die WIRKSAMEN Grenzen in die Seite legen.
 *
 * ROLLENTEILUNG (dieselbe wie `@shinon/markers`): der Host kennt die Profilwerte
 * und liefert sie beim Ausliefern der Seite; der Client kann sie nicht erraten,
 * weil er ein eigenständiges Bundle ist. Der Datensatz wandert über
 * `webserver/index-inject` als `window.__SHINON_TRACEABILITY_CONFIG__` in den
 * Index — dieselbe Naht, über die DSH Theme, Dokument-Vorschau und
 * Modelleinstellungen ausliefert.
 *
 * WAS DIESE HÄLFTE NICHT TUT (konsolidiert, mit Grund):
 *
 *   - Sie lauscht NICHT auf `tool/call`/`tool/result`/`step/start`/`agent/error`.
 *     Das sind Record-Typen des SESSION-LOGS (belegt: `session.v4.jsonl`, 199×
 *     `tool/call`), keine Events eines Cordis-Bus — ein `ctx.on` darauf bliebe
 *     still. Das Falten des Ereignisfensters ist Arbeit der Client-Hälfte,
 *     exakt wie bei `@shinon/popup`.
 *   - Sie schreibt NICHTS in `globalThis.window`: der Host läuft in Node, wo es
 *     kein `window` gibt. Genau das war der Befund, durch den das
 *     Trace-Panel des Prompters leer blieb.
 *
 * Der Vertrag des Datensatzes ist `TOAST_CONTRACT` — der Besitzer steht hier,
 * der Client trägt denselben Wert als Literal (SOURCE_TWINS, geprüft von Gate
 * und Build; `scripts/gate/tests/traceability.test.mjs` pinnt die Naht).
 */

/** Das Global, in das der Host seine wirksamen Grenzen legt (der Client liest es). */
export const TRACE_GLOBAL = '__SHINON_TRACEABILITY_CONFIG__';

/** Vertragsname des Datensatzes; fremde Daten mit anderem Namen werden verworfen. */
export const TOAST_CONTRACT = 'shinon.traceability/toast-v1';

/**
 * Die Naht, über die `dsh-host-webserver` die Zeilen aller Häften einsammelt:
 * `ctx.on(INDEX_INJECT, table => table.push(row))`.
 */
export const INDEX_INJECT = 'webserver/index-inject';

/**
 * Schema des Pakets — die WIRKSAMEN Werte stehen im Profil
 * (`profiles/shinon/cordis.patch.yml`), diese hier sind die Vertragsvorgaben.
 */
export const Config = z.object({
  enabled: z.boolean().default(true),
  maxVisible: z.number().min(1).max(10).default(3),
  duration: z.number().min(500).max(30000).default(4000),
});

/**
 * Der Datensatz, den der Browser liest — Vertrag plus wirksame Grenzen.
 * Ein Wert außerhalb des Schemas ersetzt den Wert nicht, er fällt auf den
 * Vertragsvorgabe zurück: die Seite bekommt immer einen brauchbaren Satz.
 * @param {object} config - wirksame Config aus der Profil-Zusammensetzung.
 * @returns {{contract: string, enabled: boolean, maxVisible: number, duration: number}}
 */
export function configRecord(config) {
  const source = config ?? {};
  const bounded = (value, fallback, min, max) =>
    (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback);
  const defaults = Config.parse({});
  return {
    contract: TOAST_CONTRACT,
    enabled: source.enabled !== false,
    maxVisible: bounded(source.maxVisible, defaults.maxVisible, 1, 10),
    duration: bounded(source.duration, defaults.duration, 500, 30000),
  };
}

/**
 * Registriert die Auslieferung der Grenzen. Ohne `ctx.on` (Tests, fremder Host):
 * keine Registrierung, laut — der Client benutzt dann den Vertrag (Rückfall).
 */
export function apply(ctx, config) {
  const record = configRecord(config);

  if (typeof ctx?.on !== 'function') {
    console.log('[shinon-traceability] ctx.on fehlt — Grenzen werden NICHT ausgeliefert (BLOCKED), Client nutzt den Vertrag');
    return () => {};
  }

  const dispose = ctx.on(INDEX_INJECT, (table) => {
    if (Array.isArray(table)) table.push({ kind: 'global', name: TRACE_GLOBAL, value: record });
  });

  console.log(
    `[shinon-traceability] Aktiviert — ${TRACE_GLOBAL} über ${INDEX_INJECT} `
    + `(enabled=${record.enabled}, max=${record.maxVisible}, duration=${record.duration}ms)`,
  );

  return () => {
    if (typeof dispose === 'function') dispose();
    console.log('[shinon-traceability] Deaktiviert — keine Grenzen mehr ausgeliefert');
  };
}
