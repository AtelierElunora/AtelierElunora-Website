import Combine
import Foundation
import UIKit
@preconcurrency import ImageCaptureCore

@MainActor final class CameraDiscovery: NSObject, ObservableObject, ICDeviceBrowserDelegate, ICCameraDeviceDelegate {
    @Published var devices: [String] = []
    @Published var status = "Connect the R100 and tap Connect Canon."
    @Published var ready = false
    @Published var busy = false
    @Published var liveImage: UIImage?
    @Published var receivedImage: UIImage?
    @Published var diagnostics: [String] = []
    @Published var experimentalEOS = true
    @Published var liveViewRunning = false
    private let browser = ICDeviceBrowser()
    private var camera: ICCameraDevice?
    private var scanning = false
    private var generation = UUID()
    private var knownFiles = Set<ObjectIdentifier>()
    private var awaitingJPEG = false
    private var captureTimer: Task<Void, Never>?
    private var liveTask: Task<Void, Never>?
    private var liveViewStopping = false
    private var operations = Set<UInt16>()
    private var transaction: UInt32 = 0
    private var commandID: UUID?
    private var commandContinuation: CheckedContinuation<Data, Error>?
    private var commandTimer: Task<Void, Never>?
    private var transfer: Progress?
    private var transferDirectory: URL?
    var canOperate: Bool { ready && !busy && !liveViewRunning && !liveViewStopping && commandID == nil && receivedImage == nil }
    private var eosInitialized = false
    private var eosValues: [UInt32: UInt32] = [:]
    private var eosChoices: [UInt32: [UInt32]] = [:]
    private var restoreLiveOutput: UInt32?

