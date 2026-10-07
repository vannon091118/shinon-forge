import z from '@deepseek-ai/schemastery';

export const Config = z.object({
  enabled: z.boolean().default(true),
  showInSidebar: z.boolean().default(true),
  showDetailed: z.boolean().default(false),
});

export function apply(ctx, config) {
  console.log('[shinon-token-usage] Aktiviert:', config);
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  return () => {};
}
