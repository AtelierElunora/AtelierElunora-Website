import SwiftUI
import Combine
import Security
import CryptoKit
import VisionKit
import AVFoundation

struct EventInvite: Codable {
    let name: String
    let eventId: String
    let welcome: String
    let moderation: Bool
    let guestLimit: Int
    let closesAt: String
    let studio: Bool
    let uploadLater: Bool
}
struct EventGuestPhoto: Decodable, Identifiable {
    let id: String
    let filename: String
    let status: String?
    let url: String?
}
private struct EventGuestSession: Codable {
    var invite: EventInvite
    var token: String
    var requests: [String: String] = [:]
    var completed: Set<String> = []
    var queued: [String]?
    var failures: [String: String]?
    var retries: [String: Int]?
    var retryAfter: [String: Date]?
}
private struct EventVault: Codable {
    var sessions: [String: EventGuestSession] = [:]
    var active: String?
}
private struct EventPhotoPage: Decodable { let photos: [EventGuestPhoto]; let next: Int? }
private struct EventReservation: Decodable { let ready: Bool?; let uploadUrl: String? }
private struct EventFinished: Decodable { let status: String }
private struct EventJoined: Decodable { let joined: Bool; let eventId: String }

// A QR is an invitation, never a guest session credential. Every installation/profile
// generates its own random session, stored only in this device's Keychain.
@MainActor final class EventUploadModel: ObservableObject {
    let connectivity = Connectivity()
    @Published private(set) var active: EventInvite?
    @Published private(set) var queueRevision = 0
    private var retryTask: Task<Void, Never>?
    private var queueRunning = false
    var hasQueuedUploads: Bool { vault.sessions.values.contains { !($0.queued ?? []).isEmpty } }
    var queuedIDs: [String] { vault.active.flatMap { vault.sessions[$0]?.queued } ?? [] }
    var remainingAllowance: Int { max(0, (active?.guestLimit ?? 0) - max(photos.count, (vault.active.flatMap { vault.sessions[$0]?.completed.count } ?? 0))) }
    var eventClosed: Bool { active.flatMap { CustomerDates.parse($0.closesAt) }.map { $0 <= Date() } ?? false }
    func uploadFailure(_ id: String) -> String? { vault.active.flatMap { vault.sessions[$0]?.failures?[id] } }
    func transferID(_ id: String) -> String { SHA256.hash(data: Data((scope + ":" + (vault.active ?? "") + ":" + id).utf8)).map { String(format: "%02x", $0) }.joined() }
    @Published private(set) var photos: [EventGuestPhoto] = []
    @Published private(set) var busy = false
    @Published var message: String?
    @Published var error: String?
    private var vault = EventVault()
    private var scope = ""
    private var generation = UUID()
    private var network: URLSession
    private let networkFactory: () -> URLSession
    init(networkFactory: @escaping () -> URLSession = { URLSession(configuration: .ephemeral) }) {
        self.networkFactory = networkFactory; self.network = networkFactory()
    }
    private let endpoint = URL(string: "https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/experience")!
    private var query: [String: Any] {
        let digest = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Bundle.main.bundleIdentifier ?? "ElunoraCustomer", kSecAttrAccount as String: "event-guest-v1-" + digest]
    }
    func useProfile(_ identity: String) {
        retryTask?.cancel(); retryTask = nil; queueRunning = false
        generation = UUID(); network.invalidateAndCancel(); network = networkFactory()
        scope = identity.lowercased(); photos = []; active = nil; vault = EventVault(); busy = false; message = nil; error = nil
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data {
            do { vault = try JSONDecoder().decode(EventVault.self, from: data) }
            catch { self.error = "Could not restore your event connection. Reopen the app before joining again." }
        } else if status != errSecItemNotFound { error = "Unlock your phone and reopen the app to restore your event connection." }
        if let key = vault.active { active = vault.sessions[key]?.invite }
    }
    private func persist() throws {
        let data = try JSONEncoder().encode(vault)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; q[kSecValueData as String] = data; q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw CustomerError(message: "Could not save your private event connection.") }; return
        }
        guard status == errSecSuccess else { throw CustomerError(message: "Could not save your private event connection.") }
    }
    static func linkToken(_ text: String) throws -> String {
        guard let u = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), u.scheme == "https",
              ["www.atelierelunora.com", "atelierelunora.com"].contains(u.host ?? ""), u.user == nil, u.password == nil,
              u.port == nil, u.path == "/pages/share-photos", let fragment = u.fragment,
              let parts = URLComponents(string: "https://event.invalid/?" + fragment)?.queryItems,
              parts.filter({ $0.name == "event" }).count == 1,
              let token = parts.first(where: { $0.name == "event" })?.value,
              token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw CustomerError(message: "Scan the Atelier Elunora event QR code or paste its complete sharing link.")
        }
        return token
    }
    private func call<T: Decodable>(_ body: [String: Any]) async throws -> T {
        let current = generation
        var request = URLRequest(url: endpoint); request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("https://www.atelierelunora.com", forHTTPHeaderField: "Origin")
        request.setValue("1", forHTTPHeaderField: "X-Elunora-Request")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await network.data(for: request)
        guard current == generation else { throw CancellationError() }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw CustomerError(message: detail ?? "Could not reach the event. Check your connection and retry.", status: (response as? HTTPURLResponse)?.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func inspect(_ text: String) async throws -> EventInvite {
        let info: EventInvite = try await call(["action": "info", "link": Self.linkToken(text)])
        guard !info.studio, !info.uploadLater else { throw CustomerError(message: "Use an event sharing QR code here. This link belongs to a different upload service.") }
        return info
    }
    func join(_ text: String) async throws {
        guard !busy else { return }
        busy = true; let current = generation
        defer { if current == generation { busy = false } }
        let invite = try await inspect(text)
        // Include the invitation hash so a rotated QR cannot revive an old revoked session.
        let link = try Self.linkToken(text)
        let key = SHA256.hash(data: Data(link.utf8)).map { String(format: "%02x", $0) }.joined()
        if vault.sessions[key] == nil {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw CustomerError(message: "Could not create a secure event connection. Retry.") }
            vault.sessions[key] = EventGuestSession(invite: invite, token: bytes.map { String(format: "%02x", $0) }.joined())
        }
        try persist() // Save before sending: a lost response can safely be retried.
        guard let session = vault.sessions[key] else { return }
        let result: EventJoined = try await call(["action": "join", "link": link, "session": session.token, "consent": true])
        guard result.joined, result.eventId == invite.eventId else { throw CustomerError(message: "The event changed. Scan its QR again.") }
        vault.sessions[key]?.invite = invite; vault.active = key; try persist()
        active = invite; photos = []; message = nil
    }
    func leave() {
        guard !busy, queuedIDs.isEmpty else { error = "Finish or cancel queued uploads before leaving this event."; return }
        let previous = vault.active; vault.active = nil
        do { try persist(); active = nil; photos = []; message = nil }
        catch { vault.active = previous; self.error = error.localizedDescription }
    }
    func refresh() async {
        guard !busy, let key = vault.active, let guest = vault.sessions[key] else { return }
        busy = true; error = nil; photos = []; let current = generation
        defer { if current == generation { busy = false } }
        do {
            var cursor = 0; var result: [EventGuestPhoto] = []
            repeat {
                let page: EventPhotoPage = try await call(["action": "photos", "session": guest.token, "cursor": cursor])
                result += page.photos
                guard let next = page.next, next > cursor, next <= 20000 else { break }
                cursor = next
            } while true
            photos = result
        } catch { if current == generation { self.error = error.localizedDescription } }
    }
    func uploaded(_ id: String) -> Bool { vault.active.flatMap { vault.sessions[$0] }?.completed.contains(id) == true }
    func enqueue(_ selected: [SavedPhoto], store: PhotoStore) async {
        guard let key = vault.active, !eventClosed else { error = "This event is closed for uploads."; return }
        let newIDs = selected.map(\.id).filter { !uploaded($0) && !queuedIDs.contains($0) }
        guard queuedIDs.count + newIDs.count <= remainingAllowance else { error = "This selection exceeds the event’s remaining photo allowance."; return }
        let old = vault
        let combined = queuedIDs + newIDs
        vault.sessions[key]?.queued = combined
        do { try persist(); queueRevision += 1; await resumeQueue(store: store, force: true) }
        catch { vault = old; self.error = error.localizedDescription }
    }
    func cancelQueued(_ id: String) async {
        guard let key = vault.active else { return }
        // Canceling stops retries. A transfer already received by the server may
        // still be present in the event; refresh remains authoritative.
        await BackgroundTransfers.shared.cancel(prefix: transferID(id))
        vault.sessions[key]?.queued?.removeAll { $0 == id }
        vault.sessions[key]?.failures?[id] = nil
        do { try persist(); queueRevision += 1 } catch { self.error = error.localizedDescription }
    }
    func resumeQueue(store: PhotoStore, force: Bool = false) async {
        guard !queueRunning, !busy, connectivity.online, let key = vault.active, let guest = vault.sessions[key], !queuedIDs.isEmpty else { return }
        queueRunning = true; busy = true; let current = generation
        defer { if current == generation { busy = false; queueRunning = false } }
        let ids = queuedIDs
        for (index, id) in ids.enumerated() {
            guard current == generation else { return }
            if !force, let date = vault.sessions[key]?.retryAfter?[id], date > Date() { continue }
            if !force, vault.sessions[key]?.failures?[id] != nil, vault.sessions[key]?.retryAfter?[id] == nil { continue }
            guard queuedIDs.contains(id) else { continue }
            guard let photo = store.photo(id) else {
                var failures = vault.sessions[key]?.failures ?? [:]; failures[id] = "The local photo is missing. Cancel this upload."; vault.sessions[key]?.failures = failures; try? persist(); continue
            }
            message = "Uploading \(index + 1) of \(ids.count)…"
            do {
                let file = try await store.uploadFile(photo)
                guard current == generation, queuedIDs.contains(id) else { return }
                let bytes = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard bytes > 0, bytes <= 15728640 else { throw CustomerError(message: "Choose a smaller photo (15 MB maximum).", status: 400) }
                let requestID = vault.sessions[key]?.requests[id] ?? UUID().uuidString
                vault.sessions[key]?.requests[id] = requestID; try persist()
                let reservation: EventReservation = try await call(["action": "reserve", "session": guest.token, "requestId": requestID, "filename": id + ".jpg", "mime": "image/jpeg", "bytes": bytes])
                if reservation.ready != true {
                    guard let address = reservation.uploadUrl, let url = Self.storageURL(address, upload: true) else { throw CustomerError(message: "The upload address could not be verified.", status: 400) }
                    var put = URLRequest(url: url); put.httpMethod = "PUT"; put.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
                    let status = try await BackgroundTransfers.shared.upload(id: transferID(id), request: put, file: file)
                    guard current == generation else { return }
                    guard (200..<300).contains(status) || status == 409 else { throw CustomerError(message: "Photo upload interrupted. Retry this photo.", status: status) }
                }
                guard queuedIDs.contains(id) else { continue }
                let finished: EventFinished = try await call(["action": "finish", "session": guest.token, "requestId": requestID])
                guard ["approved", "pending"].contains(finished.status) else { throw CustomerError(message: "This photo is no longer available for sharing.", status: 403) }
                vault.sessions[key]?.completed.insert(id)
                vault.sessions[key]?.queued?.removeAll { $0 == id }
                vault.sessions[key]?.failures?[id] = nil; vault.sessions[key]?.retryAfter?[id] = nil
                try persist(); BackgroundTransfers.shared.acknowledge(transferID(id)); queueRevision += 1
            } catch {
                guard current == generation else { return }
                let attempt = (vault.sessions[key]?.retries?[id] ?? 0) + 1
                var retries = vault.sessions[key]?.retries ?? [:]; retries[id] = attempt; vault.sessions[key]?.retries = retries
                var failures = vault.sessions[key]?.failures ?? [:]; failures[id] = error.localizedDescription; vault.sessions[key]?.failures = failures
                if UploadRetryPolicy.retryable(status: (error as? CustomerError)?.status) {
                    var dates = vault.sessions[key]?.retryAfter ?? [:]; dates[id] = Date().addingTimeInterval(UploadRetryPolicy.delay(attempt: attempt)); vault.sessions[key]?.retryAfter = dates
                } else { vault.sessions[key]?.retryAfter?[id] = nil }
                do { try persist() } catch { self.error = "Could not save upload recovery state. Keep the app open and retry." }
                queueRevision += 1
            }
        }
        guard current == generation else { return }
        busy = false
        message = queuedIDs.isEmpty ? "Your photos have been shared with the event." : "Pending photos are saved for retry."
        await refresh()
        retryTask?.cancel()
        if let next = vault.sessions[key]?.retryAfter?.values.min(), !queuedIDs.isEmpty {
            let delay = max(2, next.timeIntervalSinceNow)
            retryTask = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                guard let self, self.generation == current else { return }
                await self.resumeQueue(store: store)
            }
        }
    }
    static func storageURL(_ address: String, upload: Bool) -> URL? {
        guard let url = URL(string: address), url.scheme == "https", url.host == "gefdlubvqymyxrguhtnc.supabase.co", url.user == nil, url.password == nil, url.port == nil,
              url.path.hasPrefix(upload ? "/storage/v1/object/upload/sign/gallery-originals/" : "/storage/v1/object/sign/gallery-previews/") else { return nil }
        return url
    }
}

