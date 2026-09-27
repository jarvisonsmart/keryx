import CryptoKit
import Foundation

/// The §4 envelope parse and verification against the mirror the JS layer
/// pushes from its TUF-verified state (relay/SPECIFICATION.md §4.1–4.2). The
/// semantics are relay/internal/wakeup/wakeup.go's `Parse` and `Verify`, which
/// the JS layer shares: a malicious relay cannot forge keys, only replay a
/// wake-up, and a replay is dropped by `seq`.
struct WakeupMirror {
  struct Accepted {
    let topic: String
    let label: String
  }

  private struct Topic {
    let keys: [String: Curve25519.Signing.PublicKey]
    let threshold: Int
    let label: String
    let expiresAt: Double
    var lastSeq: Int64
    let entry: [String: Any]
  }

  private var topics: [String: Topic] = [:]

  /// Invalid topic entries are skipped; a corrupt mirror verifies nothing.
  init(json: String?) {
    let root = json.flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [String: Any]
    for case let (topic, entry as [String: Any]) in root?["topics"] as? [String: Any] ?? [:] {
      topics[topic] = Self.parseTopic(entry)
    }
  }

  /// The mirror with every accepted `seq` advanced, for the caller to persist.
  var json: String {
    let entries = topics.mapValues { $0.entry.merging(["lastSeq": $0.lastSeq]) { $1 } }
    let data = try? JSONSerialization.data(withJSONObject: ["topics": entries])
    return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }

  /// Strict envelope, known topic, `seq` above the last accepted value, and
  /// the Ed25519 threshold. On acceptance the topic's `seq` advances.
  mutating func verify(_ payload: String) -> Accepted? {
    guard let envelope = Envelope(payload),
          var topic = topics[envelope.topic],
          Date().timeIntervalSince1970 * 1000 < topic.expiresAt,
          envelope.seq > topic.lastSeq,
          envelope.meetsThreshold(keys: topic.keys, threshold: topic.threshold)
    else { return nil }
    topic.lastSeq = envelope.seq
    topics[envelope.topic] = topic
    return Accepted(topic: envelope.topic, label: topic.label)
  }

  mutating func preserveSequences(from previous: WakeupMirror) {
    for (key, old) in previous.topics {
      if var current = topics[key] {
        current.lastSeq = max(current.lastSeq, old.lastSeq)
        topics[key] = current
      }
    }
  }

  private static func parseTopic(_ entry: [String: Any]) -> Topic? {
    guard let list = entry["keys"] as? [Any], !list.isEmpty else { return nil }
    var keys: [String: Curve25519.Signing.PublicKey] = [:]
    for item in list {
      guard let key = item as? [String: Any],
            let keyid = key["keyid"] as? String, !keyid.isEmpty,
            let raw = (key["pub"] as? String).flatMap(hexBytes),
            let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: raw)
      else { return nil }
      keys[keyid] = publicKey
    }
    return Topic(
      keys: keys,
      threshold: max(1, (entry["threshold"] as? NSNumber)?.intValue ?? 1),
      label: entry["label"] as? String ?? "",
      expiresAt: (entry["expiresAt"] as? NSNumber)?.doubleValue ?? 0,
      lastSeq: (entry["lastSeq"] as? NSNumber)?.int64Value ?? 0,
      entry: entry)
  }
}

private struct Envelope {
  static let domain = "keryx/wakeup/v1|"
  static let maxSeq: Int64 = 9_007_199_254_740_991

  let topic: String
  let seq: Int64
  let sigs: [(keyid: String, sig: String)]

