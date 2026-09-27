import ExpoModulesCore
import FirebaseCore
import FirebaseMessaging
import UIKit
import UserNotifications

final class PushException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}

/// The iOS wake-up transport (design/notifications.md): FCM topics over APNs
/// (relay/SPECIFICATION.md §6.1). Shared by the module and the app delegate
/// subscriber, because silent pushes can arrive before JS (or without it).
final class KeryxPushCore {
  static let shared = KeryxPushCore()

  private enum Key {
    static let verifyState = "keryx_push.verifyState"
    static let registration = "keryx_push.registration"
    static let queue = "keryx_push.queue"
    static let topics = "keryx_push.topics"
  }

  private static let maxQueue = 8
  private let defaults = UserDefaults.standard
  private let lock = NSLock()
  private let topicQueue = DispatchQueue(label: "cz.v1b3coder.keryx.push.topics")
  private weak var listener: KeryxPushModule?
  private var active = false

  /// Firebase is usable only with the Firebase iOS app's plist; without it
  /// Firebase is never touched.
  let fcmAvailable: Bool = {
    guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else { return false }
    if FirebaseApp.app() == nil { FirebaseApp.configure() }
    return true
  }()

  // MARK: - JS listener

  func startListening(_ module: KeryxPushModule) {
    lock.withLock { listener = module }
  }

  func stopListening(_ module: KeryxPushModule) {
    lock.withLock { if listener === module { listener = nil } }
  }

  func setActive(_ value: Bool) {
    lock.withLock { active = value }
  }

  /// Background JS may be suspended even while its listener remains attached.
  @discardableResult
  private func emit(_ payload: String) -> Bool {
    guard let listener = lock.withLock({ active ? listener : nil }) else { return false }
    listener.sendEvent("push", ["payload": payload])
    return true
  }

  // MARK: - Wake-ups

  /// One wake-up (§4) or self-test (§4.3) payload. It is queued for the page
  /// whether verified or not, so a stale mirror delays a notice but never
  /// loses a wake-up; only an accepted one is acked and announced natively.
  /// `done` reports acceptance once the ack settled.
  func onMessage(_ payload: String, done: @escaping (Bool) -> Void) {
    let accepted = lock.withLock {
      var mirror = WakeupMirror(json: defaults.string(forKey: Key.verifyState))
      let accepted = mirror.verify(payload)
      if accepted != nil { defaults.set(mirror.json, forKey: Key.verifyState) }
      let queue = (defaults.stringArray(forKey: Key.queue) ?? []) + [payload]
      defaults.set(Array(queue.suffix(Self.maxQueue)), forKey: Key.queue)
      return accepted
    }
    guard let accepted else {
      emit(payload)
      return done(false)
    }
    if !emit(payload) {
      let body = accepted.label.isEmpty ? "New update available" : "New update in \(accepted.label)"
      // keyed by topic, so one channel's notice never replaces another's
      postNotification(title: "Keryx", body: body, tag: "keryx-\(accepted.topic)")
    }
    ackReceipt { done(true) }
  }

  func setVerifyState(_ json: String) {
    lock.withLock {
      var next = WakeupMirror(json: json)
      next.preserveSequences(from: WakeupMirror(json: defaults.string(forKey: Key.verifyState)))
      defaults.set(next.json, forKey: Key.verifyState)
    }
  }

  func setRegistration(_ json: String?) {
    defaults.set(json, forKey: Key.registration)
  }

  func drainMessages() -> [String] {
    lock.withLock {
      defer { defaults.removeObject(forKey: Key.queue) }
      return defaults.stringArray(forKey: Key.queue) ?? []
    }
  }

  private struct Registration: Decodable {
    let baseUrl: String
    let id: String
    let managementToken: String
  }

  /// The liveness/delivery ack (§5.3): one best-effort POST, no recovery. The
  /// iOS topic leg has no relay registration, so this is usually a no-op.
  private func ackReceipt(then done: @escaping () -> Void) {
    guard let json = defaults.string(forKey: Key.registration),
          let reg = try? JSONDecoder().decode(Registration.self, from: Data(json.utf8)),
          !reg.baseUrl.isEmpty, !reg.id.isEmpty, !reg.managementToken.isEmpty,
          let url = URL(string: "\(reg.baseUrl)/v1/registrations/\(reg.id)/heartbeat")
    else { return done() }
    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("Bearer \(reg.managementToken)", forHTTPHeaderField: "Authorization")
    URLSession.shared.dataTask(with: request) { _, _, _ in done() }.resume()
  }

  // MARK: - FCM topic leg

  func registerForRemoteNotifications() {
    guard fcmAvailable else { return }
    DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
  }

  func setAPNsToken(_ token: Data) {
    guard fcmAvailable else { return }
    Messaging.messaging().apnsToken = token
  }

  var subscribedTopics: [String] {
    get { defaults.stringArray(forKey: Key.topics) ?? [] }
    set { defaults.set(newValue, forKey: Key.topics) }
  }

  /// Subscribes the SDK to exactly `wanted`. The whole read-diff-apply-write
  /// cycle runs on one serial queue, and the applied set is persisted after
  /// every operation, so a failed cycle leaves it at what the SDK follows.
  func setTopics(_ wanted: Set<String>, done: @escaping (Result<[String], Error>) -> Void) {
    topicQueue.async { [self] in
      do {
        guard fcmAvailable else { throw PushException("FCM is not configured (no GoogleService-Info.plist)") }
        var applied = Set(subscribedTopics)
        let added = wanted.subtracting(applied)
        let removed = applied.subtracting(wanted)
        if !added.isEmpty || !removed.isEmpty { try awaitAPNsToken() }
        for topic in added {
          try waitFor { Messaging.messaging().subscribe(toTopic: topic, completion: $0) }
          applied.insert(topic)
          subscribedTopics = Array(applied)
        }
        for topic in removed {
          try waitFor { Messaging.messaging().unsubscribe(fromTopic: topic, completion: $0) }
          applied.remove(topic)
          subscribedTopics = Array(applied)
        }
        done(.success(Array(wanted)))
      } catch {
        done(.failure(error))
      }
    }
  }

  /// Topic operations fetch the FCM token, which fails until APNs gave its token.
  private func awaitAPNsToken(timeout: TimeInterval = 15) throws {
    let deadline = Date().addingTimeInterval(timeout)
    while Messaging.messaging().apnsToken == nil {
      guard Date() < deadline else { throw PushException("no APNs token: remote notifications are unavailable") }
      Thread.sleep(forTimeInterval: 0.25)
    }
  }

  /// Blocks the topic queue on one Firebase callback.
  private func waitFor(_ operation: (@escaping (Error?) -> Void) -> Void) throws {
    let finished = DispatchSemaphore(value: 0)
    var failure: Error?
    operation { error in
      failure = error
      finished.signal()
    }
    guard finished.wait(timeout: .now() + 30) == .success else {
      throw PushException("FCM did not answer within 30s")
    }
    if let failure { throw failure }
  }

  // MARK: - Notifications

  /// The generic native notice; it never carries content.
  func postNotification(title: String, body: String, tag: String, done: ((Error?) -> Void)? = nil) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    content.threadIdentifier = tag
    UNUserNotificationCenter.current()
      .add(UNNotificationRequest(identifier: tag, content: content, trigger: nil), withCompletionHandler: done)
  }

  func requestNotificationPermission() async throws -> Bool {
    let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    if granted { registerForRemoteNotifications() }
    return granted
  }

  func notificationPermission() async -> Bool {
    let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    return [.authorized, .provisional, .ephemeral].contains(status)
  }
}