struct EventUploadPage: View {
    @Environment(\.dynamicTypeSize) private var textSize
    var initialLink: String? = nil
    @ObservedObject private var transfers = BackgroundTransfers.shared
    @EnvironmentObject private var event: EventUploadModel
    @EnvironmentObject private var store: PhotoStore
    @EnvironmentObject private var commerce: CommerceModel
    @State private var link = ""
    @State private var invite: EventInvite?
    @State private var inspectedLink = ""
    @State private var consent = false
    @State private var checking = false
    @State private var scanner = false
    @State private var capturing = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection: Set<String> = []
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 20) {
            BrandHeading(title: event.active?.name ?? "Share the celebration.")
            if let active = event.active {
                Label("Sharing with \(active.name)", systemImage: "lock.shield")
                if let closes = CustomerDates.parse(active.closesAt) { Text("\(event.eventClosed ? "Closed" : "Closes") \(closes.formatted(date: .abbreviated, time: .shortened))").font(.footnote) }
                Text("\(event.remainingAllowance) of \(active.guestLimit) uploads remaining").font(.subheadline)
                if event.eventClosed { Text("The upload deadline has passed. You can still view your available submissions.").font(.footnote) }
                if !event.queuedIDs.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Upload queue").font(.headline)
                        ForEach(event.queuedIDs, id: \.self) { id in
                            VStack(alignment: .leading) {
                                ProgressView(value: transfers.progress[event.transferID(id)] ?? 0)
                                Text(event.uploadFailure(id) ?? "Queued or transferring").font(.footnote)
                                Button("Cancel this upload") { Task { await event.cancelQueued(id) } }
                            }
                        }
                        Button("Retry pending photos") { Task { await event.resumeQueue(store: store, force: true) } }.disabled(event.busy)
                    }
                }
                Text("Only photos you upload through this app’s event connection appear here. The host can review your submissions.").brandFont(size: 13, relativeTo: .footnote)
                Button("Take or import photos") { capturing = true }.disabled(event.busy)
                Text("Choose photos to share").brandFont(.emphasis)
                if store.photos.isEmpty { Text("Take or import photos first, then return here to select them.") }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: textSize.isAccessibilitySize ? 1 : 2)) {
                    ForEach(store.photos) { photo in
                        Button {
                            if selection.contains(photo.id) { selection.remove(photo.id) } else { selection.insert(photo.id) }
                        } label: {
                            VStack {
                                LocalPhotoImage(photo: photo).frame(height: 130)
                                Label(event.uploaded(photo.id) ? "Uploaded" : selection.contains(photo.id) ? "Selected" : "Select", systemImage: event.uploaded(photo.id) || selection.contains(photo.id) ? "checkmark.circle.fill" : "circle")
                            }.frame(maxWidth: .infinity).contentShape(Rectangle())
                        }.buttonStyle(.bordered).disabled(event.busy || event.uploaded(photo.id) || event.queuedIDs.contains(photo.id) || event.eventClosed)
                    }
                }
                Button("Upload \(selection.count) selected photos") {
                    let chosen = store.photos.filter { selection.contains($0.id) }
                    Task { await event.enqueue(chosen, store: store); selection = selection.filter { !event.uploaded($0) && !event.queuedIDs.contains($0) } }
                }.buttonStyle(CustomerPrimaryButtonStyle()).foregroundStyle(ivory).disabled(event.busy || selection.isEmpty || event.eventClosed)
                if let message = event.message { Text(message).brandFont(size: 13, relativeTo: .footnote) }
                Divider()
                HStack { Text("Your event photos").brandFont(.emphasis); Spacer(); Button("Refresh") { Task { await event.refresh() } }.disabled(event.busy) }
                if event.photos.isEmpty && !event.busy { Text("Your uploaded photos will appear here.").brandFont(size: 13, relativeTo: .footnote) }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: textSize.isAccessibilitySize ? 1 : 2)) {
                    ForEach(event.photos) { photo in
                        VStack {
                            EventPreview(address: photo.url).frame(height: 150).clipped()
                            Text(photo.status == "pending" ? "Awaiting host review" : "Shared").brandFont(size: 12, relativeTo: .caption)
                        }
                    }
                }
                Button("Leave event", role: .destructive) { event.leave(); selection = [] }.disabled(event.busy || !event.queuedIDs.isEmpty)
            } else {
                Text("Scan the event’s QR code to share photos with your host. Other guests’ uploads stay private.")
                Button { Task { await openScanner() } } label: { Label("Scan event QR", systemImage: "qrcode.viewfinder") }.buttonStyle(CustomerPrimaryButtonStyle()).foregroundStyle(ivory).disabled(checking)
                TextField("Or paste the event sharing link", text: $link).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
                Button("Find event") { Task { await inspect(link) } }.disabled(checking || link.isEmpty)
                if checking { ProgressView("Checking event…") }
                if let invite {
                    Text(invite.name).brandFont(.heading, size: 22, relativeTo: .title2)
                    if !invite.welcome.isEmpty { Text(invite.welcome) }
                    Text("Up to \(invite.guestLimit) photos. \(invite.moderation ? "Uploads are reviewed by the host." : "Uploads are shared with the host immediately.")").brandFont(size: 13, relativeTo: .footnote)
                    Toggle("I have permission to share these photos with the event host for this event.", isOn: $consent)
                    Button("Join event") {
                        Task {
                            do { try await event.join(inspectedLink); self.invite = nil; link = ""; consent = false; await event.refresh() }
                            catch { event.error = error.localizedDescription }
                        }
                    }.buttonStyle(CustomerPrimaryButtonStyle()).foregroundStyle(ivory).disabled(!consent || event.busy || link != inspectedLink)
                }
            }
            if event.busy { ProgressView("Connecting…") }
            if let error = event.error { Text(error).foregroundStyle(.red).brandFont(size: 13, relativeTo: .footnote) }
        }.padding(24) }.background(ivory).foregroundStyle(olive)
            .navigationTitle("Event sharing").navigationBarTitleDisplayMode(.inline)
            .task { if let initialLink { link = initialLink; await inspect(initialLink) }; await event.refresh(); await event.resumeQueue(store: store) }
            .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await event.refresh() } } }
            .sheet(isPresented: $capturing) {
                VStack(spacing: 0) {
                    HStack { Spacer(); Button("Done") { capturing = false }.padding() }
                    CapturePage()
                }
            }
            .onChange(of: commerce.session?.email) { _, _ in invite = nil; link = ""; consent = false; selection = [] }
            .sheet(isPresented: $scanner) { NavigationStack {
                EventQRScanner { value in scanner = false; link = value; Task { await inspect(value) } }
                    .navigationTitle("Scan event QR").toolbar { Button("Cancel") { scanner = false } }
            } }
    }
    private func inspect(_ value: String) async {
        checking = true; invite = nil; consent = false; event.error = nil
        defer { checking = false }
        do { let found = try await event.inspect(value); inspectedLink = value; invite = found }
        catch { event.error = error.localizedDescription }
    }
    private func openScanner() async {
        var allowed = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined { allowed = await AVCaptureDevice.requestAccess(for: .video) }
        guard allowed, DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
            event.error = "QR scanning is unavailable. Allow camera access in Settings, or paste the event link above."; return
        }
        scanner = true
    }
}

