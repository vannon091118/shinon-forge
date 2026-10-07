import z from '@deepseek-ai/schemastery';

/**
 * shinon-tooltip - Erweiterte Tooltips
 * Nutzt Schemastery für Konfiguration
 */

export const Config = z.object({
  showTooltips: z.boolean().default(true),
  tooltipDelay: z.number().default(300),
  tooltipPosition: z.union([z.const('top'), z.const('bottom'), z.const('left'), z.const('right')]).default('top'),
});

export function apply(ctx, config) {
  console.log('[shinon-tooltip] Aktiviert:', config);
  
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  
  return () => {};
}
