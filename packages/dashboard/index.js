import z from '@deepseek-ai/schemastery';

/**
 * shinon-dashboard - Zentrales Konfigurations-Dashboard
 * Nutzt Schemastery für Schema-basierte Konfiguration
 */

// Keine Einstellungen: kein Code liest einen Wert dieser Ebene (der Client rendert fix).
// `enabled`, `defaultView` und `sidebarPosition` sind entfallen — drei Optionen, die Wirkung
// behauptet haben. packages/dashboard/cordis.patch.yml schreibt sie noch (ausserhalb dieses Slices).
export const Config = z.object({});

export function apply(ctx, config) {
  console.log('[shinon-dashboard] Aktiviert:', config);

  // Register settings form for live editing
  // TODO: [DSH-Refactor] - Dieser settings.configure-Block ist wortgleich in dashboard, token-usage, tooltip, better-errors, openapi und core kopiert (gemessen: sechs identische Stellen, jede mit eigenem ctx.inject(['settings'])): ein Verhalten, sechs Kopien, keine gemeinsame Quelle.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });

  return () => {};
}
