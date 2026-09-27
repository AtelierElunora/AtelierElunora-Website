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
    @Published var experimentalEOS = false
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
        if let id = commandID { finishCommand(id, result: .failure(CanonPTP.Failure(message: "Camera session ended."))) }
        camera?.requestCloseSession(); camera?.delegate = nil; camera = nil
        browser.stop(); devices = []; knownFiles = []; operations = []; eosInitialized = false
        // A transferred image awaiting review is retained until the view consumes it.
        note("Canon disconnected. The iPad camera is available.")
    }
    func consumeImage() { receivedImage = nil }
    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        devices = (browser.devices ?? []).compactMap { ($0 as? ICCameraDevice)?.name }
        guard camera == nil, let found = device as? ICCameraDevice,
              (found.name ?? "").localizedCaseInsensitiveContains("canon") || (found.name ?? "").localizedCaseInsensitiveContains("r100") else { return }
        camera = found; found.delegate = self
        note("Opening \(found.name ?? "Canon")…"); found.requestOpenSession()
    }
    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        if device === camera { stop() }
    }
    func didRemove(_ device: ICDevice) { if device === camera { stop() } }
    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        guard device === camera else { return }
        if let error { note("Cannot open Canon: \(error.localizedDescription)"); return }
        note("Session open. Waiting for the camera’s photo catalog…")
    }
    func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        guard device === camera else { return }
        knownFiles = Set((device.mediaFiles ?? []).map { ObjectIdentifier($0) })
        ready = true; note("Canon ready for testing. Existing card photos will not be imported.")
        diagnostics.append("Capabilities: \(device.capabilities.joined(separator: ", "))")
    }
    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {
        guard device === camera else { return }; stop()
    }
    func device(_ device: ICDevice, didEncounterError error: Error?) {
        guard device === camera else { return }
        note("Camera error: \(error?.localizedDescription ?? "unknown"). Reconnect or use the iPad camera.")
    }
    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
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
    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {}
    func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {
        // ImageCaptureCore owns object discovery. Do not race it with EOS GetEvent polling.
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
                if !awaitingJPEG { busy = false }
                note(error.localizedDescription)
            }
            return
        }
        busy = true
        do {
            try await prepareEOS()
            guard operations.contains(0x9128), operations.contains(0x9129) else { throw CanonPTP.Failure(message: "This camera does not advertise EOS remote release.") }
            armTransfer()
            do { _ = try await send(0x9128, [3, 0]) }
            catch { _ = try? await send(0x9129, [3]); throw error }
            _ = try await send(0x9129, [3])
            note("EOS autofocus/shutter requested. Waiting for the new JPEG…")
        } catch {
            // Leave an armed transfer waiting: shutter outcome can be uncertain.
            if !awaitingJPEG && transfer == nil { busy = false }
            note(error.localizedDescription)
        }
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
        eosInitialized = true
        note("Experimental EOS remote mode enabled. Power-cycle the camera after testing if local controls remain locked.")
    }
    func startLiveView() async {
        guard canOperate, experimentalEOS else { return }
        busy = true
        do {
            try await prepareEOS()
            guard [UInt16(0x9151), 0x9152, 0x9153].allSatisfy({ operations.contains($0) }) else {
                throw CanonPTP.Failure(message: "The camera does not advertise this live-view protocol. Use its own screen for framing.")
            }
            _ = try await send(0x9151)
            liveViewRunning = true; busy = false
            let epoch = generation
            liveTask = Task { [weak self] in
                guard let self else { return }
                var failures = 0
                while !Task.isCancelled, self.generation == epoch, self.liveViewRunning {
                    do {
                        let data = try await self.send(0x9153, [0x00200000, 0, 0])
                        guard let jpeg = CanonPTP.jpeg(in: data), let image = UIImage(data: jpeg) else {
                            throw CanonPTP.Failure(message: "No decodable live-view frame.")
                        }
                        self.liveImage = image; failures = 0
                    } catch { failures += 1 }
                    if failures >= 3 { break }
                    try? await Task.sleep(nanoseconds: 350_000_000)
                }
                guard self.generation == epoch else { return }
                if failures >= 3 { self.note("Live view unavailable on this configuration. Camera-side framing remains available.") }
                self.liveViewStopping = true; self.liveViewRunning = false
                _ = try? await self.send(0x9152)
                guard self.generation == epoch else { return }
                self.liveImage = nil; self.liveViewStopping = false
            }
        } catch { busy = false; note(error.localizedDescription) }
    }
    func stopLiveView() {
        guard liveViewRunning else { return }
        liveViewStopping = true; liveTask?.cancel(); liveViewRunning = false
    }
    private func send(_ operation: UInt16, _ parameters: [UInt32] = []) async throws -> Data {
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
            }
            camera.requestSendPTPCommand(command, outData: nil) { [weak self] data, response, error in
                Task { @MainActor in
                    guard let self, self.commandID == id else { return }
                    do {
                        if let error { throw error }
                        try CanonPTP.validate(response)
                        self.finishCommand(id, result: .success(data))
                    } catch { self.finishCommand(id, result: .failure(error)) }
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
