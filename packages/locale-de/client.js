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
        // Register German language pack
        ctx.locale.addLanguage({
          id: 'de',
          label: 'Deutsch',
          fallback: 'en',
        });
        
        // Register German dictionary namespace
        ctx.locale.register('shinon', {
          en: {
            'brand.title': 'Shinon Forge',
            'brand.tagline': 'Custom DeepSeek Harness',
            'settings.brandName': 'Brand Name',
            'settings.primaryColor': 'Primary Color',
            'settings.sidebarCompact': 'Compact Sidebar',
            'banner.active': 'Shinon Forge aktiv - Konfiguration über Dashboard',
          },
          de: {
            'brand.title': 'Shinon Forge',
            'brand.tagline': 'Angepasstes DeepSeek Harness',
            'settings.brandName': 'Markenname',
            'settings.primaryColor': 'Primärfarbe',
            'settings.sidebarCompact': 'Kompakte Sidebar',
            'banner.active': 'Shinon Forge aktiv - Konfiguration über Dashboard',
          },
        });
        
        console.log('[shinon-locale-de] Deutsch registriert');
      }
    };
  }
});
