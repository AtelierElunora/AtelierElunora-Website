import XCTest
import UIKit
import Security
import CryptoKit
@testable import ElunoraCustomer

final class CustomerDomainTests: XCTestCase {
    func testLinksRejectForeignAndAmbiguousInvitations() {
        let token = String(repeating: "a", count: 64)
        XCTAssertEqual(CustomerLink.parse(URL(string: "https://www.atelierelunora.com/pages/share-photos#event=\(token)")!), .event("https://www.atelierelunora.com/pages/share-photos#event=\(token)"))
        for value in ["https://attacker.invalid/pages/client-gallery", "http://atelierelunora.com/pages/client-gallery", "https://user@atelierelunora.com/pages/client-gallery", "https://atelierelunora.com:443/pages/client-gallery", "https://atelierelunora.com/pages/share-photos#event=\(token)&event=\(token)"] {
            XCTAssertNil(CustomerLink.parse(URL(string: value)!))
        }
    }
    func testCropEdgesAndUnmovableAxis() {
        XCTAssertEqual(CropGeometry.side(width: 4000, height: 2000, zoom: 2), 1000)
        XCTAssertEqual(CropGeometry.shifted(position: 50, translation: 5000, imageDimension: 4000, cropSide: 1000, viewSide: 300), 0)
        XCTAssertEqual(CropGeometry.shifted(position: 50, translation: -5000, imageDimension: 4000, cropSide: 1000, viewSide: 300), 100)
        XCTAssertEqual(CropGeometry.shifted(position: 50, translation: 100, imageDimension: 2000, cropSide: 2000, viewSide: 300), 50)
        XCTAssertEqual(CropGeometry.clamped(.nan, 1...3), 1)
    }
    func testRetryPolicyDoesNotAutomaticallyRetryAccessDenials() {
        XCTAssertFalse(UploadRetryPolicy.retryable(status: 403))
        XCTAssertFalse(UploadRetryPolicy.retryable(status: 400))
        XCTAssertTrue(UploadRetryPolicy.retryable(status: 503))
        XCTAssertTrue(UploadRetryPolicy.retryable(status: nil))
        XCTAssertLessThanOrEqual(UploadRetryPolicy.delay(attempt: 100), 300)
    }
    func testLegacyCheckoutReceiptAndDateRoundTrip() throws {
        let old = try JSONDecoder().decode(CheckoutReceipt.self, from: Data(#"{"checkoutUrl":"https://atelierelunora.com/checkout","reference":"r"}"#.utf8))
        XCTAssertNil(old.draft)
        var receipt = old; receipt.date = Date(timeIntervalSince1970: 1000)
        receipt.draft = OrderDraft(items: [PhotoDraft(id: "p")])
        let restored = try JSONDecoder().decode(CheckoutReceipt.self, from: JSONEncoder().encode(receipt))
        XCTAssertEqual(restored.date, receipt.date)
        XCTAssertEqual(restored.draft, receipt.draft)
    }
}

@MainActor final class CustomerPhotoTests: XCTestCase {
    var directory: URL!
    override func setUp() { directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }
    override func tearDown() { try? FileManager.default.removeItem(at: directory) }
    func testDraftRestorationAndMissingPhotos() throws {
        let first = PhotoStore(directory: directory)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 800)).image { context in UIColor.blue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1200, height: 800)) }
        first.save(image)
        let photo = try XCTUnwrap(first.photos.first)
        first.toggleSelection(photo); first.order.items[0].zoom = 2; first.order.items[0].quantity = 6
        let restored = PhotoStore(directory: directory)
        XCTAssertEqual(restored.order, first.order)
        try FileManager.default.removeItem(at: photo.url)
        XCTAssertTrue(PhotoStore(directory: directory).order.items.isEmpty)
    }
    func testThumbnailAndOriginalQualityRemainDistinct() async throws {
        let store = PhotoStore(directory: directory)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 2000, height: 1000)).image { _ in }
        store.save(image)
        let photo = try XCTUnwrap(store.photos.first)
        let loaded = await store.loadThumbnail(photo)
        let thumbnail = try XCTUnwrap(loaded)
        XCTAssertLessThanOrEqual(max(thumbnail.cgImage!.width, thumbnail.cgImage!.height), 900)
        let pixels = await store.pixelSide(photo, draft: PhotoDraft(id: photo.id, zoom: 2))
        XCTAssertGreaterThan(pixels ?? 0, 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: photo.url.path))
    }
}

