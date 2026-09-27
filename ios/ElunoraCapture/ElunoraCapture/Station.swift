import Combine
import Foundation
import UIKit

struct StationFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct PendingPhoto: Codable {
    let requestId: UUID
    let token: String
    let eventName: String
    let jpeg: Data
    var attempted = false
    var isTest: Bool? = nil
}

struct StationAPI {
    static let endpoint = URL(string: "https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/station")!

    static func token(from link: String) throws -> String {
        guard let url = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", ["atelierelunora.com", "www.atelierelunora.com", "v0j63n-ms.myshopify.com"].contains(url.host ?? ""),
              let fragment = url.fragment,
              let items = URLComponents(string: "https://local/?" + fragment)?.queryItems,
              !items.contains(where: { $0.name == "print" }),
              let value = items.first(where: { $0.name == "capture" })?.value,
              value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        else { throw StationFailure(message: "Paste an event capture link from the owner app.") }
        return value
    }

    static func call(token: String, action: String, photo: PendingPhoto? = nil) async throws -> [String: Any] {
        var body: [String: Any] = ["token": token, "purpose": "capture", "action": action]
        if let photo { body["requestId"] = photo.requestId.uuidString.lowercased(); body["jpeg"] = photo.jpeg.base64EncodedString() }
        var request = URLRequest(url: endpoint, timeoutInterval: 90)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "X-Elunora-Request")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw StationFailure(message: "Invalid response. Keep this photo and retry.")
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw StationFailure(message: result["error"] as? String ?? "Upload unavailable. Keep this photo and retry.")
        }
        return result
    }
}

@MainActor final class CaptureModel: ObservableObject {
    @Published var link = ""
    @Published var eventName = ""
    @Published var notice = "Prototype: start with a test event."
    @Published var pending: PendingPhoto?
    @Published var busy = false
    @Published var preview: UIImage?
    @Published var previewIsTest = false
    var canCapture: Bool { !busy && pending == nil && storageReady }
    private var token: String?
    private var storageReady = false
    private let pendingURL: URL

    init() {
        pendingURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("pending-capture.json")
        do {
            try FileManager.default.createDirectory(at: pendingURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            var directory = pendingURL.deletingLastPathComponent()
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
            if FileManager.default.fileExists(atPath: pendingURL.path) {
                let recovered = try JSONDecoder().decode(PendingPhoto.self, from: Data(contentsOf: pendingURL))
                pending = recovered; preview = UIImage(data: recovered.jpeg)
                previewIsTest = recovered.isTest ?? true
                eventName = recovered.eventName; token = recovered.token
                notice = "Recovered a pending photo. Retry to confirm its receipt."
            }
            storageReady = true
        } catch { notice = "Cannot recover or save photos. Resolve device storage before using this prototype." }
    }

    private func save(_ photo: PendingPhoto) throws {
        try JSONEncoder().encode(photo).write(to: pendingURL, options: [.atomic, .completeFileProtection])
        pending = photo
    }

    func connect() async {
        guard !busy, pending == nil, storageReady else { return }
        busy = true; defer { busy = false }
        token = nil; eventName = ""
        do {
            let candidate = try StationAPI.token(from: link)
            let info = try await StationAPI.call(token: candidate, action: "info")
            guard let name = info["name"] as? String, info["purpose"] as? String == "capture" else {
                throw StationFailure(message: "This link is not a capture station.")
            }
            token = candidate; eventName = name; link = ""
            notice = "Connected. Approved photos will enter this event's gallery and print queue."
        } catch { notice = error.localizedDescription }
    }

    func makeTestPhoto() {
        guard !busy, pending == nil, storageReady else { return }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1800, height: 1200), format: format).image { context in
            UIColor(red: 0.92, green: 0.9, blue: 0.85, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1800, height: 1200))
            let text = "ATELIER ELUNORA\nTEST PHOTO\n\(Date().formatted())"
            text.draw(in: CGRect(x: 180, y: 380, width: 1440, height: 500), withAttributes: [.font: UIFont.systemFont(ofSize: 72), .foregroundColor: UIColor.darkGray])
        }
        acceptPhoto(image, isTest: true)
    }

    func acceptPhoto(_ image: UIImage, isTest: Bool = false) {
        guard canCapture else { return }
        do {
            // Redrawing applies UIImage orientation and bounds memory/upload size.
            guard image.size.width > 0, image.size.height > 0 else {
                throw StationFailure(message: "The camera returned an empty photo. Please try again.")
            }
            let scale = min(1, 2400 / max(image.size.width, image.size.height))
            let size = CGSize(width: max(1, floor(image.size.width * scale)), height: max(1, floor(image.size.height * scale)))
            let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
            let normalized = UIGraphicsImageRenderer(size: size, format: format).image { context in
                UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size))
                image.draw(in: CGRect(origin: .zero, size: size))
            }
            var encoded: Data?
            for quality in [CGFloat(0.90), 0.80, 0.65, 0.50, 0.35] {
                if let data = normalized.jpegData(compressionQuality: quality), data.count <= 4_194_304 {
                    encoded = data; break
                }
            }
            guard let jpeg = encoded else { throw StationFailure(message: "This photo is too large. Please try again.") }
            if let token {
                try save(PendingPhoto(requestId: UUID(), token: token, eventName: eventName, jpeg: jpeg, isTest: isTest))
                notice = "Happy with your photo? Approve it to send it to your event."
            } else {
                notice = "Local preview only. Open Station setup and connect an event, then take a new photo to submit."
            }
            preview = UIImage(data: jpeg); previewIsTest = isTest
        } catch { notice = error.localizedDescription }
    }

    func retake() {
        guard !busy, pending?.attempted != true else { return }
        do {
            if FileManager.default.fileExists(atPath: pendingURL.path) { try FileManager.default.removeItem(at: pendingURL) }
            pending = nil; preview = nil; notice = "Ready for another photo."
        } catch { notice = "Could not clear the saved photo. Please retry." }
    }

    func submit() async {
        guard !busy, var photo = pending else { return }
        busy = true; defer { busy = false }
        do {
            photo.attempted = true
            try save(photo) // Persist before networking; keep the same UUID and bytes on every retry.
            notice = "Sending photo…"
            let result = try await StationAPI.call(token: photo.token, action: "submit", photo: photo)
            guard result["received"] as? Bool == true else { throw StationFailure(message: "Receipt unconfirmed. Retry this photo.") }
            try FileManager.default.removeItem(at: pendingURL)
            pending = nil; preview = nil
            notice = "Photo received by the event gallery and print queue."
        } catch { notice = "\(error.localizedDescription) The saved photo is retained for retry." }
    }
}
