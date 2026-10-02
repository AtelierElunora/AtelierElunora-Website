import Foundation

func words(_ values: [UInt32]) -> Data {
    var result = Data()
    values.forEach { CanonPTP.append($0, to: &result) }
    return result
}
func rejects(_ name: String, _ operation: () throws -> Void) {
    do { try operation(); fatalError("Accepted invalid \(name)") } catch { }
}

// Known wire bytes: size / property / value for EOS SetDevicePropValueEx.
precondition(CanonPTP.property(0xd1b0, value: 2) == Data([12,0,0,0,176,209,0,0,2,0,0,0]))
let events = words([16,0xc189,0xd1b0,1, 16,0xc189,0xd11c,2,
                    28,0xc18a,0xd11c,3,2,2,4, 8,0])
let changed = try CanonPTP.changes(events)
precondition(changed.values[0xd1b0] == 1)
precondition(changed.values[0xd11c] == 2)
precondition(changed.choices[0xd11c] == [2,4])
var shortMode = words([14,0xc189,0xd1b1]); shortMode.append(contentsOf: [1,0])
let shortChanges = try CanonPTP.changes(shortMode)
precondition(shortChanges.values[0xd1b1] == 1)
rejects("zero-size EOS event") { _ = try CanonPTP.changes(words([0,0xc189])) }
rejects("truncated EOS event") { _ = try CanonPTP.changes(words([100,0xc189,0xd1b0])) }
rejects("oversized choice count") { _ = try CanonPTP.changes(words([20,0xc18a,0xd11c,3,UInt32.max])) }
let prior = try CanonPTP.handles(words([2,10,20]))
let after = try CanonPTP.handles(words([3,10,20,30]))
precondition(after.subtracting(prior) == [30])
rejects("truncated handle array") { _ = try CanonPTP.handles(words([2,10])) }
rejects("empty handle payload") { _ = try CanonPTP.handles(Data()) }
var info = Data(repeating: 0, count: 53)
info[4] = 1; info[5] = 0x38; info[8] = 100
let validSize = try CanonPTP.jpegSize(info)
precondition(validSize == 100)
info[4] = 0; info[5] = 0x30 // association/folder, not a JPEG
let folderSize = try CanonPTP.jpegSize(info)
precondition(folderSize == nil)
info[4] = 1; info[5] = 0x38; info[11] = 0xff
rejects("oversize JPEG") { _ = try CanonPTP.jpegSize(info) }
let response = Data([12,0,0,0,3,0,1,32,7,0,0,0])
try CanonPTP.validate(response, transaction: 7)
rejects("stale transaction") { try CanonPTP.validate(response, transaction: 8) }
// ImageCaptureCore pairs the completion with the request, while its session may
// use a different wire transaction counter. The adapter must accept this success.
try CanonPTP.validate(response)
var remappedResponse = response
remappedResponse.replaceSubrange(8..<12, with: [201,0,0,0])
try CanonPTP.validate(remappedResponse)
var busyResponse = remappedResponse
busyResponse[6] = 0x19
rejects("camera busy with remapped transaction") { try CanonPTP.validate(busyResponse) }
var wrongContainer = remappedResponse
wrongContainer[4] = 2
rejects("data container passed as response") { try CanonPTP.validate(wrongContainer) }
rejects("truncated framework response") { try CanonPTP.validate(Data(remappedResponse.prefix(10))) }
let wrapped = Data([0,0,0,0,0xff,0xd8,0xff,0xe0,1,2,0xff,0xd9,0,0])
precondition(CanonPTP.jpeg(in: wrapped) == Data([0xff,0xd8,0xff,0xe0,1,2,0xff,0xd9]))
precondition(CanonPTP.jpeg(in: Data([0xff,0xd8,0xff,0xe0])) == nil)
print("Canon wire-format fixtures passed")

// A new card photo may exist only in EOS events while GetObjectHandles stays stale.
var added = words([48,0xc181,30]); added.append(Data(repeating: 0, count: 36))
var added64 = words([48,0xc1a7,40]); added64.append(Data(repeating: 0, count: 36))
let objectEvents = try CanonPTP.changes(added + added64 + added + words([8,0]))
precondition(objectEvents.addedObjects == [30,40])
precondition(objectEvents.eventTypes == [0xc181,0xc1a7])
let staleCatalog = try CanonPTP.handles(words([2,10,20]))
precondition(staleCatalog.union(objectEvents.addedObjects).subtracting(prior) == [30,40])
rejects("truncated new-object event") { _ = try CanonPTP.changes(words([12,0xc181,30])) }
let unrelated = try CanonPTP.changes(words([12,0xc186,99]))
precondition(unrelated.addedObjects.isEmpty) // host-RAM transfer requires a different protocol
print("Canon event discovery fixtures passed")
