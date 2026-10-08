import z from '@deepseek-ai/schemastery';

// Keine Einstellungen: der Client rendert unabhaengig von Werten dieser Ebene.
// `enabled`, `showInSidebar` und `showDetailed` sind entfallen. packages/token-usage/cordis.patch.yml
// schreibt sie noch (ausserhalb dieses Slices).
export const Config = z.object({});

export function apply(ctx, config) {
  console.log('[shinon-token-usage] Aktiviert:', config);
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  return () => {};
}
