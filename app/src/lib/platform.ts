/**
 * The runtime platform. This file is the web (and test) build; Metro picks
 * platform.native.ts for the iOS/Android apps.
 */
export type AppPlatform = 'web' | 'ios' | 'android';

export function appPlatform(): AppPlatform {
  return 'web';
}

/** The native app's debuggable flag; null on the web. */
export function nativeDebugBuild(): boolean | null {
  return null;
}

/** Open a URL outside the app. */
export async function openExternal(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener,noreferrer');
}