  init?(_ payload: String) {
    guard let object = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any],
          uniqueJSONMembers(payload),
          Set(object.keys) == Set(["v", "t", "seq", "sig"]),
          jsonInteger(object["v"]) == 1,
          let topic = object["t"] as? String, topic.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
          let seq = jsonInteger(object["seq"]), (1...Self.maxSeq).contains(seq),
          let list = object["sig"] as? [Any], !list.isEmpty
    else { return nil }
    var sigs: [(keyid: String, sig: String)] = []
    for item in list {
      guard let entry = item as? [String: Any],
            Set(entry.keys) == Set(["keyid", "sig"]),
            let keyid = entry["keyid"] as? String,
            keyid.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
            let sig = entry["sig"] as? String,
            base64urlBytes(sig)?.count == 64
      else { return nil }
      sigs.append((keyid, sig))
    }
    (self.topic, self.seq, self.sigs) = (topic, seq, sigs)
  }

  /// Unknown keyids are ignored and a repeated keyid counts once; a known
  /// keyid's first signature must verify, or the whole envelope is rejected.
  func meetsThreshold(keys: [String: Curve25519.Signing.PublicKey], threshold: Int) -> Bool {
    // OLPC({v, t, seq}) sorts the keys; the topic is base64url, so nothing to escape
    let signed = Data((Self.domain + "{\"seq\":\(seq),\"t\":\"\(topic)\",\"v\":1}").utf8)
    var seen = Set<String>()
    var valid = 0
    for (keyid, sig) in sigs {
      guard let key = keys[keyid], seen.insert(keyid).inserted else { continue }
      guard let raw = base64urlBytes(sig), raw.count == 64, key.isValidSignature(raw, for: signed)
      else { return false }
      valid += 1
    }
    return valid >= threshold
  }
}

/// A JSON integer: Foundation parses `1.0`/`1e0` as doubles and `true` as a
/// boolean NSNumber, and §4 rejects both.
private func jsonInteger(_ value: Any?) -> Int64? {
  guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
        ["s", "i", "l", "q"].contains(String(cString: number.objCType))
  else { return nil }
  return number.int64Value
}

/// Canonical unpadded base64url only: the decoded bytes must re-encode to the input.
private func base64urlBytes(_ value: String) -> Data? {
  var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
  guard let data = Data(base64Encoded: base64) else { return nil }
  let canonical = data.base64EncodedString()
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
  return canonical == value ? data : nil
}

/// 64 hex chars → 32 bytes.
private func hexBytes(_ hex: String) -> Data? {
  func nibble(_ c: UInt8) -> UInt8? {
    switch c {
    case UInt8(ascii: "0")...UInt8(ascii: "9"): return c - UInt8(ascii: "0")
    case UInt8(ascii: "a")...UInt8(ascii: "f"): return c - UInt8(ascii: "a") + 10
    case UInt8(ascii: "A")...UInt8(ascii: "F"): return c - UInt8(ascii: "A") + 10
    default: return nil
    }
  }
  let chars = Array(hex.utf8)
  guard chars.count == 64 else { return nil }
  var out = Data(capacity: 32)
  for i in stride(from: 0, to: 64, by: 2) {
    guard let hi = nibble(chars[i]), let lo = nibble(chars[i + 1]) else { return nil }
    out.append(hi << 4 | lo)
  }
  return out
}

/// Foundation collapses duplicate members; check decoded names before using its object.
private func uniqueJSONMembers(_ json: String) -> Bool {
  let pattern = #""(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:]+"#
  guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
  let source = json as NSString
  let tokens = regex.matches(in: json, range: NSRange(location: 0, length: source.length))
    .map { source.substring(with: $0.range) }
  var index = 0
  func value(_ depth: Int) -> Bool {
    guard depth < 64, index < tokens.count else { return false }
    let token = tokens[index]
    index += 1
    if token == "{" {
      var names = Set<String>()
      if index < tokens.count && tokens[index] == "}" { index += 1; return true }
      while index < tokens.count {
        guard let name = (try? JSONSerialization.jsonObject(with: Data(tokens[index].utf8), options: .fragmentsAllowed)) as? String,
              names.insert(name).inserted else { return false }
        index += 1
        guard index < tokens.count, tokens[index] == ":" else { return false }
        index += 1
        if depth == 0 && (name == "v" || name == "seq") {
          guard index < tokens.count, tokens[index].range(of: "^[1-9][0-9]*$", options: .regularExpression) != nil else { return false }
        }
        guard value(depth + 1), index < tokens.count else { return false }
        let separator = tokens[index]
        index += 1
        if separator == "}" { return true }
        if separator != "," { return false }
      }
      return false
    }
    if token == "[" {
      if index < tokens.count && tokens[index] == "]" { index += 1; return true }
      while value(depth + 1) && index < tokens.count {
        let separator = tokens[index]
        index += 1
        if separator == "]" { return true }
        if separator != "," { return false }
      }
      return false
    }
    return true
  }
  return value(0) && index == tokens.count
}
