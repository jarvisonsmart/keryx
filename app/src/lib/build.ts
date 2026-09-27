/**
 * Build-type signal for the local-dev HTTP exception.
 *
 * The Keryx protocol is HTTPS-only; plain HTTP is a dev/debug convenience
 * (the local demo is served over HTTP on a private network, see
 * spec/core.md §3). Release builds — the store/CI app binaries and the built
 * PWA — must never accept it.
 *
 * Web: a non-production bundle (the dev server) is a dev build. Native: the
 * app's own debuggable flag (platform.native.ts).
 */
import { nativeDebugBuild } from './platform';

let debugBuild: boolean | null = null;

/** Test hook. */
export function setDebugBuild(value: boolean | null): void {
  debugBuild = value;
}

export function isDebugBuild(): boolean {
  if (debugBuild !== null) return debugBuild;
  return nativeDebugBuild() ?? process.env.NODE_ENV !== 'production';
}

/**
 * The build's short git commit, injected by CI as EXPO_PUBLIC_GIT_COMMIT (see
 * .github/workflows/deploy-pages.yml and build-apk.yml). A local build
 * without it reports 'dev'. Shown in the app so a running install can be
 * told apart from a stale one.
 */
export function appVersion(): string {
  const commit = process.env.EXPO_PUBLIC_GIT_COMMIT;
  return commit ? commit.slice(0, 7) : 'dev';
}
