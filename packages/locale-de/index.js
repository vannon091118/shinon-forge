import z from '@deepseek-ai/schemastery';

/**
 * shinon-locale-de - Deutsche Sprachunterstützung
 * Nutzt die DSH Locale API für korrekte Sprachregistrierung
 */

export const Config = z.object({
  defaultLocale: z.string().default('de'),
  fallbackLocale: z.string().default('en'),
});

export function apply(ctx, config) {
  console.log('[shinon-locale-de] Aktiviert mit Config:', config);
  
  // Register German language through locale plugin API
  // The actual registration happens in the client side
  return () => {
    console.log('[shinon-locale-de] Deaktiviert');
  };
}
