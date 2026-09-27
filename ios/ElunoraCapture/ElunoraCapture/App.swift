import SwiftUI

@main struct ElunoraCaptureApp: App {
    var body: some Scene { WindowGroup { CaptureView() } }
}

struct CaptureView: View {
    @StateObject private var capture = CaptureModel()
    @StateObject private var cameras = CameraDiscovery()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("iPad + Canon prototype").font(.title2)
                    Text("Test-photo submission and USB discovery. Canon capture is still in development.").foregroundStyle(.secondary)
                    GroupBox("Event connection") {
                        VStack(alignment: .leading, spacing: 12) {
                            SecureField("Paste capture station link", text: $capture.link)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .disabled(capture.busy || capture.pending != nil)
                            Button("Connect test event") { Task { await capture.connect() } }
                                .disabled(capture.busy || capture.pending != nil)
                            if !capture.eventName.isEmpty { Text("Event: \(capture.eventName)").bold() }
                            Text("Approved test photos enter the real queue. Use a dedicated test event.").font(.footnote)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    GroupBox("Camera connection") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(cameras.status)
                            ForEach(Array(cameras.devices.enumerated()), id: \.offset) { _, name in Text(name).bold() }
                            HStack {
                                Button("Scan for cameras") { cameras.start() }
                                Button("Stop scan") { cameras.stop() }
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if let image = capture.preview {
                        Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 400).accessibilityLabel("Test photo preview")
                    }
                    Text(capture.notice).accessibilityAddTraits(.updatesFrequently)
                    HStack {
                        if capture.pending == nil {
                            Button("Create test photo") { capture.makeTestPhoto() }
                        } else {
                            Button(capture.pending?.attempted == true ? "Retry same photo" : "Approve and submit") { Task { await capture.submit() } }
                            if capture.pending?.attempted != true { Button("Retake") { capture.retake() } }
                        }
                    }.buttonStyle(.borderedProminent).disabled(capture.busy)
                    if capture.busy { ProgressView() }
                }.padding(28).frame(maxWidth: 900)
            }.navigationTitle("Atelier Elunora")
        }
        .onChange(of: scenePhase) { phase in if phase == .background { cameras.stop() } }
    }
}
