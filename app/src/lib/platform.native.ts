import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import KeryxPush from '../../modules/keryx-push';
import type { AppPlatform } from './platform';

export function appPlatform(): AppPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export function nativeDebugBuild(): boolean | null {
  return KeryxPush.isDebug;
}

export async function openExternal(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
