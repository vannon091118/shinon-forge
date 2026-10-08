import z from '@deepseek-ai/schemastery';

// Gelesen wird `enabled` (Verzweigung in apply) und `host`/`port` (nur in die Log-Zeile
// interpoliert). `specPath` liest kein Code — es bleibt, weil scripts/validate-test.mjs genau
// diesen Schluessel als Reiz der Regel „fehlende Ressource" pinnt.
export const Config = z.object({
  enabled: z.boolean().default(true),
  port: z.number().default(3000),
  host: z.string().default('127.0.0.1'),
  specPath: z.string().default('./openapi.yaml'),
});

/**
 * OpenAPI v1 Spec
 * 
 * @openapi
 * /api/v1/status:
 *   get:
 *     summary: Get system status
 *     responses:
 *       200:
 *         description: System is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, error]
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: number
 */

export function apply(ctx, config) {
  if (!config.enabled) {
    console.log('[openapi] Deaktiviert');
    return () => {};
  }

  // Ehrlicher Log: dieses Bundle oeffnet keinen Listener. host/port werden nur benannt.
  console.log(`[openapi] Kein Listener — Spec-Basis ${config.host}:${config.port} (kein Server in diesem Bundle)`);

  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });

  return () => {
    console.log('[openapi] Kein Listener zu beenden');
  };
}
