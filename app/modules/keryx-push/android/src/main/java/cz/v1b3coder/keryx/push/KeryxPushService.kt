package cz.v1b3coder.keryx.push

import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

/**
 * The app side of the UnifiedPush connector (relay/SPECIFICATION.md §6.3). The
 * connector handles the distributor protocol and RFC 8291 decryption; this
 * service receives plaintext §4 envelopes.
 */
class KeryxPushService : PushService() {
  override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
    val keys = endpoint.pubKeySet ?: return KeryxPushCore.settlePending("endpoint without keys")
    KeryxPushCore.onNewEndpoint(applicationContext, endpoint.url, keys.pubKey, keys.auth)
  }

  override fun onMessage(message: PushMessage, instance: String) {
    KeryxPushCore.onMessage(applicationContext, String(message.content, Charsets.UTF_8))
  }

  override fun onRegistrationFailed(reason: FailedReason, instance: String) {
    KeryxPushCore.settlePending("UnifiedPush registration failed: ${reason.name}")
  }

  override fun onUnregistered(instance: String) {
    KeryxPushCore.onUnregistered(applicationContext)
  }

  override fun onTempUnavailable(instance: String) {
    // the distributor is temporarily unreachable; polling remains the backstop
  }
}
