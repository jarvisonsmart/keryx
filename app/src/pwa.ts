/**
 * PWA service worker (src/sw.ts, bundled by scripts/build-sw.mjs next to the
 * exported app). The app works without it too.
 *
 * The registration does the update handling a generated one would: revalidate
 * sw.js, activate a new worker immediately (skipWaiting in src/sw.ts), and
 * reload the page once so it runs the new precache instead of the old one.
 * Without this an installed PWA can serve a stale bundle for days.
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), {
          updateViaCache: 'none',
        });
        // reload once when a new worker takes control, but never on the first
        // install (there was no controller to replace)
        const hadController = !!navigator.serviceWorker.controller;
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController || reloading) return;
          reloading = true;
          window.location.reload();
        });
        // an installed PWA can stay open for days without a navigation, so
        // check for a new build whenever it returns to the foreground
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update();
        });
      } catch {
        // offline caching is a bonus — the app works without it
      }
    })();
  });
}
