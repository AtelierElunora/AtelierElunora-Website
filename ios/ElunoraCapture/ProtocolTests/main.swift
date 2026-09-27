import Foundation
func require(_ condition: Bool, _ message: String) { precondition(condition, message) }
let command = CanonPTP.command(0x9128, transaction: 0x01020304, parameters: [3, 0])
require(Array(command) == [20,0,0,0,1,0,0x28,0x91,4,3,2,1,3,0,0,0,0,0,0,0], "Little-endian EOS command")
try CanonPTP.validate(Data([12,0,0,0,3,0,1,0x20,4,3,2,1]))
let invalidResponses: [[UInt8]] = [[], [12,0,0,0], [12,0,0,0,1,0,1,0x20,0,0,0,0], [12,0,0,0,3,0,0x19,0x20,0,0,0,0]]
for bytes in invalidResponses {
    do { try CanonPTP.validate(Data(bytes)); fatalError("Invalid response accepted") } catch {}
}
var info = Data([100,0,6,0,0,0,100,0,0,0,0])
CanonPTP.append(UInt32(2), to: &info)
CanonPTP.append(UInt16(0x9128), to: &info); CanonPTP.append(UInt16(0x9129), to: &info)
require(try CanonPTP.operations(from: info) == Set([0x9128,0x9129]), "Operation list")
for length in 0..<info.count {
    do { _ = try CanonPTP.operations(from: info.prefix(length)); fatalError("Truncated capability list accepted") } catch {}
}
let jpeg = Data([0xff,0xd8,0xff,0xe0,0,2,0xff,0xd9])
require(CanonPTP.jpeg(in: Data([4,0,0,0]) + jpeg + Data([1,2])) == jpeg, "JPEG from EOS frame")
require(CanonPTP.jpeg(in: Data([0xff,0xd8,0xff,0])) == nil, "Incomplete JPEG rejected")
require(CanonPTP.jpeg(in: Data(repeating: 0, count: 17 * 1024 * 1024)) == nil, "Oversized live-view payload rejected")
print("PASS: PTP encoding, response validation, bounded capabilities and JPEG extraction")