private struct EventPreview: View {
    let address: String?
    @State private var image: UIImage?
    @State private var failed = false
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit() }
            else if failed { Text("Tap Refresh to reload preview").brandFont(size: 12, relativeTo: .caption) }
            else { ProgressView() }
        }.task(id: address) {
            image = nil; failed = false
            guard let address, let url = EventUploadModel.storageURL(address, upload: false) else { failed = true; return }
            let session = URLSession(configuration: .ephemeral)
            defer { session.invalidateAndCancel() }
            do {
                let (data, response) = try await session.data(from: url)
                try Task.checkCancellation()
                guard (response as? HTTPURLResponse)?.statusCode == 200, let decoded = UIImage(data: data) else { failed = true; return }
                image = decoded
            } catch { failed = true }
        }
    }
}

private struct EventQRScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, recognizesMultipleItems: false, isGuidanceEnabled: true, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        do { try scanner.startScanning() } catch { context.coordinator.failed(scanner) }
        return scanner
    }
    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) { controller.stopScanning() }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        var delivered = false
        init(found: @escaping (String) -> Void) { self.found = found }
        func failed(_ scanner: DataScannerViewController) {
            guard !delivered else { return }; delivered = true
            DispatchQueue.main.async { self.found("") }
        }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !delivered else { return }
            for item in addedItems { if case .barcode(let code) = item, let value = code.payloadStringValue {
                delivered = true; dataScanner.stopScanning(); found(value); return
            } }
        }
        func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) { failed(dataScanner) }
    }
}
