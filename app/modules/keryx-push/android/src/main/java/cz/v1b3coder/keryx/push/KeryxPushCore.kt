package cz.v1b3coder.keryx.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The process-wide side of the wake-up transport (design/notifications.md),
 * shared by the JS module and the two receiving services: the persisted
 * verification mirror, the payload queue for the page, the relay ack and the
 * generic notice. It works with no JS runtime at all, so a wake-up that lands
 * while the app is killed is still verified and announced.
 */
object KeryxPushCore {
  const val INSTANCE = "default"
  private const val PREFS = "keryx_push"
  private const val CHANNEL_ID = "keryx-wakeup"
  private const val MAX_QUEUE = 8
  private const val ENDPOINT_KEY = "endpoint"
  private const val P256DH_KEY = "p256dh"
  private const val AUTH_KEY = "auth"
  private const val VERIFY_KEY = "verifyState"
  private const val REGISTRATION_KEY = "registration"
  private const val QUEUE_KEY = "queue"
  private const val TOPICS_KEY = "topics"

  val io: ExecutorService = Executors.newSingleThreadExecutor()
  private val lock = Any()

  /** Delivers a payload to JS; null while no JS listener is attached. */
  @Volatile
  var listener: ((String) -> Unit)? = null

  /** Settles the in-flight distributor registration (null error = success). */
  interface RegistrationCallback {
    fun done(error: String?)
  }

  private val pendingRegistrations = mutableListOf<RegistrationCallback>()

  fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // --- the connector registration (§5.3, §6.3) --------------------------------

  fun endpoint(context: Context): Map<String, String?> {
    val p = prefs(context)
    return mapOf(
      "endpoint" to p.getString(ENDPOINT_KEY, null),
      "p256dh" to p.getString(P256DH_KEY, null),
      "auth" to p.getString(AUTH_KEY, null),
    )
  }

  fun addPendingRegistration(callback: RegistrationCallback) {
    synchronized(lock) { pendingRegistrations.add(callback) }
  }

  fun settlePending(error: String?) {
    val pending = synchronized(lock) {
      pendingRegistrations.toList().also { pendingRegistrations.clear() }
    }
    pending.forEach { it.done(error) }
  }

  fun onNewEndpoint(context: Context, url: String, p256dh: String, auth: String) {
    prefs(context).edit()
      .putString(ENDPOINT_KEY, url)
      .putString(P256DH_KEY, p256dh)
      .putString(AUTH_KEY, auth)
      .apply()
    settlePending(null)
  }

  fun onUnregistered(context: Context) {
    prefs(context).edit().remove(ENDPOINT_KEY).remove(P256DH_KEY).remove(AUTH_KEY).apply()
  }

  // --- the verification mirror and the ack credentials ------------------------

  fun setVerifyState(context: Context, json: String) {
    synchronized(lock) {
      val next = JSONObject(json)
      val previous = runCatching { JSONObject(prefs(context).getString(VERIFY_KEY, "{}")!!).optJSONObject("topics") }.getOrNull()
      val topics = next.optJSONObject("topics")
      topics?.keys()?.forEach { topic ->
        val entry = topics.getJSONObject(topic)
        entry.put("lastSeq", maxOf(entry.optLong("lastSeq"), previous?.optJSONObject(topic)?.optLong("lastSeq") ?: 0))
      }
      prefs(context).edit().putString(VERIFY_KEY, next.toString()).apply()
    }
  }

  fun setRegistration(context: Context, json: String?) {
    val editor = prefs(context).edit()
    if (json == null) editor.remove(REGISTRATION_KEY) else editor.putString(REGISTRATION_KEY, json)
    editor.apply()
  }

  // --- the FCM topic set (§6.1) ------------------------------------------------

  fun subscribedTopics(context: Context): MutableSet<String> =
    prefs(context).getString(TOPICS_KEY, "")!!.split("\n").filter { it.isNotEmpty() }.toMutableSet()

  fun putSubscribedTopics(context: Context, topics: Set<String>) {
    prefs(context).edit().putString(TOPICS_KEY, topics.joinToString("\n")).apply()
  }

  // --- wake-ups ----------------------------------------------------------------

  /**
   * One wake-up from either leg. No TUF metadata or content work: the envelope
   * is verified against the mirrored state, queued for the page (verified or
   * not, so a stale mirror costs a delayed notice, never a lost wake-up), and —
   * when accepted — acked once and announced natively unless JS is listening
   * (then the page owns verification, recovery and sync).
   */
  fun onMessage(context: Context, payload: String) {
    val state = synchronized(lock) {
      val verify = WakeupVerify()
      try {
        verify.setState(JSONObject(prefs(context).getString(VERIFY_KEY, "{}")!!))
      } catch (_: Exception) {
        // a corrupt mirror verifies nothing: the wake-up is queued for the page
      }
      val accepted = verify.verify(payload)
      if (accepted != null) setVerifyState(context, verify.toJson().toString())
      accepted
    }
    enqueue(context, payload)
    val deliver = listener
    if (state == null) {
      // queued for the page; never acked or announced natively
      deliver?.invoke(payload)
      return
    }
    ackReceipt(context)
    if (deliver != null) {
      deliver(payload)
      return
    }
    // the locally verified channel label names the notice; the tag keys it
    // off the wake-up's own topic
    val body = if (state.label.isEmpty()) "New update available" else "New update in ${state.label}"
    val tag = if (state.topic.isEmpty()) "keryx-wakeup" else "keryx-${state.topic}"
    postNotification(context, "Keryx", body, tag)
  }

  fun drainQueue(context: Context): List<String> = synchronized(lock) {
    val queue = loadQueue(context)
    prefs(context).edit().remove(QUEUE_KEY).apply()
    (0 until queue.length()).mapNotNull { queue.optString(it, null) }
  }

  private fun enqueue(context: Context, payload: String) {
    synchronized(lock) {
      val queue = loadQueue(context)
      queue.put(payload)
      while (queue.length() > MAX_QUEUE) queue.remove(0)
      prefs(context).edit().putString(QUEUE_KEY, queue.toString()).apply()
    }
  }

  private fun loadQueue(context: Context): JSONArray =
    try {
      JSONArray(prefs(context).getString(QUEUE_KEY, "[]"))
    } catch (_: Exception) {
      JSONArray()
    }

  /**
   * The liveness/delivery ack (§5.3: "Sent by the service worker on wake-up
   * receipt"): one POST, no recovery — the page's foreground check owns it.
   */
  private fun ackReceipt(context: Context) {
    val reg = try {
      JSONObject(prefs(context).getString(REGISTRATION_KEY, null) ?: return)
    } catch (_: Exception) {
      return
    }
    val baseUrl = reg.optString("baseUrl")
    val id = reg.optString("id")
    val token = reg.optString("managementToken")
    if (baseUrl.isEmpty() || id.isEmpty() || token.isEmpty()) return
    io.execute {
      var conn: HttpURLConnection? = null
      try {
        conn = URL("$baseUrl/v1/registrations/$id/heartbeat").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.responseCode
      } catch (_: Exception) {
        // best-effort: the page's foreground check recovers a gone registration
      } finally {
        conn?.disconnect()
      }
    }
  }

  /** The generic native notice; it never carries content. */
  fun postNotification(context: Context, title: String, body: String, tag: String) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (Build.VERSION.SDK_INT >= 26) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Keryx updates", NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().setPackage(context.packageName)
    launch.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
    val pi = PendingIntent.getActivity(
      context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(context)
    builder.setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(pi)
    nm.notify(tag, 1, builder.build())
  }
}
