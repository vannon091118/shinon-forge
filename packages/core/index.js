import z from '@deepseek-ai/schemastery';

/**
 * shinon-core - eigenes Design und Branding für Shinon Forge
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
  
  // >>> shinon:dsh-idiom settings-registration — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test)
  // Registriert die Einstellungs-Form dieses Pakets beim Settings-Dienst.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  // <<< shinon:dsh-idiom settings-registration
  
  // Cleanup
  return () => {
    console.log('[shinon-core] Deaktiviert');
  };
}
