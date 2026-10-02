import SwiftUI
import UIKit
import AVFoundation
import CoreText
import Combine

private enum Atelier {
    static let olive = Color(red: 74/255, green: 75/255, blue: 54/255)
    static let cream = Color(red: 244/255, green: 242/255, blue: 239/255)
    static let ivory = Color(red: 231/255, green: 229/255, blue: 217/255)
    static let sand = Color(red: 214/255, green: 210/255, blue: 188/255)
    static let gold = Color(red: 177/255, green: 154/255, blue: 115/255)
}

private struct AtelierButton: ButtonStyle {
    var secondary = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .rounded)).tracking(0.3)
            .padding(.horizontal, 28).padding(.vertical, 17)
            .frame(minHeight: 56)
            .foregroundStyle(secondary ? Atelier.olive : Atelier.cream)
            .background(secondary ? Atelier.cream : Atelier.olive)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Atelier.olive.opacity(secondary ? 0.3 : 0), lineWidth: 1))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
    }
}

struct BoothCaptureView: View {
    @ObservedObject var capture: CaptureModel
    @Binding var locked: Bool
    let requestUnlock: () -> Void
    let closeBooth: () -> Void
    @StateObject private var cameras = CameraDiscovery()
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingSetup = false
    @State private var showingCamera = false
    @State private var requestingCamera = false
    @State private var cameraError: String?
    @State private var testMode = false
    @State private var useCanon = false
    @AppStorage("captureCountdownSeconds") private var countdownSeconds = 5
    @AppStorage("captureFrontCamera") private var frontCamera = true
    @StateObject private var countdown = CaptureCountdown()
    @State private var preparingCapture = false
    @State private var prepareTask: Task<Void, Never>?
    @State private var captureAttempt = UUID()
    private var captureLocked: Bool { preparingCapture || countdown.isRunning || requestingCamera || showingCamera }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    header
                    Rectangle().fill(Atelier.sand).frame(height: 1).padding(.top, 24)
                    VStack(spacing: 22) {
                        eventBadge.padding(.top, 28)
                        VStack(spacing: 10) {
                            Text(capture.pending == nil ? "A moment to keep." : "A memory worth keeping.")
                                .brandFont(.heading, size: 48, relativeTo: .largeTitle).multilineTextAlignment(.center)
                            Text(capture.pending == nil ? "Take a photo to create a keepsake from your celebration." : "Take a look, then send your photo to be made into a magnet.")
                                .font(.body).multilineTextAlignment(.center).frame(maxWidth: 570)
                        }
                        photoStage(maxHeight: geometry.size.height > 800 ? 400 : 280)
                        VStack(spacing: 16) {
                            if capture.busy {
                                ProgressView("Sending your memory…").tint(Atelier.olive)
                            }
                            actions
                            if useCanon {
                                Text(cameras.status).font(.callout).multilineTextAlignment(.center)
                                if cameras.liveViewRunning {
                                    Button("Stop live view") { cameras.stopLiveView() }
                                        .disabled(captureLocked)
                                } else if capture.canCapture {
                                    Button("Start live preview") { Task { await cameras.startLiveView() } }
                                        .disabled(!cameras.canOperate || captureLocked)
                                }
                                Button("Use iPad camera") { cameras.stop(); useCanon = false }
                                    .disabled(capture.busy || captureLocked || cameras.busy)
                            }
                            Text(capture.notice)
                                .font(.callout).multilineTextAlignment(.center)
                                .frame(maxWidth: 650).fixedSize(horizontal: false, vertical: true)
                                .accessibilityAddTraits(.updatesFrequently)
                        }
                        footer.padding(.top, 12)
                    }
                }
                .padding(.horizontal, geometry.size.width > 650 ? 44 : 22)
                .padding(.vertical, 26).frame(maxWidth: 1040)
                .frame(maxWidth: .infinity)
            }
            .background(Atelier.cream.ignoresSafeArea())
            .foregroundStyle(Atelier.olive)
        }
        .onReceive(cameras.$receivedImage) { image in
            guard let image else { return }
            // Published emits before storage changes; consume on the next actor turn.
            Task { @MainActor in
                guard cameras.receivedImage === image, capture.canCapture else { return }
                if capture.acceptPhoto(image) { cameras.consumeImage() }
            }
        }
        .onChange(of: cameras.ready) { _, ready in
            if !ready { cancelCountdown(); useCanon = false }
            else if capture.canCapture { useCanon = true }
        }
        .onChange(of: useCanon) { _, enabled in
            if enabled {
                testMode = false
                Task { await cameras.startLiveView() }
            } else { cameras.stopLiveView() }
        }
        .onChange(of: capture.pending == nil) { _, empty in
            if empty, useCanon, scenePhase == .active { Task { await cameras.startLiveView() } }
        }
        .sheet(isPresented: $showingSetup) { if !locked { setupSheet.interactiveDismissDisabled(captureLocked) } }
        .onChange(of: locked) { _, value in if value { showingSetup = false } }
        .fullScreenCover(isPresented: $showingCamera) {
            IPadCamera(seconds: CaptureCountdown.validatedDelay(countdownSeconds), frontCamera: frontCamera) { image in
                showingCamera = false
                if let image { capture.acceptPhoto(image) }
            }.ignoresSafeArea()
        }
        .alert("Camera unavailable", isPresented: Binding(get: { cameraError != nil }, set: { if !$0 { cameraError = nil } })) {
            Button("OK", role: .cancel) { cameraError = nil }
            if !locked { Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            } }
        } message: { Text(cameraError ?? "Please try again.") }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { cancelCountdown(); showingCamera = false }
            if phase == .background { cameras.stop(); locked = true; showingSetup = false }
        }
        .onDisappear { cancelCountdown(); cameras.stop() }
        .overlay {
            if countdown.isRunning || preparingCapture {
                ZStack {
                    Atelier.cream.opacity(useCanon && cameras.liveImage != nil ? 0.30 : 0.96).ignoresSafeArea()
                    VStack(spacing: 24) {
                        Text("ATELIER ELUNORA").brandFont(.emphasis, size: 26, relativeTo: .title2).tracking(3)
                        Text(preparingCapture ? "Getting ready…" : "A moment to keep.")
                            .font(.custom("EdwardianScriptITCPro-Regular", size: 48))
                        if let remaining = countdown.remaining {
                            Text(String(remaining)).font(.system(size: 128, weight: .light, design: .rounded))
                                .monospacedDigit().accessibilityLabel("Photo in \(remaining) seconds")
                                .accessibilityAddTraits(.updatesFrequently)
                        } else { ProgressView() }
                        Text("Look at the camera and smile.")
                        Button("Cancel") { cancelCountdown() }.buttonStyle(AtelierButton(secondary: true))
                    }.padding(24).background(Atelier.cream.opacity(0.88), in: RoundedRectangle(cornerRadius: 16))
                        .foregroundStyle(Atelier.olive)
                }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 18) {
            HStack {
                Label(testMode ? "TEST EXPERIENCE" : (useCanon ? "CANON · EXPERIMENTAL" : "IPAD CAMERA"), systemImage: testMode ? "sparkles" : "camera")
                    .font(.caption2.weight(.semibold)).tracking(1.4)
                Spacer()
                Button { if locked { requestUnlock() } else { showingSetup = true } } label: {
                    Label(locked ? "Owner controls" : "Station setup", systemImage: locked ? "lock" : "slider.horizontal.3")
                        .font(.callout).padding(.vertical, 12)
                }.disabled(captureLocked).accessibilityHint("Open event connection and camera controls")
            }
            VStack(spacing: 8) {
                Image("AEMonogram").resizable().scaledToFit()
                    .frame(width: 76, height: 76).accessibilityHidden(true)
                Text("ATELIER ELUNORA")
                    .brandFont(.emphasis, size: 24, relativeTo: .title).tracking(3)
                    .multilineTextAlignment(.center)
                Text("MOMENTS, MADE TANGIBLE")
                    .font(.caption2.weight(.medium)).tracking(2.2)
            }.padding(.vertical, 6)
        }
    }

    private var eventBadge: some View {
        Label(capture.eventName.isEmpty ? "Your keepsake studio" : capture.eventName,
              systemImage: capture.eventName.isEmpty ? "heart" : "checkmark.circle")
            .font(.subheadline).multilineTextAlignment(.center)
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(Atelier.ivory, in: Capsule())
    }

    private func photoStage(maxHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            if let image = capture.preview {
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(maxWidth: .infinity).frame(maxHeight: maxHeight)
                    .padding(16).accessibilityLabel("Your photo preview")
            } else if useCanon, let image = cameras.liveImage {
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(maxWidth: .infinity).frame(maxHeight: maxHeight).padding(16)
                    .accessibilityLabel("Canon live preview")
            } else {
                VStack(spacing: 18) {
                    Image(systemName: "camera.aperture")
                        .font(.system(size: 54, weight: .ultraLight)).accessibilityHidden(true)
                    Text(useCanon ? "Canon preview" : "Every celebration has a story.")
                        .brandFont(.heading, size: 26, relativeTo: .title2).multilineTextAlignment(.center)
                    Text(useCanon ? cameras.status : "Let’s make a little piece of yours.")
                        .font(.body).multilineTextAlignment(.center)
                }
                .padding(32).frame(maxWidth: .infinity)
                .frame(minHeight: maxHeight * 0.75)
                .background(Atelier.ivory)
            }
            HStack(spacing: 8) {
                Image(systemName: capture.preview == nil ? "camera" : "photo")
                Text(capture.preview == nil ? (testMode ? "Test-photo mode" : (useCanon ? "Canon · Ready for your moment" : "iPad camera · Ready when you are")) : (capture.previewIsTest ? "Test photo · Preview before sending" : "Your photo · Preview before sending"))
                    .font(.footnote)
            }.padding(14).frame(maxWidth: .infinity).background(Atelier.cream)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Atelier.sand, lineWidth: 1))
        .shadow(color: Atelier.olive.opacity(0.06), radius: 18, x: 0, y: 8)
        .frame(maxWidth: 760)
    }

    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) { actionButtons }
            VStack(spacing: 14) { actionButtons }
        }.disabled(capture.busy)
    }

    @ViewBuilder private var actionButtons: some View {
        if capture.pending == nil {
            Button {
                beginCapture()
            } label: {
                Label(testMode ? "Create test photo" : "Capture", systemImage: "camera")
            }.buttonStyle(AtelierButton()).disabled(!capture.canCapture || captureLocked || cameras.busy || (useCanon && !cameras.canOperate && !cameras.liveViewRunning))
        } else {
            if capture.pending?.attempted != true {
                Button { capture.retake() } label: {
                    Label("Try again", systemImage: "arrow.counterclockwise")
                }.buttonStyle(AtelierButton(secondary: true))
            }
            Button { Task { await capture.submit() } } label: {
                Label(capture.pending?.attempted == true ? "Retry sending photo" : "Approve & send photo",
                      systemImage: capture.pending?.attempted == true ? "arrow.clockwise" : "checkmark")
            }.buttonStyle(AtelierButton())
        }
    }

    private var footer: some View {
        VStack(spacing: 12) {
            Rectangle().fill(Atelier.gold).frame(width: 42, height: 1)
            Text("CAPTURE  ·  CREATE  ·  CHERISH")
                .font(.caption2.weight(.medium)).tracking(2)
            if capture.pending != nil {
                Text("Approved photos go to your event gallery and print queue.")
                    .font(.footnote).multilineTextAlignment(.center)
            }
        }.padding(.bottom, 12)
    }

    @MainActor private func cancelCountdown() {
        captureAttempt = UUID(); prepareTask?.cancel(); prepareTask = nil
        countdown.cancel(); preparingCapture = false
    }

    @MainActor private func beginCapture() {
        guard capture.canCapture, !captureLocked, !cameras.busy else { return }
        if !testMode && !useCanon {
            Task { await openCamera() }
            return
        }
        let canon = useCanon && !testMode
        let epoch = UUID(); captureAttempt = epoch; preparingCapture = true
        prepareTask = Task { @MainActor in
            guard captureAttempt == epoch, !Task.isCancelled, scenePhase == .active else { return }
            preparingCapture = false
            countdown.start(seconds: countdownSeconds) {
                guard captureAttempt == epoch, scenePhase == .active, capture.canCapture else { return }
                if canon {
                    guard useCanon else { return }
                    // Reserve the UI until capture() marks the camera busy.
                    preparingCapture = true
                    prepareTask = Task { @MainActor in
                        // Keep preview visible through the countdown. Drain its last command
                        // and restore camera output immediately before the still exposure.
                        let ready = await cameras.prepareForCapture()
                        guard captureAttempt == epoch, !Task.isCancelled else { return }
                        preparingCapture = false
                        guard ready else {
                            cameraError = "Canon is not ready. Reconnect it or select the iPad camera."
                            return
                        }
                        await cameras.capture()
                    }
                } else { capture.makeTestPhoto() }
            }
        }
    }

    @MainActor private func openCamera() async {
        guard capture.canCapture, !requestingCamera else { return }
        requestingCamera = true; defer { requestingCamera = false }
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            cameraError = "This device has no available camera. Camera capture requires a physical iPad."; return
        }
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: allowed = true
        case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
        default: allowed = false
        }
        guard allowed else {
            cameraError = "Allow camera access in Settings to use the iPad camera."; return
        }
        guard scenePhase == .active, capture.canCapture else { return }
        showingCamera = true
    }

    private var setupSheet: some View {
        NavigationStack {
            Form {
                Section("Booth mode") {
                    Button("Lock booth for guests") { showingSetup = false; locked = true }
                    Button("Return to owner dashboard") { showingSetup = false; closeBooth() }.disabled(capture.busy || cameras.busy)
                    Text("Owner controls require a fresh authenticator code after locking. Use iOS Guided Access as well to keep guests inside this app.").font(.footnote)
                }
                Section("Capture camera") {
                    Toggle("Use connected Canon (experimental)", isOn: $useCanon)
                        .disabled(!cameras.ready || cameras.busy || capture.pending != nil || capture.busy)
                    Label("iPad camera · Default and backup", systemImage: "ipad")
                    Picker("iPad lens", selection: $frontCamera) {
                        Text("Front (selfie)").tag(true)
                        Text("Rear").tag(false)
                    }
                    Picker("Capture countdown", selection: $countdownSeconds) {
                        Text("Off").tag(0)
                        Text("3 seconds").tag(3)
                        Text("5 seconds").tag(5)
                        Text("10 seconds").tag(10)
                    }
                    Text("Canon preview starts in the photo box when connected and stays on during the countdown. Tap Capture once to focus, take one photo, and receive the JPEG for review. The iPad camera opens its own preview and countdown.").font(.footnote)
                    Toggle("Use generated test photos", isOn: $testMode)
                        .disabled(capture.busy || capture.pending != nil || useCanon)
                }
                Section("Event connection") {
                    SecureField("Paste capture station link", text: $capture.link)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .disabled(capture.busy || capture.pending != nil || cameras.busy)
                    Button("Connect event") { Task { await capture.connect() } }
                        .disabled(capture.busy || capture.pending != nil || cameras.busy)
                    if !capture.eventName.isEmpty { Label(capture.eventName, systemImage: "checkmark.circle") }
                    Text("Approved photos enter this event’s gallery and print queue. Use a test event while checking the app.")
                        .font(.footnote)
                    if capture.pending != nil {
                        Text("Finish the current photo before switching events.").font(.footnote)
                    }
                    Text(capture.notice).font(.callout).accessibilityAddTraits(.updatesFrequently)
                }
                Section("Canon connection") {
                    Text(cameras.status)
                    ForEach(Array(cameras.devices.enumerated()), id: \.offset) { _, name in
                        Label(name, systemImage: "camera")
                    }
                    Button("Connect Canon") { cameras.start() }.disabled(cameras.busy)
                    Button("Disconnect Canon / use iPad") { cameras.stop(); useCanon = false }
                    Toggle("Canon EOS control (recommended for R100)", isOn: $cameras.experimentalEOS)
                        .disabled(cameras.busy || cameras.liveViewRunning)
                    Button("Receive next JPEG from physical shutter") { useCanon = true; testMode = false; cameras.receiveNextPhoto() }
                        .disabled(!cameras.canOperate || !capture.canCapture)
                    Button("Request autofocus") { Task { await cameras.autofocus() } }
                        .disabled(!cameras.canOperate || !cameras.experimentalEOS || !capture.canCapture)
                    Button(cameras.liveViewRunning ? "Stop live view" : "Start experimental live view") {
                        if cameras.liveViewRunning { cameras.stopLiveView() }
                        else { Task { await cameras.startLiveView() } }
                    }.disabled(cameras.busy || !cameras.ready || !cameras.experimentalEOS || !capture.canCapture)
                    Text("Use still-photo mode, JPEG or RAW+JPEG, an unlocked SD card with space, and single-shot drive. EOS capture keeps the original on the card. If no JPEG arrives, check the card and Connection diagnostics before trying another shot. This build needs R100 hardware verification.").font(.footnote)
                    if cameras.receivedImage != nil {
                        Button("Retry loading received photo") {
                            if let image = cameras.receivedImage, capture.acceptPhoto(image) { cameras.consumeImage() }
                        }.disabled(!capture.canCapture)
                    }
                    DisclosureGroup("Connection diagnostics") {
                        Text(cameras.diagnostics.joined(separator: "\n")).font(.caption.monospaced()).textSelection(.enabled)
                    }
                }
                Section {
                    Text("Atelier Elunora · Capture prototype").font(.footnote)
                }
            }
            .disabled(captureLocked)
            .scrollContentBackground(.hidden).background(Atelier.cream)
            .foregroundStyle(Atelier.olive).tint(Atelier.olive)
            .navigationTitle("Station setup").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showingSetup = false }
                }
            }
        }.preferredColorScheme(.light)
    }
}


