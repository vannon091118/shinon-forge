/**
 * shinon-locale-de - Deutsche Sprachunterstützung (Client half)
 * Registriert de-DE Sprache und Namespace-Dictionary über DSH Locale API
 */
window.__ModuleLoader__.load({
  id: '@shinon/locale-de',
  factory() {
    return {
      inject: ['locale'],
      apply(ctx) {
        // Sichtbarkeit: diese Client-Haelfte meldet sich in der gemeinsamen Liste von @shinon/dashboard an (Konvention, kein Import) — kein Hintergrundprozess ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set('@shinon/locale-de', { label: 'Locale DE', kind: 'client', panel: null });
        // Hinweis: dieses Label ist ein interner Eintrag in der Plugin-Übersicht, kein Endnutzer-Titel.
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: '@shinon/locale-de' } }));

        // Register German language pack
        ctx.locale.addLanguage({
          id: 'de',
          label: 'Deutsch',
          fallback: 'en',
        });
        
        // Wörterbuch des 'shinon'-Namespace. Jeder Schlüssel hat genau einen
        // Leser (Menü-Label je Bundle, Fallback-Text der Token-Anzeige);
        // leserlose Schlüssel werden hier nicht gesammelt.
        //
        // EINE Tabelle für BEIDE Sprachslots (Entscheidung E6, 2026-10-11): die
        // Schlüssel dieses Namensraums sind Eigennamen der Oberfläche (Panel-Titel,
        // ein Platzhalter), es gibt keine zweite, englische Formulierung. Vorher
        // standen zwei wortgleiche Hälften hier — die behaupteten eine Übersetzung,
        // die es nicht gab, und ein Sprachenwechsel zeigte keine Wirkung. Wer einen
        // Text wirklich übersetzen will, gibt ihn als eigenen Eintrag je Sprache an.
        const TEXTS = {
          'token.fallback': 'Token: --',
          'menu.dashboard': 'Shinon Dashboard',
          'menu.markers': 'Shinon Marker',
          'menu.codingmon': 'Codingmon',
          'menu.popup': 'Shinon Popup',
        };
        ctx.locale.register('shinon', { en: TEXTS, de: TEXTS });
        
        console.log('[shinon-locale-de] Deutsch registriert');
      }
    };
  }
});
