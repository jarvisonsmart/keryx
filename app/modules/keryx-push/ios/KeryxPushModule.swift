import ExpoModulesCore
import UIKit

/// The native wake-up transport for the JS layer (src/KeryxPushModule.ts).
/// iOS has no UnifiedPush: wake-ups ride FCM topics over APNs only.
public class KeryxPushModule: Module {
  private static let isDebug: Bool = {
    #if DEBUG
    return true
    #else
    return false
    #endif
  }()

  public func definition() -> ModuleDefinition {
    let core = KeryxPushCore.shared

    Name("KeryxPush")

    Events("push")

    OnCreate {
      DispatchQueue.main.async { core.setActive(UIApplication.shared.applicationState == .active) }
    }

    OnAppBecomesActive { core.setActive(true) }

    OnAppEntersBackground { core.setActive(false) }

    Constant("isDebug") { Self.isDebug }

    OnStartObserving("push") { core.startListening(self) }

    OnStopObserving("push") { core.stopListening(self) }

    OnDestroy {
      core.stopListening(self)
      core.setActive(false)
    }

    AsyncFunction("getSupport") { () -> [String: Any] in
      ["fcm": core.fcmAvailable, "unifiedPush": ["available": false, "distributors": [String]()]]
    }

    AsyncFunction("register") { (_: String) throws in
      throw PushException("UnifiedPush is not available on iOS")
    }

    AsyncFunction("unregister") {}

    AsyncFunction("getEndpoint") { () -> [String: Any?] in
      ["endpoint": nil, "p256dh": nil, "auth": nil]
    }

    AsyncFunction("setTopics") { (topics: [String], promise: Promise) in
      core.setTopics(Set(topics.filter { !$0.isEmpty })) { result in
        switch result {
        case .success(let applied): promise.resolve(applied)
        case .failure(let error): promise.reject(error)
        }
      }
    }

    AsyncFunction("getTopics") { core.subscribedTopics }

    AsyncFunction("setVerifyState") { (stateJson: String) in core.setVerifyState(stateJson) }

    AsyncFunction("setRegistration") { (registrationJson: String?) in core.setRegistration(registrationJson) }

    AsyncFunction("showNotification") { (title: String, body: String, tag: String, promise: Promise) in
      core.postNotification(title: title, body: body, tag: tag) { error in
        if let error { promise.reject(error) } else { promise.resolve() }
      }
    }

    AsyncFunction("requestNotificationPermission") { () async throws -> Bool in
      try await core.requestNotificationPermission()
    }

    AsyncFunction("getNotificationPermission") { () async -> Bool in
      await core.notificationPermission()
    }

    AsyncFunction("drainMessages") { core.drainMessages() }
  }
}
