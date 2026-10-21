import z from '@deepseek-ai/schemastery';

/**
 * @shinon/widget-dock — die leisen Anzeigen als Widgets statt als Panels.
 *
 * WARUM: die Seitenleiste trug acht Panel-Knöpfe (Plugins, Automation, Dashboard,
 * Codingmon, Marker, Prompter, Persona, Popup). Auf einem 736-px-Fenster fiel
 * darunter die Workspace-Liste heraus — gemessen 2026-10-22 am laufenden Host.
 * Die Ursache ist keine zu kleine Leiste, sondern zu viele gleich laute Flächen:
 * jedes Werkzeug wollte ein eigenes Gehäuse, wie ein Werkzeugkasten, in dem jeder
 * Schraubendreher eine Schublade hat.
 *
 * DIESES PAKET IST NUR DIE ANZEIGE: es liest die Zustands-Globals der anderen
 * Hälften (`__shinonPersonaReview`, `__shinonPrompterTrace`, `__shinonPlugins`),
 * die im Kanon stehen, und rendert daraus kompakte Zeilen. Es schreibt nichts,
 * öffnet nichts und kennt keinen eigenen Zustand — die Panels bleiben, wo sie
 * sind, nur nicht mehr als Knopf.
 */
export const Config = z.object({});

export function apply(ctx, config) {
  console.log('[shinon-widget-dock] Aktiviert — reine Anzeige der Zustands-Globals:', config);
  return () => {};
}
