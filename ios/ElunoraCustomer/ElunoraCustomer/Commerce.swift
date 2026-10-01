import Foundation
import Combine
import Security
import UIKit
import ImageIO
import CryptoKit

struct CustomerSession: Codable {
    var access_token: String
    var refresh_token: String
    var expires_at: Double
    var email: String?
    var is_anonymous: Bool?
}
struct UploadReceipt: Codable { var requestId: String; var filename: String; var photoId: String? }
struct Workspace: Codable { var link: String; var eventId: String; var session: String }
private struct CheckoutAttempt: Codable { var fingerprint: String; var revision: Int; var receipt: CheckoutReceipt? }
private struct Connection: Codable { var auth: CustomerSession; var workspace: Workspace?; var uploads: [String: UploadReceipt]; var attempt: CheckoutAttempt?; var galleryOrders: [String: OrderDraft]?; var checkoutAttempts: [String: CheckoutAttempt]? }
struct MagnetPack: Codable, Identifiable, Equatable {
    var count: Int; var cents: Int; var variant: String
    var id: String { variant }
    var price: String { (Double(cents)/100).formatted(.currency(code: "USD")) }
}
struct PackPricing: Decodable { var packs: [MagnetPack]; var enabled: Bool; var currency: String }
struct CheckoutReceipt: Codable, Identifiable {
    var checkoutUrl: String; var reference: String
    var id: String { reference }
    var date: Date = Date()
    enum CodingKeys: String, CodingKey { case checkoutUrl, reference }
}
struct AssignedGallery: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let event_date: String?
    let is_sample: Bool?
}
struct GalleryPhoto: Decodable, Identifiable, Sendable { let id: String; let filename: String }
struct GalleryListReply: Decodable { let events: [AssignedGallery] }
struct GalleryDetailReply: Decodable, Sendable { let event: AssignedGallery; let photos: [GalleryPhoto]; let expiresAt: String? }
private struct SelectionItem: Decodable { var photoId: String; var quantity: Int; var x: Double; var y: Double; var zoom: Double }
private struct SelectionState: Decodable { var revision: Int; var items: [SelectionItem]? }
private struct Studio: Decodable { var link: String; var eventId: String }
private struct Reservation: Decodable { var photoId: String; var uploadUrl: String?; var ready: Bool? }
private struct Finished: Decodable { var status: String; var photoId: String? }
private struct Identity: Decodable { var email: String?; var owner: Bool; var mfaRequired: Bool }
private struct EmptyReply: Decodable {}
struct CustomerError: LocalizedError { let message: String; var status: Int? = nil; var errorDescription: String? { message } }

private enum SecureConnection {
    static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Bundle.main.bundleIdentifier ?? "ElunoraCustomer", kSecAttrAccount as String: "customer-connection-v1"] }
    static func read() -> Data? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?; return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess ? item as? Data : nil
    }
    static func write(_ data: Data) throws {
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; q[kSecValueData as String] = data; q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw CustomerError(message: "Could not save your secure session. Please retry.") }
        } else if status != errSecSuccess { throw CustomerError(message: "Could not update your secure session. Please retry.") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}

