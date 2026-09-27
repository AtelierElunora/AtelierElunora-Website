import Foundation

// Wire constants documented by libgphoto2's Canon EOS protocol implementation.
// Independent implementation; no libgphoto2 code or runtime is bundled.
enum CanonPTP {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
    static func u16(_ bytes: [UInt8], _ offset: Int) throws -> UInt16 {
        guard offset >= 0, offset + 2 <= bytes.count else { throw Failure(message: "Truncated PTP response.") }
        return UInt16(bytes[offset]) | UInt16(bytes[offset + 1]) << 8
    }
    static func u32(_ bytes: [UInt8], _ offset: Int) throws -> UInt32 {
        guard offset >= 0, offset + 4 <= bytes.count else { throw Failure(message: "Truncated PTP response.") }
        return (0..<4).reduce(0) { $0 | UInt32(bytes[offset + $1]) << ($1 * 8) }
    }
    static func append<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
        for i in 0..<MemoryLayout<T>.size { data.append(UInt8(truncatingIfNeeded: value >> (i * 8))) }
    }
    static func command(_ operation: UInt16, transaction: UInt32, parameters: [UInt32] = []) -> Data {
        precondition(parameters.count <= 5)
        var data = Data()
        append(UInt32(12 + parameters.count * 4), to: &data)
        append(UInt16(1), to: &data); append(operation, to: &data); append(transaction, to: &data)
        parameters.forEach { append($0, to: &data) }
        return data
    }
    static func validate(_ response: Data) throws {
        let b = [UInt8](response)
        guard b.count >= 12, try u32(b, 0) == UInt32(b.count), try u16(b, 4) == 3 else {
            throw Failure(message: "Malformed camera response.")
        }
        let code = try u16(b, 6)
        guard code == 0x2001 else {
            throw Failure(message: String(format: "Camera returned PTP 0x%04X. Check camera mode and focus, then reconnect if needed.", code))
        }
    }
    static func operations(from data: Data) throws -> Set<UInt16> {
        let b = [UInt8](data)
        guard b.count > 8 else { throw Failure(message: "Incomplete camera capabilities.") }
        // Standard version, vendor extension ID/version, UTF-16 extension description,
        // functional mode, then the supported-operation array.
        let offset = 9 + Int(b[8]) * 2 + 2
        let count = Int(try u32(b, offset))
        guard count <= 4096, offset + 4 + count * 2 <= b.count else {
            throw Failure(message: "Invalid camera capability list.")
        }
        return try Set((0..<count).map { try u16(b, offset + 4 + $0 * 2) })
    }
    static func jpeg(in payload: Data) -> Data? {
        // EOS viewfinder payloads wrap a JPEG in model-specific metadata.
        let b = [UInt8](payload)
        guard b.count >= 4, b.count <= 16 * 1024 * 1024 else { return nil }
        for start in 0..<(b.count - 3) where b[start] == 0xff && b[start + 1] == 0xd8 && b[start + 2] == 0xff {
            for end in stride(from: b.count - 2, through: start + 2, by: -1) where b[end] == 0xff && b[end + 1] == 0xd9 {
                return Data(b[start...end + 1])
            }
        }
        return nil
    }
}
