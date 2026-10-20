/**
 * @shinon/seams — index.js (Host-Hälfte)
 *
 * Dieses Paket ist eine BIBLIOTHEK, kein Dienst: es mountet nichts, hört auf
 * nichts und schreibt nichts. Die Rolle ist trotzdem die einer Host-Hälfte —
 * sie ist der Ort, an dem Pakete den Kern importieren
 * (`import { digest } from '@shinon/seams/core'`), und `./core` ist der
 * Export, der die importfreie Datei `assets/seams.js` herausgibt.
 *
 * Warum dann überhaupt `Config` und `apply()`? Weil die Form eines Pakets in
 * diesem Repo EINE ist (`docs/ARCHITECTURE.md` §2): vier Rollendateien, Gate
 * und Build prüfen sie bei jedem Paket. Ein Paket ohne Hälften wäre eine
 * zweite Bauform, und die kostet mehr, als sie spart. `dsh.inactive: true` im
 * Manifest sagt zugleich, dass kein Profil dieses Bundle lädt.
 */
import z from '@deepseek-ai/schemastery';

// Die Naht-Namen und -Regeln liegen in `assets/seams.js` (importfrei).
export * from './assets/seams.js';

/** Keine Einstellungen: der Kern ist Code, keine Konfiguration. */
export const Config = z.object({});

/** Kein Effekt. Wer den Kern benutzt, importiert ihn direkt. */
export function apply(ctx, config) {
  console.log('[shinon-seams] Aktiviert (Bibliothekspaket, kein Dienst):', config);
  return () => {};
}