struct StubHTTPReply { let status: Int; let body: Any }

final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> Any)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let value = try Self.handler!(request)
            let reply = value as? StubHTTPReply
            let data = try JSONSerialization.data(withJSONObject: reply?.body ?? value)
            let response = HTTPURLResponse(url: request.url!, statusCode: reply?.status ?? 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
    static func body(_ request: URLRequest) -> Data {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(), buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            result.append(contentsOf: buffer.prefix(count))
        }
        return result
    }
}

@MainActor final class CustomerCommerceTests: XCTestCase {
    private let eventID = "00000000-0000-0000-0000-000000000001"
    private let photoID = "00000000-0000-0000-0000-000000000002"
    private var network: URLSession!
    override func setUp() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        network = URLSession(configuration: configuration)
    }
    override func tearDown() { network.invalidateAndCancel(); StubURLProtocol.handler = nil }
    private func session(_ token: String = "test") -> CustomerSession { CustomerSession(access_token: token, refresh_token: token, expires_at: Date().timeIntervalSince1970 + 3600, email: "owner@example.invalid") }
    func testEmailNeverGrantsOwnerAccessAndAccountSwitchClearsDrafts() async throws {
        StubURLProtocol.handler = { _ in ["email": "customer@example.invalid", "owner": false, "mfaRequired": false, "aal": "aal2"] }
        let model = CommerceModel(base: URL(string: "https://example.invalid/")!, network: network, restoresSavedSession: false)
        try await model.accept(session())
        XCTAssertEqual(model.accessRole, .customer)
        model.saveGalleryDraft(OrderDraft(items: [PhotoDraft(id: photoID)]), eventId: eventID)
        model.toggleFavorite(photoID, eventId: eventID)
        try await model.accept(session("different"))
        XCTAssertTrue(model.galleryOrders.isEmpty)
        XCTAssertTrue(model.favorites.isEmpty)
    }
    func testInterruptedCheckoutReusesSelectionRevisionAndUploadedPhoto() async throws {
        let event = eventID, photoID = photoID
        var selection: [[String: Any]] = [], revision = 0, posts = 0, reserves = 0, checkoutCalls = 0
        StubURLProtocol.handler = { request in
            let path = request.url!.path
            if path == "/session" { return ["email": "customer@example.invalid", "owner": false, "mfaRequired": false, "aal": "aal1"] }
            if path == "/experience" {
                let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]
                switch body["action"] as? String {
                case "studio": return ["link": "test-link", "eventId": event]
                case "reserve": reserves += 1; return ["photoId": photoID, "ready": true]
                default: return [:]
                }
            }
            if path.hasSuffix("/pricing") { return ["currency": "USD", "enabled": true, "packs": [["count": 6, "cents": 2499, "variant": "variant"]]] }
            if path.hasSuffix("/selection") {
                if request.httpMethod == "POST" {
                    let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]
                    selection = body["items"] as! [[String: Any]]; revision += 1; posts += 1
                }
                return ["revision": revision, "items": selection]
            }
            if path.hasSuffix("/checkout") {
                checkoutCalls += 1
                if checkoutCalls == 1 { throw URLError(.networkConnectionLost) }
                return ["checkoutUrl": "https://www.atelierelunora.com/checkout", "reference": "reference"]
            }
            throw URLError(.unsupportedURL)
        }
        let model = CommerceModel(base: URL(string: "https://example.invalid/")!, network: network, restoresSavedSession: false)
        try await model.accept(session())
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let photos = PhotoStore(directory: directory)
        photos.save(UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { _ in })
        let draft = PhotoDraft(id: try XCTUnwrap(photos.photos.first).id, quantity: 6)
        let pack = MagnetPack(count: 6, cents: 2499, variant: "variant")
        do { _ = try await model.prepareCheckout(entries: [draft], photos: photos.photos, pack: pack, imageStore: photos, consent: true, orderId: "stable-order"); XCTFail("Expected interrupted checkout") }
        catch { XCTAssertTrue(error is URLError) }
        let receipt = try await model.prepareCheckout(entries: [draft], photos: photos.photos, pack: pack, imageStore: photos, consent: true, orderId: "stable-order")
        XCTAssertEqual(receipt.reference, "reference")
        XCTAssertEqual(posts, 1); XCTAssertEqual(reserves, 1); XCTAssertEqual(checkoutCalls, 2)
    }
}

