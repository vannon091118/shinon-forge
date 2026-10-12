import z from '@deepseek-ai/schemastery';

// Die reine Regel (Faltung, Prozent, Form) liegt in assets/token-core.js: ohne bare
// Imports, damit ihre Unit-Tests auch ohne node_modules laufen (Konvention,
// packages/project-index + packages/codingmon). Hier re-exportiert, damit die
// oeffentlichen Namen des Pakets dieselben bleiben — und damit der
// Distributionstest die Datei im Tarball einfordert.
export * from './assets/token-core.js';

// Keine Einstellungen: der Client rendert unabhaengig von Werten dieser Ebene.
// `enabled`, `showInSidebar` und `showDetailed` sind entfallen. packages/token-usage/cordis.patch.yml
// schreibt sie noch (ausserhalb dieses Slices).
export const Config = z.object({});

export function apply(ctx, config) {
  console.log('[shinon-token-usage] Aktiviert:', config);
  // >>> shinon:dsh-idiom settings-registration — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test)
  // Registriert die Einstellungs-Form dieses Pakets beim Settings-Dienst.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  // <<< shinon:dsh-idiom settings-registration
  return () => {};
}
