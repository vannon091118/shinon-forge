import z from '@deepseek-ai/schemastery';

/**
 * shinon-locale-de - Deutsche Sprachunterstützung
 * Nutzt die DSH Locale API für korrekte Sprachregistrierung
 */

// Keine Einstellungen: apply() registriert nichts, und der wirksame Wert steht hartcodiert im
// Client ('de' mit Fallback 'en'). `defaultLocale` und `fallbackLocale` sind entfallen.
// packages/locale-de/cordis.patch.yml schreibt sie noch (ausserhalb dieses Slices).
export const Config = z.object({});

export function apply(ctx, config) {
  console.log('[shinon-locale-de] Aktiviert mit Config:', config);

  // Register German language through locale plugin API
  // The actual registration happens in the client side
  return () => {
    console.log('[shinon-locale-de] Deaktiviert');
  };
}