@MainActor final class CommerceModel: ObservableObject {
    @Published private(set) var session: CustomerSession?
    @Published private(set) var pricing: PackPricing?
    @Published private(set) var busy = false
    @Published private(set) var progress = ""
    @Published var message: String?
    @Published private(set) var galleryOrders: [String: OrderDraft] = [:]
    @Published private(set) var previewVersion = 0
    private let previewCache = NSCache<NSString, UIImage>()
    private var previewTimes: [String: Date] = [:]
    private var previewTasks: [String: Task<UIImage, Error>] = [:]
    @Published private(set) var checkouts: [CheckoutReceipt] = []
    private var workspace: Workspace?
    private var uploads: [String: UploadReceipt] = [:]
    private var attempt: CheckoutAttempt?
    private var attempts: [String: CheckoutAttempt] = [:]
    private var refreshTask: Task<CustomerSession, Error>?
    private let base = URL(string: "https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/")!
    private var historyURL: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("checkout-history.json") }
    init() {
        if let data = SecureConnection.read(), let saved = try? JSONDecoder().decode(Connection.self, from: data) { session = saved.auth; workspace = saved.workspace; uploads = saved.uploads; attempt = saved.attempt; galleryOrders = saved.galleryOrders ?? [:]; attempts = saved.checkoutAttempts ?? [:] }
        if let data = try? Data(contentsOf: historyURL), let history = try? JSONDecoder().decode([CheckoutReceipt].self, from: data) { checkouts = history }
    }
    private func persist() throws {
        guard let session else { return }
        try SecureConnection.write(JSONEncoder().encode(Connection(auth: session, workspace: workspace, uploads: uploads, attempt: attempt, galleryOrders: galleryOrders, checkoutAttempts: attempts)))
    }
    private func raw<T: Decodable>(_ path: String, body: [String: Any]?, token: String?, as type: T.Type) async throws -> T {
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var components = URLComponents(url: base.appendingPathComponent(parts[0]), resolvingAgainstBaseURL: false)!
        if parts.count == 2 { components.percentEncodedQuery = parts[1] }
        guard let url = components.url else { throw CustomerError(message: "Invalid request address.") }
        var request = URLRequest(url: url); request.timeoutInterval = 100
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("1", forHTTPHeaderField: "X-Elunora-Request")
        // Same authenticated contracts as the existing storefront. Origin is transport filtering, never authorization.
        request.setValue("https://www.atelierelunora.com", forHTTPHeaderField: "Origin")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CustomerError(message: "Could not reach Atelier Elunora. Please retry.") }
        guard (200..<300).contains(http.statusCode) else {
            let error = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            if http.statusCode == 401 { message = "Your connection expired. Reconnect through the security check." }
            throw CustomerError(message: error?["error"] as? String ?? "Could not complete the request. Please retry.", status: http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private func renew() async throws {
        guard let current = session else { throw CustomerError(message: "Connect your private workspace first.") }
        guard current.expires_at < Date().timeIntervalSince1970 + 90 else { return }
        if refreshTask == nil { refreshTask = Task { try await self.raw("refresh", body: ["refresh_token": current.refresh_token], token: nil, as: CustomerSession.self) } }
        guard let task = refreshTask else { return }
        do { let refreshed = try await task.value; session = refreshed; refreshTask = nil; try persist() }
        catch { refreshTask = nil; throw error }
    }
    private func call<T: Decodable>(_ path: String, _ body: [String: Any]? = nil, as type: T.Type) async throws -> T {
        try await renew(); return try await raw(path, body: body, token: session?.access_token, as: type)
    }
    func accept(_ candidate: CustomerSession) async throws {
        guard !busy, candidate.access_token.count < 8192, !candidate.access_token.isEmpty, !candidate.refresh_token.isEmpty, candidate.refresh_token.count < 2049 else { throw CustomerError(message: "Finish the website security check or sign in first.") }
        let identity: Identity = try await raw("session", body: nil, token: candidate.access_token, as: Identity.self)
        guard !identity.owner else { throw CustomerError(message: "Use a customer session for shopping. Choose Continue without signing in in a fresh private workspace instead of connecting the owner studio account.") }
        // User changes never inherit another session's upload mappings.
        if session?.refresh_token != candidate.refresh_token { workspace = nil; uploads = [:]; pricing = nil; attempt = nil; attempts = [:]; galleryOrders = [:]; clearPreviews(); clearHistory() }
        var verified = candidate; verified.email = identity.email
        session = verified; try persist()
    }
    func connectWorkspace() async throws {
        guard !busy else { return }; busy = true; defer { busy = false; progress = "" }
        try await prepareWorkspace()
    }
    private func openWorkspace() async throws {
        progress = "Opening your private workspace…"
        let oldEvent = workspace?.eventId
        let studio: Studio = try await call("experience", ["action": "studio"], as: Studio.self)
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw CustomerError(message: "Could not create a secure upload session.") }
        // Finished photos belong to the stable studio event. Pending reservations belong to the old upload session.
        uploads = oldEvent == studio.eventId ? uploads.filter { $0.value.photoId != nil } : [:]
        if oldEvent != studio.eventId { attempt = nil }
        workspace = Workspace(link: studio.link, eventId: studio.eventId, session: bytes.map { String(format: "%02x", $0) }.joined())
        try persist()
    }
    private func joinWorkspace() async throws {
        guard let workspace else { throw CustomerError(message: "Could not open your workspace.") }
        let _: EmptyReply = try await call("experience", ["action": "join", "link": workspace.link, "session": workspace.session, "consent": true], as: EmptyReply.self)
    }
    private func prepareWorkspace() async throws {
        if workspace == nil { try await openWorkspace() }
        do { try await joinWorkspace() }
        catch let error as CustomerError where error.status == 403 {
            // Website use can rotate the studio link; renew it once using the authenticated account.
            try await openWorkspace(); try await joinWorkspace()
        }
        guard let workspace else { throw CustomerError(message: "Could not open your workspace.") }
        let _: EmptyReply = try await call("experience", ["action": "claim", "session": workspace.session], as: EmptyReply.self)
        let remote: PackPricing = try await call("events/\(workspace.eventId)/pricing?variant=52214866018592", as: PackPricing.self)
        guard remote.currency == "USD", !remote.packs.isEmpty else { throw CustomerError(message: "Magnet pricing is unavailable. Please retry.") }
        pricing = remote
    }
    func prepareCheckout(entries: [PhotoDraft], photos: [SavedPhoto], pack: MagnetPack, imageStore: PhotoStore, consent: Bool, orderId: String) async throws -> CheckoutReceipt {
        guard !busy else { throw CustomerError(message: "Please wait for the current request.") }
        guard consent, !entries.isEmpty, entries.count <= 50, entries.reduce(0, { $0 + $1.quantity }) == pack.count,
              entries.allSatisfy({ (1...12).contains($0.quantity) && (0...100).contains($0.x) && (0...100).contains($0.y) && (1...3).contains($0.zoom) }), Set(entries.map(\.id)).count == entries.count else { throw CustomerError(message: "Review your photos and choose exactly \(pack.count) magnets.") }
        busy = true; defer { busy = false; progress = "" }
        try await prepareWorkspace()
        guard let workspace, let confirmed = pricing?.packs.first(where: { $0.variant == pack.variant }), confirmed == pack, pricing?.enabled == true else { throw CustomerError(message: "Pricing or availability changed. Review the current packs before checkout.") }
        var selection: [[String: Any]] = []
        for (index, draft) in entries.enumerated() {
            progress = "Uploading photo \(index + 1) of \(entries.count)…"
            guard let photo = photos.first(where: { $0.id == draft.id }) else { throw CustomerError(message: "A selected photo was removed. Review your selection.") }
            let staged = try imageStore.uploadFile(photo)
            var receipt = uploads[photo.id] ?? UploadReceipt(requestId: UUID().uuidString.lowercased(), filename: staged.lastPathComponent)
            uploads[photo.id] = receipt; try persist()
            if receipt.photoId == nil {
                let size = (try staged.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
                guard size > 0, size <= 15 * 1024 * 1024 else { throw CustomerError(message: "Choose a smaller photo (15 MB maximum).") }
                let reservation: Reservation = try await call("experience", ["action": "reserve", "session": workspace.session, "requestId": receipt.requestId, "filename": receipt.filename, "mime": "image/jpeg", "bytes": size], as: Reservation.self)
                if reservation.ready != true {
                    guard let address = reservation.uploadUrl, let url = URL(string: address), url.scheme == "https", url.host == base.host,
                          url.path.hasPrefix("/storage/v1/object/upload/sign/gallery-originals/") else { throw CustomerError(message: "Could not verify the private upload address.") }
                    var put = URLRequest(url: url); put.httpMethod = "PUT"; put.timeoutInterval = 120; put.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
                    let (_, response) = try await URLSession.shared.upload(for: put, fromFile: staged)
                    guard let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status) || status == 409 else { throw CustomerError(message: "Photo upload interrupted. Retry to resume your saved selection.") }
                    let done: Finished = try await call("experience", ["action": "finish", "session": workspace.session, "requestId": receipt.requestId], as: Finished.self)
                    guard ["approved", "received"].contains(done.status) else { throw CustomerError(message: "This photo is awaiting review. Retry after it has been approved.") }
                }
                receipt.photoId = reservation.photoId; uploads[photo.id] = receipt; try persist()
            }
            guard let id = receipt.photoId else { throw CustomerError(message: "Could not confirm the uploaded photo.") }
            selection.append(["photoId": id, "quantity": draft.quantity, "x": draft.x, "y": draft.y, "zoom": draft.zoom])
        }
        return try await finishSelection(eventId: workspace.eventId, selection: selection, pack: pack, orderId: orderId)
    }
    private func finishSelection(eventId: String, selection: [[String: Any]], pack: MagnetPack, orderId: String) async throws -> CheckoutReceipt {
        attempt = attempts[eventId] ?? attempt
        progress = "Saving your reviewed selection…"
        let previous: SelectionState = try await call("events/\(eventId)/selection", as: SelectionState.self)
        let fingerprintData = try JSONSerialization.data(withJSONObject: ["event": eventId, "order": orderId, "pack": pack.variant, "items": selection], options: .sortedKeys)
        let fingerprint = SHA256.hash(data: fingerprintData).map { String(format: "%02x", $0) }.joined()
        let matches = previous.items?.count == selection.count && (previous.items ?? []).enumerated().allSatisfy { index, item in
            let expected = selection[index]
            return item.photoId == (expected["photoId"] as? String) && item.quantity == (expected["quantity"] as? Int) && item.x == (expected["x"] as? Double) && item.y == (expected["y"] as? Double) && item.zoom == (expected["zoom"] as? Double)
        }
        let revision: Int
        if let attempt, attempt.fingerprint == fingerprint, attempt.revision == previous.revision, matches {
            if let receipt = attempt.receipt { return receipt }
            revision = previous.revision
        }
        else {
            // Persist the expected revision before the write. An interrupted response can be recovered with GET.
            attempt = CheckoutAttempt(fingerprint: fingerprint, revision: previous.revision + 1); attempts[eventId] = attempt; try persist()
            let saved: SelectionState = try await call("events/\(eventId)/selection", ["revision": previous.revision, "items": selection], as: SelectionState.self)
            revision = saved.revision
        }
        progress = "Preparing secure checkout…"
        let checkout: CheckoutReceipt = try await call("events/\(eventId)/checkout", ["revision": revision, "count": pack.count, "cents": pack.cents, "variant": pack.variant], as: CheckoutReceipt.self)
        guard let url = URL(string: checkout.checkoutUrl), url.scheme == "https", url.user == nil, url.password == nil,
              ["v0j63n-ms.myshopify.com", "www.atelierelunora.com", "atelierelunora.com"].contains(url.host ?? "") else { throw CustomerError(message: "Checkout returned an unexpected address.") }
        attempt?.receipt = checkout; attempts[eventId] = attempt; try persist()
        checkouts.removeAll { $0.reference == checkout.reference }; checkouts.insert(checkout, at: 0)
        if let data = try? JSONEncoder().encode(Array(checkouts.prefix(30))) { try? data.write(to: historyURL, options: [.atomic, .completeFileProtection]) }
        return checkout
    }
    func signIn(email: String, password: String, captcha: String) async throws {
        let candidate: CustomerSession = try await raw("password-login", body: ["email": email, "password": password, "captchaToken": captcha], token: nil, as: CustomerSession.self)
        try await accept(candidate)
    }
    func requestCode(email: String, captcha: String) async throws {
        let _: EmptyReply = try await raw("login", body: ["email": email, "captchaToken": captcha], token: nil, as: EmptyReply.self)
    }
    func verifyCode(email: String, code: String) async throws {
        let candidate: CustomerSession = try await raw("verify", body: ["email": email, "token": code], token: nil, as: CustomerSession.self)
        try await accept(candidate)
    }
    func saveGalleryDraft(_ draft: OrderDraft, eventId: String) {
        galleryOrders[eventId] = draft
        do { try persist() } catch { message = "Could not save the gallery draft. Please retry." }
    }
    func toggleGalleryPhoto(_ photoId: String, eventId: String) {
        var draft = galleryOrders[eventId] ?? OrderDraft()
        if draft.items.contains(where: { $0.id == photoId }) { draft.items.removeAll { $0.id == photoId } }
        else if draft.items.count < 50 { draft.items.append(PhotoDraft(id: photoId)) }
        saveGalleryDraft(draft, eventId: eventId)
    }
    func galleryPricing(_ eventId: String) async throws -> PackPricing {
        try await call("events/\(eventId)/pricing", as: PackPricing.self)
    }
    func checkoutGallery(eventId: String, draft: OrderDraft, pack: MagnetPack) async throws -> CheckoutReceipt {
        guard !busy, draft.consent, !draft.items.isEmpty, draft.items.count <= 50,
              Set(draft.items.map(\.id)).count == draft.items.count,
              draft.items.reduce(0, { $0 + $1.quantity }) == pack.count,
              draft.items.allSatisfy({ UUID(uuidString: $0.id) != nil && (1...12).contains($0.quantity) && (0...100).contains($0.x) && (0...100).contains($0.y) && (1...3).contains($0.zoom) }) else { throw CustomerError(message: "Review your selection and choose exactly \(pack.count) magnets.") }
        busy = true; defer { busy = false; progress = "" }
        let prices = try await galleryPricing(eventId)
        guard prices.enabled, prices.packs.contains(pack) else { throw CustomerError(message: "Pricing or availability changed. Refresh the packs.") }
        let selection: [[String: Any]] = draft.items.map { ["photoId": $0.id, "quantity": $0.quantity, "x": $0.x, "y": $0.y, "zoom": $0.zoom] }
        return try await finishSelection(eventId: eventId, selection: selection, pack: pack, orderId: draft.orderId)
    }
    func clearPreviews() {
        previewCache.removeAllObjects(); previewTimes = [:]; previewTasks.values.forEach { $0.cancel() }; previewTasks = [:]; previewVersion += 1
    }
    func assignedGalleries() async throws -> [AssignedGallery] {
        guard session?.email?.isEmpty == false else { throw CustomerError(message: "Sign in with the email that received your gallery invitation.") }
        let result: GalleryListReply = try await call("events", as: GalleryListReply.self)
        return result.events
    }
    func galleryDetail(_ id: String) async throws -> GalleryDetailReply {
        guard UUID(uuidString: id) != nil else { throw CustomerError(message: "Gallery unavailable.") }
        return try await call("events/\(id)", as: GalleryDetailReply.self)
    }
    private let previewSession = URLSession(configuration: .ephemeral)
    func galleryPreview(eventId: String, photoId: String) async throws -> UIImage {
        let key = "\(session?.email ?? ""):\(eventId):\(photoId)"
        if let date = previewTimes[key], Date().timeIntervalSince(date) < 60, let image = previewCache.object(forKey: key as NSString) { return image }
        if let task = previewTasks[key] { return try await task.value }
        let generation = previewVersion
        let task = Task { try await self.fetchGalleryPreview(eventId: eventId, photoId: photoId) }
        previewTasks[key] = task
        defer { if generation == previewVersion { previewTasks[key] = nil } }
        let image = try await task.value
        guard generation == previewVersion else { throw CancellationError() }
        previewCache.totalCostLimit = 40 * 1024 * 1024
        previewTimes[key] = Date()
        previewCache.setObject(image, forKey: key as NSString, cost: Int(image.size.width * image.size.height * 4))
        return image
    }
    private func fetchGalleryPreview(eventId: String, photoId: String) async throws -> UIImage {
        guard UUID(uuidString: eventId) != nil, UUID(uuidString: photoId) != nil else { throw CustomerError(message: "Photo unavailable.") }
        try await renew()
        var request = URLRequest(url: base.appendingPathComponent("events/\(eventId)/photos/\(photoId)"), cachePolicy: .reloadIgnoringLocalCacheData)
        request.timeoutInterval = 45
        request.setValue("https://www.atelierelunora.com", forHTTPHeaderField: "Origin")
        request.setValue("1", forHTTPHeaderField: "X-Elunora-Request")
        request.setValue("Bearer " + (session?.access_token ?? ""), forHTTPHeaderField: "Authorization")
        let (data, response) = try await previewSession.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              http.mimeType?.hasPrefix("image/") == true, let image = UIImage(data: data) else {
            throw CustomerError(message: "Photo unavailable. Refresh the gallery or check your connection.")
        }
        return image
    }
    private func clearHistory() { checkouts = []; try? FileManager.default.removeItem(at: historyURL) }
    func signOut() async throws {
        guard !busy else { return }
        try await renew()
        if let session { let _: EmptyReply = try await raw("logout", body: ["refresh_token": session.refresh_token], token: session.access_token, as: EmptyReply.self) }
        SecureConnection.clear(); session = nil; workspace = nil; uploads = [:]; pricing = nil; attempt = nil; attempts = [:]; galleryOrders = [:]; clearPreviews(); clearHistory()
    }
}
