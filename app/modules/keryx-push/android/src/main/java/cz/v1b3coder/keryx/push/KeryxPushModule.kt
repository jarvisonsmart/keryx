package cz.v1b3coder.keryx.push

import android.Manifest
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.unifiedpush.android.connector.UnifiedPush

/**
 * The JS face of the wake-up transport (modules/keryx-push/src). The FCM topic
 * leg is registry-free and anonymous: the relay never learns the device's FCM
 * token, so `setTopics` is that leg's whole registration.
 */
class KeryxPushModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KeryxPush")

    Events("push")

    OnCreate {
      KeryxPushCore.foreground = (appContext.currentActivity as? LifecycleOwner)
        ?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true
    }

    OnActivityEntersForeground { KeryxPushCore.foreground = true }

    OnActivityEntersBackground { KeryxPushCore.foreground = false }

    Constant("isDebug") {
      (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    OnStartObserving("push") {
      KeryxPushCore.listener = { payload -> sendEvent("push", mapOf("payload" to payload)) }
    }

    OnStopObserving("push") {
      KeryxPushCore.listener = null
    }

    OnDestroy {
      KeryxPushCore.listener = null
      KeryxPushCore.foreground = false
    }

    AsyncFunction("getSupport") {
      val distributors = UnifiedPush.getDistributors(context)
      mapOf(
        "fcm" to (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS),
        "unifiedPush" to mapOf("available" to distributors.isNotEmpty(), "distributors" to distributors),
      )
    }

    AsyncFunction("register") { vapid: String, promise: Promise ->
      val ctx = context
      if (KeryxPushCore.prefs(ctx).getString("endpoint", null) != null) {
        // the endpoint is stable across restarts: resolve now and refresh the
        // distributor registration (UnifiedPush: register on every start)
        promise.resolve(KeryxPushCore.endpoint(ctx))
        registerWithDistributor(ctx, vapid)
        return@AsyncFunction
      }
      KeryxPushCore.addPendingRegistration(object : KeryxPushCore.RegistrationCallback {
        override fun done(error: String?) {
          if (error == null) promise.resolve(KeryxPushCore.endpoint(ctx))
          else promise.reject(CodedException("ERR_UNIFIEDPUSH", error, null))
        }
      })
      val activity = appContext.currentActivity
        ?: return@AsyncFunction KeryxPushCore.settlePending("no activity to pick a distributor")
      activity.runOnUiThread {
        UnifiedPush.tryUseCurrentOrDefaultDistributor(activity) { success ->
          if (success) registerWithDistributor(ctx, vapid)
          else KeryxPushCore.settlePending("no UnifiedPush distributor")
        }
      }
    }

    AsyncFunction("unregister") {
      UnifiedPush.unregister(context, KeryxPushCore.INSTANCE)
    }

    AsyncFunction("getEndpoint") {
      KeryxPushCore.endpoint(context)
    }

    AsyncFunction("setVerifyState") { state: String ->
      KeryxPushCore.setVerifyState(context, state)
    }

    AsyncFunction("setRegistration") { registration: String? ->
      KeryxPushCore.setRegistration(context, registration)
    }

    AsyncFunction("setTopics") { topics: List<String>, promise: Promise ->
      val ctx = context
      val wanted = topics.filter { it.isNotEmpty() }.toSet()
      KeryxPushCore.io.execute {
        // The diff is computed inside the executor, which serializes the whole
        // read-diff-apply-write cycle, and the applied set is persisted after
        // every operation, so a failed cycle leaves the mirror at what the SDK
        // really follows.
        val applied = KeryxPushCore.subscribedTopics(ctx)
        try {
          val messaging = FirebaseMessaging.getInstance()
          for (topic in KeryxTopics.added(applied, wanted)) {
            Tasks.await(messaging.subscribeToTopic(topic))
            applied.add(topic)
            KeryxPushCore.putSubscribedTopics(ctx, applied)
          }
          for (topic in KeryxTopics.removed(applied, wanted)) {
            Tasks.await(messaging.unsubscribeFromTopic(topic))
            applied.remove(topic)
            KeryxPushCore.putSubscribedTopics(ctx, applied)
          }
          promise.resolve(wanted.toList())
        } catch (e: Exception) {
          promise.reject(CodedException("ERR_FCM_TOPICS", "FCM topic subscription failed: ${e.message}", e))
        }
      }
    }

    AsyncFunction("getTopics") {
      KeryxPushCore.subscribedTopics(context).toList()
    }

    AsyncFunction("showNotification") { title: String, body: String, tag: String ->
      KeryxPushCore.postNotification(context, title, body, tag)
    }

    AsyncFunction("getNotificationPermission") {
      notificationsGranted()
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      val permissions = appContext.permissions
      if (Build.VERSION.SDK_INT < 33 || permissions == null) {
        promise.resolve(notificationsGranted())
        return@AsyncFunction
      }
      permissions.askForPermissions({ result ->
        promise.resolve(result[Manifest.permission.POST_NOTIFICATIONS]?.status == PermissionsStatus.GRANTED)
      }, Manifest.permission.POST_NOTIFICATIONS)
    }

    AsyncFunction("drainMessages") {
      KeryxPushCore.drainQueue(context)
    }
  }

  private fun notificationsGranted(): Boolean =
    Build.VERSION.SDK_INT < 33 ||
      appContext.permissions?.hasGrantedPermissions(Manifest.permission.POST_NOTIFICATIONS) == true

  private fun registerWithDistributor(context: Context, vapid: String) {
    try {
      UnifiedPush.register(context, KeryxPushCore.INSTANCE, "Keryx notifications", vapid)
    } catch (e: Exception) {
      KeryxPushCore.settlePending("UnifiedPush registration failed: ${e.message}")
    }
  }
}
