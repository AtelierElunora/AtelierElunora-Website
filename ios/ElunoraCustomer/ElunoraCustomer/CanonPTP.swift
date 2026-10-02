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
    static func validate(_ response: Data, transaction: UInt32? = nil) throws {
        let b = [UInt8](response)
        guard b.count >= 12, try u32(b, 0) == UInt32(b.count), try u16(b, 4) == 3 else {
            throw Failure(message: "Malformed camera response.")
        }
        let code = try u16(b, 6)
        if let transaction, try u32(b, 8) != transaction {
            throw Failure(message: "Camera response did not match the request.")
        }
        guard code == 0x2001 else {
            throw Failure(message: String(format: "Camera returned PTP 0x%04X. Check camera mode and focus, then reconnect if needed.", code))
        }
    }
    static func property(_ code: UInt32, value: UInt32) -> Data {
        var data = Data()
        for word in [UInt32(12), code, value] { append(word, to: &data) }
        return data
    }
    struct EOSChanges {
        var values: [UInt32: UInt32] = [:]
        var choices: [UInt32: [UInt32]] = [:]
    }
    static func changes(_ data: Data) throws -> EOSChanges {
        let b = [UInt8](data)
        var offset = 0
        var result = EOSChanges()
        while offset < b.count {
            let size = Int(try u32(b, offset))
            guard size >= 8, size <= b.count - offset else { throw Failure(message: "Invalid EOS event length.") }
            let event = try u32(b, offset + 4)
            if event == 0 { break }
            if event == 0xc189, size >= 14 {
                // Only these scalar properties are consumed; other EOS properties have variable layouts.
                let code = try u32(b, offset + 8)
                if code == 0xd1b1 {
                    result.values[code] = UInt32(try u16(b, offset + 12))
                } else if [UInt32(0xd11c), 0xd1b0].contains(code), size >= 16 {
                    result.values[code] = try u32(b, offset + 12)
                }
            } else if event == 0xc18a, size >= 20, try u32(b, offset + 8) == 0xd11c,
                      try u32(b, offset + 12) == 3 {
                let count = Int(try u32(b, offset + 16))
                guard count <= 128, count <= (size - 20) / 4 else { throw Failure(message: "Invalid EOS property choices.") }
                result.choices[0xd11c] = try (0..<count).map { try u32(b, offset + 20 + $0 * 4) }
            }
            offset += size
        }
        return result
    }
    static func handles(_ data: Data) throws -> Set<UInt32> {
        let b = [UInt8](data)
        let count = Int(try u32(b, 0))
        guard count <= 1_000_000, count <= (b.count - 4) / 4 else { throw Failure(message: "Invalid camera object list.") }
        return try Set((0..<count).map { try u32(b, 4 + $0 * 4) })
    }
    static func jpegSize(_ info: Data) throws -> UInt32? {
        let b = [UInt8](info)
        guard b.count >= 53 else { throw Failure(message: "Incomplete camera photo metadata.") }
        guard try u16(b, 4) == 0x3801 else { return nil } // EXIF JPEG, not a folder or RAW.
        let size = try u32(b, 8)
        guard size > 0, size <= 40 * 1024 * 1024 else { throw Failure(message: "Canon JPEG exceeds the 40 MB transfer limit.") }
        return size
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
        guard payload.count >= 4, payload.count <= 16 * 1024 * 1024 else { return nil }
        let b = [UInt8](payload)
        for start in 0..<(b.count - 3) where b[start] == 0xff && b[start + 1] == 0xd8 && b[start + 2] == 0xff {
            for end in stride(from: b.count - 2, through: start + 2, by: -1) where b[end] == 0xff && b[end + 1] == 0xd9 {
                return Data(b[start...end + 1])
            }
            return nil // No end marker exists after the first start marker.
        }
        return nil
    }
}