@MainActor final class CustomerEventRecoveryTests: XCTestCase {
    func testQueueRestoresAndRetriesSameRequestWithoutDuplicatingPhoto() async throws {
        let profile = "test-" + UUID().uuidString
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let digest = SHA256.hash(data: Data(profile.utf8)).map { String(format: "%02x", $0) }.joined()
        defer { SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: Bundle.main.bundleIdentifier ?? "ElunoraCustomer", kSecAttrAccount: "event-guest-v1-" + digest] as CFDictionary) }
        let photos = PhotoStore(directory: directory)
        photos.save(UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { _ in })
        let photo = try XCTUnwrap(photos.photos.first)
        let eventID = "00000000-0000-0000-0000-000000000001"
        var finishCalls = 0, requestIDs: [String] = []
        StubURLProtocol.handler = { request in
            let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]
            switch body["action"] as? String {
            case "info": return ["name": "Test event", "eventId": eventID, "welcome": "", "moderation": true, "guestLimit": 12, "closesAt": "2030-01-01T00:00:00Z", "studio": false, "uploadLater": false]
            case "join": return ["joined": true, "eventId": eventID]
            case "reserve": requestIDs.append(body["requestId"] as! String); return ["ready": true]
            case "finish":
                finishCalls += 1
                if finishCalls == 1 { throw URLError(.networkConnectionLost) }
                return ["status": "pending"]
            case "photos": return ["photos": []]
            default: throw URLError(.unsupportedURL)
            }
        }
        let factory = { () -> URLSession in
            let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [StubURLProtocol.self]
            return URLSession(configuration: configuration)
        }
        let first = EventUploadModel(networkFactory: factory)
        first.useProfile(profile)
        try await first.join("https://www.atelierelunora.com/pages/share-photos#event=" + String(repeating: "a", count: 64))
        await first.enqueue([photo], store: photos)
        XCTAssertEqual(first.queuedIDs, [photo.id])
        first.useProfile("cancel-timer-" + UUID().uuidString)
        let restored = EventUploadModel(networkFactory: factory)
        restored.useProfile(profile)
        XCTAssertEqual(restored.queuedIDs, [photo.id])
        await restored.resumeQueue(store: photos, force: true)
        XCTAssertTrue(restored.queuedIDs.isEmpty)
        XCTAssertTrue(restored.uploaded(photo.id))
        XCTAssertEqual(requestIDs.count, 2); XCTAssertEqual(requestIDs[0], requestIDs[1])
        restored.useProfile("cancel-timer-" + UUID().uuidString)
        StubURLProtocol.handler = nil
    }
}

