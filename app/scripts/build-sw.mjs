/**
 * Build the PWA service worker (src/sw.ts) next to the exported web app:
 * esbuild bundles it with the same EXPO_PUBLIC_* settings Metro inlined into
 * the page, then Workbox injects the precache manifest of the whole dist/.
 */
import { build } from 'esbuild';
import { injectManifest } from 'workbox-build';

const define = { 'process.env.NODE_ENV': '"production"' };
for (const name of ['EXPO_PUBLIC_RELAY_URL', 'EXPO_PUBLIC_VAPID_PUBLIC', 'EXPO_PUBLIC_GIT_COMMIT']) {
  define[`process.env.${name}`] = JSON.stringify(process.env[name] ?? '');
}

await build({
  entryPoints: ['src/sw.ts'],
  outfile: 'dist/sw.js',
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  define,
});

const { count, size, warnings } = await injectManifest({
  swSrc: 'dist/sw.js',
  swDest: 'dist/sw.js',
  globDirectory: 'dist',
  globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest,ttf}'],
  globIgnores: ['sw.js'],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
});
for (const w of warnings) console.warn(w);
console.log(`sw.js: precaching ${count} files (${(size / 1024).toFixed(0)} KiB)`);
