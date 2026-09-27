/**
 * The native wake-up transport bridge (modules/keryx-push). This file is the
 * web (and test) build: the web has no native side, its leg is the service
 * worker's PushManager. Metro picks native-push.native.ts for the apps.
 */
export interface NativePushSupport {
  /** FCM is usable: Google services (Android) or a configured Firebase app (iOS). */
  fcm: boolean;
  /** Installed UnifiedPush distributors (Android; ntfy today). */
  unifiedPush: { available: boolean; distributors: string[] };
}

export interface NativeEndpoint {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface NativeRegistration {
  baseUrl: string;
  id: string;
  managementToken: string;
}

export interface KeryxPushBridge {
  getSupport(): Promise<NativePushSupport>;
  register(options: { vapid: string }): Promise<NativeEndpoint>;
  unregister(): Promise<void>;
  getEndpoint(): Promise<{ endpoint: string | null; p256dh: string | null; auth: string | null }>;
  setTopics(options: { topics: string[] }): Promise<{ topics: string[] }>;
  getTopics(): Promise<{ topics: string[] }>;
  setVerifyState(options: { state: { topics: unknown } }): Promise<void>;
  setRegistration(options: { registration: NativeRegistration | null }): Promise<void>;
  showNotification(options: { title: string; body: string; tag?: string }): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  getNotificationPermission(): Promise<{ granted: boolean }>;
  drainMessages(): Promise<{ messages: string[] }>;
  /** listen for payloads; returns the unsubscribe function */
  onPush(handler: (payload: string) => void): () => void;
}

function unavailable(): never {
  throw new Error('no native push transport on the web');
}

export const KeryxPush: KeryxPushBridge = {
  getSupport: async () => unavailable(),
  register: async () => unavailable(),
  unregister: async () => unavailable(),
  getEndpoint: async () => unavailable(),
  setTopics: async () => unavailable(),
  getTopics: async () => unavailable(),
  setVerifyState: async () => unavailable(),
  setRegistration: async () => unavailable(),
  showNotification: async () => unavailable(),
  requestNotificationPermission: async () => unavailable(),
  getNotificationPermission: async () => unavailable(),
  drainMessages: async () => unavailable(),
  onPush: () => unavailable(),
};

/** Ask the native side which wake-up transports this device can use. */
export function nativePushSupport(): Promise<NativePushSupport> {
  return KeryxPush.getSupport();
}
