import z from '@deepseek-ai/schemastery';

/**
 * shinon-dashboard - Zentrales Konfigurations-Dashboard
 * Nutzt Schemastery für Schema-basierte Konfiguration
 */

// Keine Einstellungen: kein Code liest einen Wert dieser Ebene (der Client rendert fix).
// `enabled`, `defaultView` und `sidebarPosition` sind entfallen — drei Optionen, die Wirkung
// behauptet haben. packages/dashboard/cordis.patch.yml schreibt sie noch (ausserhalb dieses Slices).
export const Config = z.object({});

export function apply(ctx, config) {
  console.log('[shinon-dashboard] Aktiviert:', config);

  // >>> shinon:dsh-idiom settings-registration — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test)
  // Registriert die Einstellungs-Form dieses Pakets beim Settings-Dienst.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
  // <<< shinon:dsh-idiom settings-registration

  return () => {};
}
