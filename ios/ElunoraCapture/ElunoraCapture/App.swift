import SwiftUI
import UIKit
import AVFoundation
import CoreText

private enum Atelier {
    static func registerFonts() {
        for file in ["BrownCarolinaSans", "EdwardianScript"] {
            if let url = Bundle.main.url(forResource: file, withExtension: "otf", subdirectory: "BrandFonts") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }
    static let olive = Color(red: 74/255, green: 75/255, blue: 54/255)
    static let cream = Color(red: 244/255, green: 242/255, blue: 239/255)
    static let ivory = Color(red: 231/255, green: 229/255, blue: 217/255)
    static let sand = Color(red: 214/255, green: 210/255, blue: 188/255)
    static let gold = Color(red: 177/255, green: 154/255, blue: 115/255)
}

@main struct ElunoraCaptureApp: App {
    init() { Atelier.registerFonts() }
    var body: some Scene {
        WindowGroup { CaptureView().preferredColorScheme(.light).tint(Atelier.olive) }
    }
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

struct CaptureView: View {
    @StateObject private var capture = CaptureModel()
    @StateObject private var cameras = CameraDiscovery()
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingSetup = false
    @State private var showingCamera = false
    @State private var requestingCamera = false
    @State private var cameraError: String?
    @State private var testMode = false
    @State private var useCanon = false

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
                                .font(.custom("EdwardianScriptITCPro-Regular", size: 48, relativeTo: .largeTitle)).multilineTextAlignment(.center)
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
                                }
                                Button("Use iPad camera") { cameras.stop(); useCanon = false }
                                    .disabled(capture.busy)
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
            if !ready { useCanon = false }
        }
        .sheet(isPresented: $showingSetup) { setupSheet }
        .fullScreenCover(isPresented: $showingCamera) {
            IPadCamera { image in
                showingCamera = false
                if let image { capture.acceptPhoto(image) }
            }.ignoresSafeArea()
        }
        .alert("Camera unavailable", isPresented: Binding(get: { cameraError != nil }, set: { if !$0 { cameraError = nil } })) {
            Button("OK", role: .cancel) { cameraError = nil }
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
        } message: { Text(cameraError ?? "Please try again.") }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { cameras.stop() }
        }
    }

    private var header: some View {
        VStack(spacing: 18) {
            HStack {
                Label(testMode ? "TEST EXPERIENCE" : (useCanon ? "CANON · EXPERIMENTAL" : "IPAD CAMERA"), systemImage: testMode ? "sparkles" : "camera")
                    .font(.caption2.weight(.semibold)).tracking(1.4)
                Spacer()
                Button { showingSetup = true } label: {
                    Label("Station setup", systemImage: "slider.horizontal.3")
                        .font(.callout).padding(.vertical, 12)
                }.accessibilityHint("Open event connection and camera controls")
            }
            VStack(spacing: 8) {
                Image("AEMonogram").resizable().scaledToFit()
                    .frame(width: 76, height: 76).accessibilityHidden(true)
                Text("ATELIER ELUNORA")
                    .font(.custom("BrownCarolinaSans", size: 32, relativeTo: .title)).tracking(3)
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
                    .accessibilityLabel("Experimental Canon live preview")
            } else {
                VStack(spacing: 18) {
                    Image(systemName: "camera.aperture")
                        .font(.system(size: 54, weight: .ultraLight)).accessibilityHidden(true)
                    Text("Every celebration has a story.")
                        .font(.custom("BrownCarolinaSans", size: 26, relativeTo: .title2)).multilineTextAlignment(.center)
                    Text("Let’s make a little piece of yours.")
                        .font(.body).multilineTextAlignment(.center)
                }
                .padding(32).frame(maxWidth: .infinity)
                .frame(minHeight: maxHeight * 0.75)
                .background(Atelier.ivory)
            }
            HStack(spacing: 8) {
                Image(systemName: capture.preview == nil ? "camera" : "photo")
                Text(capture.preview == nil ? (testMode ? "Test-photo mode" : (useCanon ? "Canon · Stop live view before taking a photo" : "iPad camera · Ready when you are")) : (capture.previewIsTest ? "Test photo · Preview before sending" : "Your photo · Preview before sending"))
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
                if testMode { capture.makeTestPhoto() } else if useCanon { Task { await cameras.capture() } } else { Task { await openCamera() } }
            } label: {
                Label(testMode ? "Create test photo" : (useCanon ? "Take Canon photo" : "Take a photo"), systemImage: "camera")
            }.buttonStyle(AtelierButton()).disabled(!capture.canCapture || requestingCamera || cameras.busy || (useCanon && !cameras.canOperate))
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
                Section("Capture camera") {
                    Toggle("Use connected Canon (experimental)", isOn: $useCanon)
                        .disabled(!cameras.ready || cameras.busy || capture.pending != nil || capture.busy)
                        .onChange(of: useCanon) { _, enabled in
                            if enabled { testMode = false } else { cameras.stopLiveView() }
                        }
                    Label("iPad camera · Default and backup", systemImage: "ipad")
                    Text("Opens the front camera. Use the camera switch button to choose the rear camera.").font(.footnote)
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
                    Button("Connect Canon") { cameras.start() }
                    Button("Disconnect Canon / use iPad") { cameras.stop(); useCanon = false }
                    Toggle("Experimental EOS commands", isOn: $cameras.experimentalEOS)
                        .disabled(cameras.busy || cameras.liveViewRunning)
                    Button("Receive next JPEG from physical shutter") { useCanon = true; testMode = false; cameras.receiveNextPhoto() }
                        .disabled(!cameras.canOperate || !capture.canCapture)
                    Button("Request autofocus") { Task { await cameras.autofocus() } }
                        .disabled(!cameras.canOperate || !cameras.experimentalEOS || !capture.canCapture)
                    Button(cameras.liveViewRunning ? "Stop live view" : "Start experimental live view") {
                        if cameras.liveViewRunning { cameras.stopLiveView() }
                        else { Task { await cameras.startLiveView() } }
                    }.disabled(cameras.busy || !cameras.ready || !cameras.experimentalEOS || !capture.canCapture)
                    Text("Use JPEG or RAW+JPEG, a memory card, and single-shot mode. Start with physical-shutter transfer. EOS control and live view require R100 testing. Stop live view before capture.").font(.footnote)
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


// Native still capture. Its built-in camera switch provides front/rear selection.
private struct IPadCamera: UIViewControllerRepresentable {
    var completion: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.allowsEditing = false
        if UIImagePickerController.isCameraDeviceAvailable(.front) { picker.cameraDevice = .front }
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let completion: (UIImage?) -> Void
        init(completion: @escaping (UIImage?) -> Void) { self.completion = completion }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            completion(info[.originalImage] as? UIImage)
        }
    }
}
