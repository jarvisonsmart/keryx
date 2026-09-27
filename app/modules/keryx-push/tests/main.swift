import Foundation

let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
let topic = fixture["topic"] as! String
let state: [String: Any] = ["topics": [topic: ["keys": fixture["keys"]!, "threshold": fixture["threshold"]!, "lastSeq": 0, "expiresAt": 4070908800000, "label": "Security alerts"]]]
let mirror = String(data: try JSONSerialization.data(withJSONObject: state), encoding: .utf8)!
let wakeup = fixture["wakeup"] as! [String: Any]
let payload = String(data: try JSONSerialization.data(withJSONObject: wakeup, options: .sortedKeys), encoding: .utf8)!
var failures = 0
func check(_ name: String, _ json: String, accepted: Bool) {
  var gate = WakeupMirror(json: mirror)
  let result = gate.verify(json) != nil
  print("\(result == accepted ? "PASS" : "FAIL") \(name)")
  if result != accepted { failures += 1 }
}
check("Go-signed envelope", payload, accepted: true)
check("duplicate version", payload.replacingOccurrences(of: "\"v\":1", with: "\"v\":1,\"v\":1"), accepted: false)
check("escaped duplicate version", payload.replacingOccurrences(of: "\"v\":1", with: "\"v\":1,\"\\u0076\":1"), accepted: false)
check("fractional version encoding", payload.replacingOccurrences(of: "\"v\":1", with: "\"v\":1.0"), accepted: false)
check("unknown field", String(payload.dropLast()) + ",\"extra\":true}", accepted: false)
check("tampered sequence", payload.replacingOccurrences(of: "\"seq\":\(fixture["seq"]!)", with: "\"seq\":1"), accepted: false)
var gate = WakeupMirror(json: mirror)
assert(gate.verify(payload) != nil)
assert(gate.verify(payload) == nil)
var restored = WakeupMirror(json: gate.json)
assert(restored.verify(payload) == nil)
print("PASS persisted replay rejection")
var expired = WakeupMirror(json: mirror.replacingOccurrences(of: "4070908800000", with: "1"))
assert(expired.verify(payload) == nil)
var refreshed = WakeupMirror(json: mirror)
refreshed.preserveSequences(from: gate)
assert(refreshed.verify(payload) == nil)
print("PASS expired authorization and mirror replay preservation")
exit(failures == 0 ? 0 : 1)