@MainActor final class MemoryCustomerConnection: CustomerConnectionStorage {
    var data: Data?
    func read() -> Data? { data }
    func write(_ data: Data) throws { self.data = data }
    func clear() { data = nil }
}
@MainActor final class ReceiptFileTransfers: CustomerFileTransfers {
    var receipts: [String: Int] = [:]
    var attempts: [String] = []
    var actualUploads = 0
    var failuresRemaining = 0
    var cancellations: [String] = []
    func upload(id: String, request: URLRequest, file: URL) async throws -> Int {
        attempts.append(id)
        if let receipt = receipts[id] { return receipt }
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
        if failuresRemaining > 0 { failuresRemaining -= 1; throw URLError(.networkConnectionLost) }
        actualUploads += 1; receipts[id] = 200; return 200
    }
    func acknowledge(_ id: String) { receipts[id] = nil }
    func cancel(prefix: String) async { cancellations.append(prefix) }
}
@MainActor final class CustomerCheckoutRecoveryTests: XCTestCase {
    func testRelaunchResumesApprovedSnapshotAfterFinishFailureWithoutSecondPUT() async throws {
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [StubURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); StubURLProtocol.handler = nil }
        let storage = MemoryCustomerConnection(), transfers = ReceiptFileTransfers()
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let photos = PhotoStore(directory: directory)
        photos.save(UIGraphicsImageRenderer(size: CGSize(width: 120, height: 100)).image { _ in })
        let approved = PhotoDraft(id: try XCTUnwrap(photos.photos.first).id, quantity: 6, x: 27, y: 63, zoom: 1.5)
        let pack = MagnetPack(count: 6, cents: 2499, variant: "variant")
        var finishCalls = 0, requestIDs: [String] = [], selection: [[String: Any]] = []
        StubURLProtocol.handler = { request in
            let path = request.url!.path
            if path == "/session" { return ["email": "customer@example.invalid", "owner": false, "mfaRequired": false, "aal": "aal1"] }
            if path == "/experience" {
                let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]
                switch body["action"] as? String {
                case "studio": return ["link": "test-link", "eventId": "00000000-0000-0000-0000-000000000001"]
                case "reserve":
                    requestIDs.append(body["requestId"] as! String)
                    return ["photoId": "00000000-0000-0000-0000-000000000002", "ready": false, "uploadUrl": "https://example.invalid/storage/v1/object/upload/sign/gallery-originals/test"]
                case "finish":
                    finishCalls += 1
                    if finishCalls == 1 { throw URLError(.networkConnectionLost) }
                    return ["status": "approved"]
                default: return [:]
                }
            }
            if path.hasSuffix("/pricing") { return ["currency": "USD", "enabled": true, "packs": [["count": 6, "cents": 2499, "variant": "variant"]]] }
            if path.hasSuffix("/selection") {
                if request.httpMethod == "POST" {
                    let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]
                    selection = body["items"] as! [[String: Any]]
                }
                return ["revision": selection.isEmpty ? 0 : 1, "items": selection]
            }
            if path.hasSuffix("/checkout") { return ["checkoutUrl": "https://www.atelierelunora.com/checkout", "reference": "saved-reference"] }
            throw URLError(.unsupportedURL)
        }
        func model() -> CommerceModel {
            CommerceModel(base: URL(string: "https://example.invalid/")!, network: network, restoresSavedSession: false, fileTransfers: transfers, connectionStore: storage)
        }
        let first = model()
        try await first.accept(CustomerSession(access_token: "test", refresh_token: "test", expires_at: Date().timeIntervalSince1970 + 3600))
        do { _ = try await first.prepareCheckout(entries: [approved], photos: photos.photos, pack: pack, imageStore: photos, consent: true, orderId: "same-order"); XCTFail("Expected interrupted finalization") }
        catch { XCTAssertTrue(error is URLError) }
        XCTAssertEqual(transfers.actualUploads, 1)
        let restored = model()
        XCTAssertEqual(restored.pendingCheckout?.entries, [approved])
        // A changed local draft cannot silently replace the previously approved snapshot.
        photos.order.items = [PhotoDraft(id: approved.id, quantity: 6, x: 99)]
        let receipt = try await restored.resumeCheckout(imageStore: photos)
        XCTAssertEqual(receipt.reference, "saved-reference")
        XCTAssertEqual(selection.first?["x"] as? Double, 27)
        XCTAssertEqual(requestIDs.count, 1)
        XCTAssertEqual(transfers.actualUploads, 1); XCTAssertEqual(transfers.attempts.count, 1)
        XCTAssertNil(restored.pendingCheckout); XCTAssertNil(model().pendingCheckout)
        XCTAssertTrue(transfers.receipts.isEmpty)
    }
    func testLegacySavedConnectionDecodesWithoutPendingUpload() throws {
        let storage = MemoryCustomerConnection()
        storage.data = Data(#"{"auth":{"access_token":"a","refresh_token":"r","expires_at":2000000000},"uploads":{}}"#.utf8)
        let model = CommerceModel(restoresSavedSession: false, connectionStore: storage)
        XCTAssertEqual(model.session?.access_token, "a")
        XCTAssertNil(model.pendingCheckout)
    }
}


