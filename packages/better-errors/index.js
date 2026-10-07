import z from '@deepseek-ai/schemastery';

export const Config = z.object({
  enabled: z.boolean().default(true),
  showStackTraces: z.boolean().default(false),
  locale: z.string().default('de'),
});

export function apply(ctx, config) {
  console.log('[shinon-better-errors] Aktiviert:', config);
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  return () => {};
}
