import KeryxPushModule from '../../modules/keryx-push';
import type { KeryxPushBridge, NativePushSupport } from './native-push';

export type { KeryxPushBridge, NativeEndpoint, NativePushSupport, NativeRegistration } from './native-push';

export const KeryxPush: KeryxPushBridge = {
  getSupport: () => KeryxPushModule.getSupport(),
  register: ({ vapid }) => KeryxPushModule.register(vapid),
  unregister: () => KeryxPushModule.unregister(),
  getEndpoint: () => KeryxPushModule.getEndpoint(),
  setTopics: async ({ topics }) => ({ topics: await KeryxPushModule.setTopics(topics) }),
  getTopics: async () => ({ topics: await KeryxPushModule.getTopics() }),
  setVerifyState: ({ state }) => KeryxPushModule.setVerifyState(JSON.stringify(state)),
  setRegistration: ({ registration }) =>
    KeryxPushModule.setRegistration(registration ? JSON.stringify(registration) : null),
  showNotification: ({ title, body, tag }) =>
    KeryxPushModule.showNotification(title, body, tag ?? 'keryx-wakeup'),
  requestNotificationPermission: async () => ({
    granted: await KeryxPushModule.requestNotificationPermission(),
  }),
  getNotificationPermission: async () => ({ granted: await KeryxPushModule.getNotificationPermission() }),
  drainMessages: async () => ({ messages: await KeryxPushModule.drainMessages() }),
  onPush(handler) {
    const subscription = KeryxPushModule.addListener('push', ({ payload }) => handler(payload));
    return () => subscription.remove();
  },
};

export function nativePushSupport(): Promise<NativePushSupport> {
  return KeryxPush.getSupport();
}