@MainActor final class CustomerPreflightRecoveryTests: XCTestCase {
    func testOfflinePreflightKeepsSnapshotAndResumesWithoutRotatingWorkspace() async throws {
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [StubURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); StubURLProtocol.handler = nil }
        let storage = MemoryCustomerConnection(), transfers = ReceiptFileTransfers()
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let photos = PhotoStore(directory: directory)
        photos.save(UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { _ in })
        let draft = PhotoDraft(id: try XCTUnwrap(photos.photos.first).id, quantity: 6)
        let pack = MagnetPack(count: 6, cents: 2499, variant: "variant")
        transfers.failuresRemaining = 1
        var pricingCalls = 0, studioCalls = 0, finishCalls = 0, reserves = 0
        var reservedIDs: [String] = []
        var selection: [[String: Any]] = []
        StubURLProtocol.handler = { request in
            let path = request.url!.path
            if path == "/session" { return ["email": "customer@example.invalid", "owner": false, "mfaRequired": false, "aal": "aal1"] }
            if path == "/experience" {
                let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]
                switch body["action"] as? String {
                case "studio": studioCalls += 1; return ["link": "test-link", "eventId": "00000000-0000-0000-0000-000000000001"]
                case "reserve":
                    reserves += 1; reservedIDs.append(body["requestId"] as! String)
                    return ["photoId": "00000000-0000-0000-0000-000000000002", "ready": false, "uploadUrl": "https://example.invalid/storage/v1/object/upload/sign/gallery-originals/test"]
                case "finish":
                    finishCalls += 1
                    if transfers.actualUploads == 0 { return StubHTTPReply(status: 503, body: ["error": "Could not complete this request. Please retry."]) }
                    return ["status": "approved"]
                default: return [:]
                }
            }
            if path.hasSuffix("/pricing") {
                pricingCalls += 1
                if pricingCalls == 1 { return StubHTTPReply(status: 503, body: ["error": "Could not complete this request. Please retry."]) }
                return ["currency": "USD", "enabled": true, "packs": [["count": 6, "cents": 2499, "variant": "variant"]]]
            }
            if path.hasSuffix("/selection") {
                if request.httpMethod == "POST" {
                    let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(request)) as! [String: Any]; selection = body["items"] as! [[String: Any]]
                }
                return ["revision": selection.isEmpty ? 0 : 1, "items": selection]
            }
            if path.hasSuffix("/checkout") { return ["checkoutUrl": "https://www.atelierelunora.com/checkout", "reference": "recovered"] }
            throw URLError(.unsupportedURL)
        }
        func model() -> CommerceModel { CommerceModel(base: URL(string: "https://example.invalid/")!, network: network, restoresSavedSession: false, fileTransfers: transfers, connectionStore: storage) }
        let first = model()
        try await first.accept(CustomerSession(access_token: "test", refresh_token: "test", expires_at: Date().timeIntervalSince1970 + 3600))
        do { _ = try await first.prepareCheckout(entries: [draft], photos: photos.photos, pack: pack, imageStore: photos, consent: true, orderId: "same-order"); XCTFail("Expected pricing failure") }
        catch { XCTAssertTrue(error.localizedDescription.contains("pricing, 503")) }
        let restored = model(); XCTAssertEqual(restored.pendingCheckout?.entries, [draft])
        do { _ = try await restored.resumeCheckout(imageStore: photos); XCTFail("Expected reservation interruption") } catch { XCTAssertTrue(error is URLError) }
        let receipt = try await model().resumeCheckout(imageStore: photos)
        XCTAssertEqual(receipt.reference, "recovered"); XCTAssertEqual(studioCalls, 1)
        XCTAssertEqual(reserves, 2); XCTAssertEqual(transfers.actualUploads, 1); XCTAssertEqual(finishCalls, 2)
        XCTAssertEqual(reservedIDs.first, reservedIDs.last)
        XCTAssertNil(model().pendingCheckout)
    }
}
