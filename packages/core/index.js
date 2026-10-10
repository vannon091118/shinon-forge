import z from '@deepseek-ai/schemastery';

/**
 * shinon-core - Custom Design & Branding for DeepSeek Harness
 * Uses proper Schemastery Schema with volatile() for live settings
 */

export const Config = z.object({
  brandName: z.string().description('Markenname').default('Shinon Forge'),
  primaryColor: z.string().description('Primärfarbe').default('var(--dsw-alias-brand-primary)'),
  sidebarCompact: z.boolean().description('Kompakte Sidebar').default(false),
  showInfoBanner: z.boolean().description('Infobanner anzeigen').default(true).volatile(),
});

export function apply(ctx, config) {
  console.log('[shinon-core] Aktiviert mit Config:', config);
  
  // Register settings form for live editing
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  
  // Cleanup
  return () => {
    console.log('[shinon-core] Deaktiviert');
  };
}
