// Minimal client hook for the mobile profile. User zoom stays enabled for accessibility.
window.__ModuleLoader__.load({
  id: '@shinon/mobile',
  factory() {
    return {
      inject: [],
      apply() {
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
          viewport = document.createElement('meta');
          viewport.name = 'viewport';
          document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        document.documentElement.dataset.shinonMobile = 'true';
      },
    };
  },
});