    override init() { super.init(); browser.delegate = self }
    private func note(_ message: String) {
        status = message
        diagnostics.append(message)
        if diagnostics.count > 40 { diagnostics.removeFirst(diagnostics.count - 40) }
    }
    func start() {
        guard !scanning else { return }
        scanning = true; generation = UUID()
        let epoch = generation
        note("Requesting camera access…")
        browser.requestContentsAuthorization { [weak self] _ in
            Task { @MainActor in
                guard let self, self.generation == epoch, self.scanning else { return }
                self.browser.requestControlAuthorization { [weak self] _ in
                    Task { @MainActor in
                        guard let self, self.generation == epoch, self.scanning else { return }
                        self.note("Looking for a Canon USB camera…")
                        self.browser.start()
                    }
                }
            }
        }
    }
    func stop() {
        generation = UUID(); scanning = false; ready = false; busy = false
        captureTimer?.cancel(); liveTask?.cancel(); liveViewRunning = false; liveViewStopping = false; liveImage = nil
        awaitingJPEG = false; transfer?.cancel(); transfer = nil
        if let directory = transferDirectory { try? FileManager.default.removeItem(at: directory) }
        transferDirectory = nil
        if let id = commandID { finishCommand(id, result: .failure(CanonPTP.Failure(message: "Camera session ended."))) }
        camera?.requestCloseSession(); camera?.delegate = nil; camera = nil
        browser.stop(); devices = []; knownFiles = []; operations = []; eosInitialized = false
        eosValues = [:]; eosChoices = [:]; restoreLiveOutput = nil
        // A transferred image awaiting review is retained until the view consumes it.
        note("Canon disconnected. The iPad camera is available.")
    }
    func consumeImage() { receivedImage = nil }
    nonisolated func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        Task { @MainActor [weak self] in self?.handleAddedDevice(browser, device) }
    }
    private func handleAddedDevice(_ browser: ICDeviceBrowser, _ device: ICDevice) {
        devices = (browser.devices ?? []).compactMap { ($0 as? ICCameraDevice)?.name }
        guard camera == nil, let found = device as? ICCameraDevice,
              (found.name ?? "").localizedCaseInsensitiveContains("canon") || (found.name ?? "").localizedCaseInsensitiveContains("r100") else { return }
        camera = found; found.delegate = self
        note("Opening \(found.name ?? "Canon")…"); found.requestOpenSession()
    }
    nonisolated func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        Task { @MainActor [weak self] in self?.handleRemovedDevice(device) }
    }
    private func handleRemovedDevice(_ device: ICDevice) {
        if device === camera { stop() }
    }
    nonisolated func didRemove(_ device: ICDevice) {
        Task { @MainActor [weak self] in self?.handleRemovedDevice(device) }
    }
    nonisolated func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        Task { @MainActor [weak self] in self?.handleOpenedSession(device, error) }
    }
    private func handleOpenedSession(_ device: ICDevice, _ error: Error?) {
        guard device === camera else { return }
        if let error { note("Cannot open Canon: \(error.localizedDescription)"); return }
        note("Session open. Waiting for the camera’s photo catalog…")
    }
    nonisolated func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        Task { @MainActor [weak self] in self?.handleReady(device) }
    }
    private func handleReady(_ device: ICCameraDevice) {
        guard device === camera else { return }
        knownFiles = Set((device.mediaFiles ?? []).map { ObjectIdentifier($0) })
        ready = true; note("Canon ready for testing. Existing card photos will not be imported.")
        diagnostics.append("Capabilities: \(device.capabilities.joined(separator: ", "))")
    }
    nonisolated func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {
        Task { @MainActor [weak self] in self?.handleClosedSession(device) }
    }
    private func handleClosedSession(_ device: ICDevice) {
        guard device === camera else { return }; stop()
    }
    nonisolated func device(_ device: ICDevice, didEncounterError error: Error?) {
        Task { @MainActor [weak self] in self?.handleDeviceError(device, error) }
    }
    private func handleDeviceError(_ device: ICDevice, _ error: Error?) {
        guard device === camera else { return }
        note("Camera error: \(error?.localizedDescription ?? "unknown"). Reconnect or use the iPad camera.")
    }
    nonisolated func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        Task { @MainActor [weak self] in self?.handleItems(camera, items) }
    }
    private func handleItems(_ camera: ICCameraDevice, _ items: [ICCameraItem]) {
        guard camera === self.camera else { return }
        for item in items {
            let fresh = knownFiles.insert(ObjectIdentifier(item)).inserted
            guard fresh, awaitingJPEG, let file = item as? ICCameraFile,
                  ["jpg", "jpeg"].contains(((file.name ?? "") as NSString).pathExtension.lowercased()) else { continue }
            awaitingJPEG = false; captureTimer?.cancel()
            download(file)
            break
        }
    }
    nonisolated func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {}
    nonisolated func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {}
    nonisolated func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {}
    nonisolated func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {}
    nonisolated func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {
        // EOS commands are serialized by send(). EOS capture discovers new card handles
        // directly; ICCameraFile downloads are used only by the physical/standard path.
    }
    nonisolated func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {
        Task { @MainActor [weak self] in
            guard let self, camera === self.camera else { return }
            self.note("Camera capabilities changed.")
        }
    }
    nonisolated func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {
        Task { @MainActor [weak self] in
            guard let self, device === self.camera else { return }
            self.note("Camera access restriction removed. Waiting for catalog readiness…")
        }
    }
    nonisolated func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {
        Task { @MainActor [weak self] in
            guard let self, device === self.camera else { return }
            self.stop(); self.note("Camera access is restricted. Unlock/authorize the camera and reconnect.")
        }
    }
    private func armTransfer() {
        busy = true; awaitingJPEG = true
        let epoch = generation
        captureTimer?.cancel()
        captureTimer = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 25_000_000_000)
            guard !Task.isCancelled, let self, self.generation == epoch, self.awaitingJPEG else { return }
            self.stop()
            self.note("No JPEG arrived. A photo may exist on the card. Check it before taking another; use JPEG mode and reconnect if needed.")
        }
    }
    func receiveNextPhoto() {
        guard canOperate else { return }
        armTransfer(); note("Waiting for one new JPEG. Press the camera’s physical shutter within 25 seconds.")
    }
    func capture() async {
        guard canOperate, camera != nil else { return }
        if !experimentalEOS {
            busy = true
            do {
                operations = try CanonPTP.operations(from: await send(0x1001))
                guard operations.contains(0x100e) else {
                    throw CanonPTP.Failure(message: "Standard PTP capture is not advertised. Try experimental EOS or the physical-shutter test.")
                }
                armTransfer(); _ = try await send(0x100e, [0, 0])
                note("Shutter requested. Waiting for the new JPEG…")
            } catch {
                if !awaitingJPEG && transfer == nil { busy = false }
                note(error.localizedDescription)
            }
            return
        }
        busy = true
        let epoch = generation
        do {
            try await prepareEOS()
            guard operations.contains(0x9128), operations.contains(0x9129) else { throw CanonPTP.Failure(message: "This camera does not advertise EOS remote release.") }
            try await selectCardDestination()
            // Snapshot immediately before this shot: never import an older guest's photo.
            let before = try CanonPTP.handles(await send(0x1007, [0xffffffff, 0, 0]))
            note("Focusing Canon…")
            do {
                _ = try await send(0x9128, [1, 0]) // half press: autofocus
                _ = try await send(0x9128, [2, 0]) // full press: one exposure
                _ = try await send(0x9129, [2])
                _ = try await send(0x9129, [1])
            } catch {
                // Never retry a shutter command: a failed reply can still mean a photo was taken.
                guard generation == epoch else { return }
                _ = try? await send(0x9129, [2]); _ = try? await send(0x9129, [1])
                note("Shutter reply uncertain. Checking the card without taking another photo…")
            }
            guard generation == epoch else { return }
            note("Shutter requested. Looking for the new JPEG on the card…")
            try await receiveCardPhoto(excluding: before, epoch: epoch)
        } catch {
            if generation == epoch { note(error.localizedDescription) }
        }
        if generation == epoch { busy = false }
    }
    func autofocus() async {
        guard canOperate, experimentalEOS else { return }
        busy = true; defer { busy = false }
        do {
            try await prepareEOS()
            guard operations.contains(0x9128), operations.contains(0x9129) else { throw CanonPTP.Failure(message: "EOS focus control is unavailable.") }
            do { _ = try await send(0x9128, [1, 0]) }
            catch { _ = try? await send(0x9129, [1]); throw error }
            _ = try await send(0x9129, [1]); note("Focus cycle requested. Confirm focus on the camera.")
        } catch { note(error.localizedDescription) }
    }
    private func prepareEOS() async throws {
        guard camera != nil, ready else { throw CanonPTP.Failure(message: "Connect the Canon first.") }
        if eosInitialized { return }
        let info = try await send(0x1001)
        operations = try CanonPTP.operations(from: info)
        guard operations.contains(0x9114) else { throw CanonPTP.Failure(message: "EOS remote mode is not advertised.") }
        _ = try await send(0x9114, [1])
        operations = try CanonPTP.operations(from: await send(0x1001))
        guard operations.contains(0x9115), operations.contains(0x9116), operations.contains(0x9110) else {
            throw CanonPTP.Failure(message: "Canon EOS event/property commands are unavailable. Reconnect in still-photo mode.")
        }
        _ = try await send(0x9115, [1])
        if operations.contains(0x9127) {
            for property in [UInt32(0xd11c), 0xd1b0, 0xd1b1] {
                _ = try? await send(0x9127, [property])
            }
        }
        for _ in 0..<10 {
            try await readEOSChanges()
            if eosValues[0xd1b0] != nil, eosValues[0xd11c] != nil { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        eosInitialized = true
        note("Canon remote session initialized.")
    }
    private func readEOSChanges() async throws {
        let changes = try CanonPTP.changes(await send(0x9116))
        eosValues.merge(changes.values) { _, new in new }
        eosChoices.merge(changes.choices) { _, new in new }
    }
    private func setEOS(_ property: UInt32, _ value: UInt32) async throws {
        _ = try await send(0x9110, outData: CanonPTP.property(property, value: value))
        eosValues[property] = value
    }
    private func selectCardDestination() async throws {
        try await readEOSChanges()
        let current = eosValues[0xd11c]
        // 4 is host RAM. Require a reported card destination; do not guess or lose originals.
        let card = eosChoices[0xd11c]?.first(where: { $0 > 0 && $0 < 4 })
            ?? current.flatMap { $0 > 0 && $0 < 4 ? $0 : nil }
        guard let card else { throw CanonPTP.Failure(message: "Canon has no available card destination. Insert an unlocked SD card with free space, then reconnect.") }
        if current != card { try await setEOS(0xd11c, card) }
    }
    private func receiveCardPhoto(excluding before: Set<UInt32>, epoch: UUID) async throws {
        let deadline = Date().addingTimeInterval(35)
        var ignored = Set<UInt32>()
        var lastError: String?
        while Date() < deadline, generation == epoch, !Task.isCancelled {
            do {
                try await readEOSChanges()
                let handles = try CanonPTP.handles(await send(0x1007, [0xffffffff, 0, 0]))
                for handle in handles.subtracting(before).subtracting(ignored).sorted() {
                    let info = try await send(0x1008, [handle])
                    guard let size = try CanonPTP.jpegSize(info) else { ignored.insert(handle); continue }
                    note("New Canon JPEG found. Receiving photo…")
                    var data = Data()
                    // Bounded chunks keep transfers responsive; no deletion or vendor RAM acknowledgement.
                    if operations.contains(0x101b) {
                        let transferDeadline = Date().addingTimeInterval(60)
                        while data.count < Int(size) {
                            guard Date() < transferDeadline, generation == epoch else {
                                throw CanonPTP.Failure(message: "Canon JPEG transfer timed out. The original remains on the card.")
                            }
                            let count = min(UInt32(1024 * 1024), size - UInt32(data.count))
                            let chunk = try await send(0x101b, [handle, UInt32(data.count), count])
                            guard !chunk.isEmpty, chunk.count <= Int(count) else { throw CanonPTP.Failure(message: "Incomplete Canon JPEG transfer.") }
                            data.append(chunk)
                        }
                    } else { data = try await send(0x1009, [handle]) }
                    guard generation == epoch, !Task.isCancelled else { throw CancellationError() }
                    guard data.count == Int(size), let image = UIImage(data: data) else {
                        throw CanonPTP.Failure(message: "Canon JPEG could not be decoded. The original remains on the card.")
                    }
                    receivedImage = image; note("Canon photo received. Review it before submitting.")
                    return
                }
            } catch {
                guard generation == epoch, !Task.isCancelled else { throw error }
                lastError = error.localizedDescription
            }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
        throw CanonPTP.Failure(message: "No new JPEG could be received. Check the SD card, JPEG image quality, single-shot drive and autofocus. No second shot was triggered." + (lastError.map { " Last camera response: \($0)" } ?? ""))
    }
    func startLiveView() async {
        guard canOperate, experimentalEOS else { return }
        busy = true
        do {
            try await prepareEOS()
            guard operations.contains(0x9153), let output = eosValues[0xd1b0] else {
                throw CanonPTP.Failure(message: "The camera does not advertise this live-view protocol. Use its own screen for framing.")
            }
            // Modern EOS bodies use EVF properties, and need not advertise InitiateViewfinder.
            if eosValues[0xd1b1] == 0 { try await setEOS(0xd1b1, 1) }
            restoreLiveOutput = output
            try await setEOS(0xd1b0, output | 2) // route preview to USB host
            note("Starting Canon live preview…")
            liveViewRunning = true; busy = false
            let epoch = generation
            liveTask = Task { [weak self] in
                guard let self else { return }
                var failures = 0
                while !Task.isCancelled, self.generation == epoch, self.liveViewRunning {
                    do {
                        try await self.readEOSChanges()
                        let data = try await self.send(0x9153, [0x00200000, 0, 0])
                        guard let jpeg = CanonPTP.jpeg(in: data), let image = UIImage(data: jpeg) else {
                            throw CanonPTP.Failure(message: "No decodable live-view frame.")
                        }
                        if self.liveImage == nil { self.note("Canon live preview ready.") }
                        self.liveImage = image; failures = 0
                    } catch {
                        failures += 1
                        if failures >= 20 { self.note("Live-view error: \(error.localizedDescription)") }
                    }
                    if failures >= 20 { break }
                    try? await Task.sleep(nanoseconds: 350_000_000)
                }
                guard self.generation == epoch else { return }
                self.liveViewStopping = true; self.liveViewRunning = false
                // Task cancellation stops polling, but cleanup commands must still run.
                let cleanup = Task { @MainActor in
                    guard self.generation == epoch else { return }
                    if let output = self.restoreLiveOutput { try? await self.setEOS(0xd1b0, output) }
                }
                await cleanup.value
                guard self.generation == epoch else { return }
                self.restoreLiveOutput = nil; self.liveImage = nil; self.liveViewStopping = false
            }
        } catch { busy = false; note(error.localizedDescription) }
    }
    func prepareForCapture() async -> Bool {
        stopLiveView()
        if let liveTask { await liveTask.value }
        return !Task.isCancelled && canOperate
    }
    func stopLiveView() {
        guard liveViewRunning else { return }
        liveViewStopping = true; liveTask?.cancel(); liveViewRunning = false
    }
    private func send(_ operation: UInt16, _ parameters: [UInt32] = [], outData: Data? = nil) async throws -> Data {
        try Task.checkCancellation()
        guard let camera, camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanAcceptPTPCommands.rawValue), commandID == nil else { throw CanonPTP.Failure(message: "Camera command unavailable or already in progress.") }
        transaction &+= 1
        let command = CanonPTP.command(operation, transaction: transaction, parameters: parameters)
        let id = UUID()
        return try await withCheckedThrowingContinuation { continuation in
            commandID = id; commandContinuation = continuation
            commandTimer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                guard !Task.isCancelled, let self, self.commandID == id else { return }
                self.finishCommand(id, result: .failure(CanonPTP.Failure(message: "Camera command timed out. Reconnect before trying again.")))
                self.stop()
                self.note(String(format: "Canon command 0x%04X timed out. Reconnect and check the SD card before taking another photo.", operation))
            }
            camera.requestSendPTPCommand(command, outData: outData) { [weak self] data, response, error in
                Task { @MainActor in
                    guard let self, self.commandID == id else { return }
                    do {
                        if let error { throw error }
                        // ImageCaptureCore owns the camera session and delivers this reply
                        // through this request's completion. Its wire transaction ID is not
                        // required to equal our local counter (observed on the R100/iPad).
                        // The commandID guard above rejects late/disconnected completions;
                        // still require a well-formed PTP response and a success result.
                        try CanonPTP.validate(response)
                        self.finishCommand(id, result: .success(data))
                    } catch {
                        self.finishCommand(id, result: .failure(CanonPTP.Failure(message:
                            String(format: "Command 0x%04X: ", operation) + error.localizedDescription)))
                    }
                }
            }
        }
    }
    private func finishCommand(_ id: UUID, result: Result<Data, Error>) {
        guard commandID == id else { return }
        commandTimer?.cancel(); commandID = nil
        let continuation = commandContinuation; commandContinuation = nil
        continuation?.resume(with: result)
    }
    private func download(_ file: ICCameraFile) {
        let epoch = generation
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        catch { busy = false; note("Cannot prepare photo download."); return }
        transferDirectory = directory
        captureTimer = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 45_000_000_000)
            guard !Task.isCancelled, let self, self.generation == epoch else { return }
            self.stop(); self.note("JPEG transfer timed out. Reconnect the camera; the original remains on its card.")
        }
        note("Receiving JPEG from Canon…")
        transfer = file.requestDownload(options: [.downloadsDirectoryURL: directory, .deleteAfterSuccessfulDownload: false]) { [weak self] path, error in
            Task { @MainActor in
                defer { try? FileManager.default.removeItem(at: directory) }
                guard let self, self.generation == epoch else { return }
                self.captureTimer?.cancel(); self.transfer = nil; self.transferDirectory = nil; self.busy = false
                guard error == nil, let path else { self.note("JPEG transfer failed. The original remains on the card."); return }
                let url = path.hasPrefix("/") ? URL(fileURLWithPath: path) : directory.appendingPathComponent(path)
                guard url.standardizedFileURL.path.hasPrefix(directory.path + "/"),
                      let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 40 * 1024 * 1024,
                      let image = UIImage(contentsOfFile: url.path) else {
                    self.note("The downloaded JPEG could not be opened."); return
                }
                self.receivedImage = image
                self.note("Canon photo received. Review it before submitting.")
            }
        }
    }
}