// A custom overlay keeps guest capture to one tap; UIKit returns the still directly
// to our existing review screen when its default camera controls are hidden.
@MainActor private struct IPadCamera: UIViewControllerRepresentable {
    var seconds: Int
    var frontCamera: Bool
    var completion: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(seconds: seconds, completion: completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.allowsEditing = false
        picker.showsCameraControls = false
        let preferred: UIImagePickerController.CameraDevice = frontCamera ? .front : .rear
        if UIImagePickerController.isCameraDeviceAvailable(preferred) { picker.cameraDevice = preferred }
        picker.delegate = context.coordinator
        context.coordinator.attach(to: picker)
        return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    static func dismantleUIViewController(_ controller: UIImagePickerController, coordinator: Coordinator) {
        coordinator.invalidate(); controller.delegate = nil; controller.cameraOverlayView = nil
    }
    @MainActor final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let seconds: Int
        private let completion: (UIImage?) -> Void
        private let countdown = CaptureCountdown()
        private weak var picker: UIImagePickerController?
        private var observation: AnyCancellable?
        private var inactiveObserver: AnyCancellable?
        private var warmup: Task<Void, Never>?
        private var watchdog: Task<Void, Never>?
        private var finished = false
        private var fired = false
        init(seconds: Int, completion: @escaping (UIImage?) -> Void) {
            self.seconds = seconds; self.completion = completion
        }
        func attach(to picker: UIImagePickerController) {
            self.picker = picker
            let overlay = CameraCountdownOverlay(frame: picker.view.bounds)
            overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            overlay.onAppear = { [weak self, weak overlay] in self?.start(overlay: overlay) }
            overlay.onCancel = { [weak self] in self?.finish(nil) }
            observation = countdown.$remaining.sink { [weak overlay] remaining in
                guard let remaining else { return }
                overlay?.number.text = String(remaining)
                overlay?.caption.text = "Look at the camera and smile."
                UIAccessibility.post(notification: .announcement, argument: String(remaining))
            }
            inactiveObserver = NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
                .sink { [weak self] _ in self?.finish(nil) }
            picker.cameraOverlayView = overlay
        }
        private func start(overlay: CameraCountdownOverlay?) {
            guard warmup == nil, !finished else { return }
            warmup = Task { @MainActor [weak self, weak overlay] in
                // Allow presentation/layout to settle before the full guest countdown.
                do { try await Task.sleep(nanoseconds: 700_000_000) } catch { return }
                guard let self, !self.finished, self.picker?.view.window != nil,
                      UIApplication.shared.applicationState == .active else { return }
                self.countdown.start(seconds: self.seconds) { [weak self, weak overlay] in
                    guard let self, !self.finished, !self.fired,
                          let picker = self.picker, picker.view.window != nil,
                          UIApplication.shared.applicationState == .active else { return }
                    self.fired = true
                    overlay?.number.text = "Smile!"
                    overlay?.caption.text = "Taking your photo…"
                    // Cancel after firing discards the result; it never starts another exposure.
                    picker.takePicture()
                    self.watchdog = Task { @MainActor [weak self, weak overlay] in
                        do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
                        guard let self, !self.finished else { return }
                        overlay?.number.text = "Please retry"
                        overlay?.caption.text = "The camera did not return a photo. Tap Cancel, then Capture again."
                    }
                }
            }
        }
        func invalidate() {
            finished = true; countdown.cancel(); warmup?.cancel(); watchdog?.cancel()
            observation = nil; inactiveObserver = nil
        }
        private func finish(_ image: UIImage?) {
            guard !finished else { return }
            invalidate(); completion(image)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { finish(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            finish(info[.originalImage] as? UIImage)
        }
    }
}

@MainActor private final class CameraCountdownOverlay: UIView {
    let number = UILabel()
    let caption = UILabel()
    var onAppear: (() -> Void)?
    var onCancel: (() -> Void)?
    private var appeared = false
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        let brand = UILabel()
        brand.text = "ATELIER ELUNORA"
        brand.font = UIFont(name: "BrownCarolinaSans", size: 25) ?? .systemFont(ofSize: 25, weight: .medium)
        number.text = "Get ready"
        number.font = .systemFont(ofSize: 110, weight: .light)
        number.adjustsFontSizeToFitWidth = true; number.minimumScaleFactor = 0.3
        number.accessibilityTraits.insert(.updatesFrequently)
        caption.text = "Opening your camera…"; caption.font = .preferredFont(forTextStyle: .title3)
        caption.numberOfLines = 0
        for label in [brand, number, caption] {
            label.textColor = UIColor(red: 244/255, green: 242/255, blue: 239/255, alpha: 1)
            label.textAlignment = .center
            label.layer.shadowColor = UIColor.black.cgColor
            label.layer.shadowOpacity = 0.9; label.layer.shadowRadius = 4
            label.layer.shadowOffset = .zero
        }
        let cancel = UIButton(type: .system)
        var config = UIButton.Configuration.filled()
        config.title = "Cancel"
        config.baseBackgroundColor = UIColor(red: 74/255, green: 75/255, blue: 54/255, alpha: 1)
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 18, leading: 36, bottom: 18, trailing: 36)
        cancel.configuration = config
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [number, caption])
        stack.axis = .vertical; stack.spacing = 16
        for view in [brand, stack, cancel] { view.translatesAutoresizingMaskIntoConstraints = false; addSubview(view) }
        NSLayoutConstraint.activate([
            brand.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 28),
            brand.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor), stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, multiplier: 0.85),
            cancel.centerXAnchor.constraint(equalTo: centerXAnchor),
            cancel.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -32)
        ])
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil, !appeared { appeared = true; onAppear?() }
    }
    @objc private func cancelTapped() { onCancel?() }
}
