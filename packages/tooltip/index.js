import z from '@deepseek-ai/schemastery';

/**
 * shinon-tooltip - Erweiterte Tooltips
 * Nutzt Schemastery für Konfiguration
 */

// `showTooltips` und `tooltipPosition` sind entfallen: kein Code liest sie — der einzige Treffer
// fuer showTooltips ausserhalb dieses Pakets ist Hilfetext in scripts/dsh_reload.mjs und Docs/PLAN.md.
// packages/tooltip/cordis.patch.yml schreibt beide noch (ausserhalb dieses Slices).
// TODO: [DSH-Refactor] - `tooltipDelay` bleibt als einziges Feld stehen, obwohl es im Code keinen
// Konsumenten hat: es ist der Reiz des Fehlerpfads G7 (scripts/stages.mjs schreibt
// `tooltipDelay: soon` und erwartet „ValidationError: invalid config"). Das Feld darf erst fallen,
// wenn dieser Pfad einen anderen Reiz hat.
export const Config = z.object({
  tooltipDelay: z.number().default(300),
});

export function apply(ctx, config) {
  console.log('[shinon-tooltip] Aktiviert:', config);

  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });

  return () => {};
}
