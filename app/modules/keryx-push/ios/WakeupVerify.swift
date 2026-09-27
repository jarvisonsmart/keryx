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
          envelope.seq > topic.lastSeq,
          envelope.meetsThreshold(keys: topic.keys, threshold: topic.threshold)
    else { return nil }
    topic.lastSeq = envelope.seq
    topics[envelope.topic] = topic
    return Accepted(topic: envelope.topic, label: topic.label)
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
          Set(object.keys).isSubset(of: ["v", "t", "seq", "sig"]),
          jsonInteger(object["v"]) == 1,
          let topic = object["t"] as? String, !topic.isEmpty,
          let seq = jsonInteger(object["seq"]), (1...Self.maxSeq).contains(seq),
          let list = object["sig"] as? [Any], !list.isEmpty
    else { return nil }
    var sigs: [(keyid: String, sig: String)] = []
    for item in list {
      guard let entry = item as? [String: Any],
            Set(entry.keys).isSubset(of: ["keyid", "sig"]),
            let keyid = (entry["keyid"] ?? "") as? String,
            let sig = (entry["sig"] ?? "") as? String
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
