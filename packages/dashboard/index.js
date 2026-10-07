import z from '@deepseek-ai/schemastery';

/**
 * shinon-dashboard - Zentrales Konfigurations-Dashboard
 * Nutzt Schemastery für Schema-basierte Konfiguration
 */

export const Config = z.object({
  enabled: z.boolean().default(true),
  defaultView: z.union([z.const('overview'), z.const('config'), z.const('locale'), z.const('plugins')]).default('overview'),
  sidebarPosition: z.union([z.const('left'), z.const('right')]).default('left'),
});

export function apply(ctx, config) {
  console.log('[shinon-dashboard] Aktiviert:', config);
  
  // Register settings form for live editing
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  
  return () => {};
}
