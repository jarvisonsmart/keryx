package cz.v1b3coder.keryx.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * The app side of the FCM topic leg (relay/SPECIFICATION.md §6.1): `wakeup`
 * carries the §4 envelope, `test` the §4.3 self-test payload. Both take the
 * same path as the UnifiedPush connector.
 */
class KeryxFcmService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val payload = message.data["wakeup"] ?: message.data["test"] ?: return
    KeryxPushCore.onMessage(applicationContext, payload)
  }
}
