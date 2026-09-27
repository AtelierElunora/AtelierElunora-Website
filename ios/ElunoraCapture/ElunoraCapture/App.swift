import SwiftUI

private enum Atelier {
    static let olive = Color(red: 74/255, green: 75/255, blue: 54/255)
    static let cream = Color(red: 244/255, green: 242/255, blue: 239/255)
    static let ivory = Color(red: 231/255, green: 229/255, blue: 217/255)
    static let sand = Color(red: 214/255, green: 210/255, blue: 188/255)
    static let gold = Color(red: 177/255, green: 154/255, blue: 115/255)
}

@main struct ElunoraCaptureApp: App {
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
                                .font(.system(.largeTitle, design: .serif)).multilineTextAlignment(.center)
                            Text(capture.pending == nil ? "Create a test photo to try your keepsake experience." : "Take a look, then send your photo to be made into a magnet.")
                                .font(.body).multilineTextAlignment(.center).frame(maxWidth: 570)
                        }
                        photoStage(maxHeight: geometry.size.height > 800 ? 400 : 280)
                        VStack(spacing: 16) {
                            if capture.busy {
                                ProgressView("Sending your memory…").tint(Atelier.olive)
                            }
                            actions
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
        .sheet(isPresented: $showingSetup) { setupSheet }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { cameras.stop() }
        }
    }

    private var header: some View {
        VStack(spacing: 18) {
            HStack {
                Label("TEST EXPERIENCE", systemImage: "sparkles")
                    .font(.caption2.weight(.semibold)).tracking(1.4)
                Spacer()
                Button { showingSetup = true } label: {
                    Label("Station setup", systemImage: "slider.horizontal.3")
                        .font(.callout).padding(.vertical, 12)
                }.accessibilityHint("Open event connection and camera controls")
            }
            VStack(spacing: 8) {
                Text("ATELIER ELUNORA")
                    .font(.system(.title, design: .serif)).tracking(3)
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
                    .padding(16).accessibilityLabel("Your test photo preview")
            } else {
                VStack(spacing: 18) {
                    Image(systemName: "camera.aperture")
                        .font(.system(size: 54, weight: .ultraLight)).accessibilityHidden(true)
                    Text("Every celebration has a story.")
                        .font(.system(.title2, design: .serif)).multilineTextAlignment(.center)
                    Text("Let’s make a little piece of yours.")
                        .font(.body).multilineTextAlignment(.center)
                }
                .padding(32).frame(maxWidth: .infinity)
                .frame(minHeight: maxHeight * 0.75)
                .background(Atelier.ivory)
            }
            HStack(spacing: 8) {
                Image(systemName: capture.preview == nil ? "camera" : "photo")
                Text(capture.preview == nil ? "Test-photo mode · Canon capture coming next" : "Test photo · Preview before sending")
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
            Button { capture.makeTestPhoto() } label: {
                Label("Create test photo", systemImage: "camera")
            }.buttonStyle(AtelierButton())
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

    private var setupSheet: some View {
        NavigationStack {
            Form {
                Section("Event connection") {
                    SecureField("Paste capture station link", text: $capture.link)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .disabled(capture.busy || capture.pending != nil)
                    Button("Connect test event") { Task { await capture.connect() } }
                        .disabled(capture.busy || capture.pending != nil)
                    if !capture.eventName.isEmpty { Label(capture.eventName, systemImage: "checkmark.circle") }
                    Text("Use a dedicated test event. Approved test photos enter its real gallery and print queue.")
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
                    Button("Scan for cameras") { cameras.start() }
                    Button("Stop scan") { cameras.stop() }
                    Text("Camera discovery is available. Canon shutter control and live preview are still in development.")
                        .font(.footnote)
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
