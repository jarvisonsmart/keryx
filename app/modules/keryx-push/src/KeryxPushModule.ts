/**
 * The native wake-up transport (design/notifications.md). One contract for
 * Android (FCM topics + the UnifiedPush connector) and iOS (FCM topics over
 * APNs). Every native side verifies §4 envelopes against the mirror the JS
 * layer pushes (`setVerifyState`), queues them for the page, and shows the
 * generic notice itself when no JS listener is attached.
 */
import { NativeModule, requireNativeModule } from 'expo';

export interface NativePushSupport {
  /** FCM is usable: Google Play services (Android) or a configured Firebase app (iOS). */
  fcm: boolean;
  /** Installed UnifiedPush distributors (Android only; ntfy today). */
  unifiedPush: { available: boolean; distributors: string[] };
}

export interface NativeEndpoint {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type KeryxPushEvents = {
  /** one raw §4 envelope or §4.3 self-test payload, verified or not */
  push: (event: { payload: string }) => void;
};

declare class KeryxPushModule extends NativeModule<KeryxPushEvents> {
  /** the app is a debuggable build (the local-dev HTTP exception) */
  readonly isDebug: boolean;
  getSupport(): Promise<NativePushSupport>;
  /** register with the UnifiedPush distributor (Android); resolves the endpoint */
  register(vapid: string): Promise<NativeEndpoint>;
  unregister(): Promise<void>;
  getEndpoint(): Promise<{ endpoint: string | null; p256dh: string | null; auth: string | null }>;
  /** subscribe the FCM SDK to exactly this topic set; resolves the applied set */
  setTopics(topics: string[]): Promise<string[]>;
  getTopics(): Promise<string[]>;
  /** the verification mirror as JSON: `{ topics: { [topic]: { keys, threshold, lastSeq, label } } }` */
  setVerifyState(stateJson: string): Promise<void>;
  /** the ack credentials as JSON `{ baseUrl, id, managementToken }`, or null to clear */
  setRegistration(registrationJson: string | null): Promise<void>;
  showNotification(title: string, body: string, tag: string): Promise<void>;
  requestNotificationPermission(): Promise<boolean>;
  getNotificationPermission(): Promise<boolean>;
  /** take every queued payload (oldest first) and clear the queue */
  drainMessages(): Promise<string[]>;
}

export default requireNativeModule<KeryxPushModule>('KeryxPush');
