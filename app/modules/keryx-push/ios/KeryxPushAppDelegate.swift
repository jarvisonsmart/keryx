import ExpoModulesCore
import UserNotifications

/// The app-delegate side of the FCM topic leg (relay/SPECIFICATION.md §6.1).
/// Firebase swizzling is off (FirebaseAppDelegateProxyEnabled), so the APNs
/// token and the silent pushes are forwarded here. The relay publishes one
/// data-only message per wake-up: `wakeup` carries the §4 envelope and `test`
/// the §4.3 self-test payload; both take the same verify-queue-notice path.
public final class KeryxPushAppDelegate: ExpoAppDelegateSubscriber, UNUserNotificationCenterDelegate {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    KeryxPushCore.shared.registerForRemoteNotifications()
    return true
  }

  public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    KeryxPushCore.shared.setAPNsToken(deviceToken)
  }

  public func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    guard let payload = (userInfo["wakeup"] ?? userInfo["test"]) as? String else {
      return completionHandler(.noData)
    }
    KeryxPushCore.shared.onMessage(payload) { accepted in
      completionHandler(accepted ? .newData : .noData)
    }
  }

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }
}
