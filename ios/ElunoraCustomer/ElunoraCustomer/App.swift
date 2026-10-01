import SwiftUI
import PhotosUI
import AVFoundation

private let olive = Color(red: 65/255, green: 72/255, blue: 39/255)
private let ivory = Color(red: 235/255, green: 229/255, blue: 217/255)

@main struct ElunoraCustomerApp: App {
    @StateObject private var store = PhotoStore()
    var body: some Scene { WindowGroup { CustomerHome().environmentObject(store).tint(olive) } }
}

struct CustomerHome: View {
    @EnvironmentObject private var store: PhotoStore
    var body: some View {
        TabView {
            CapturePage().tabItem { Label("Capture", systemImage: "camera") }
            PhotosPage().tabItem { Label("My photos", systemImage: "photo.on.rectangle") }
            ExplorePage().tabItem { Label("Explore", systemImage: "bag") }
        }
        .alert("Photo library", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) { Button("OK") { store.errorMessage = nil } } message: { Text(store.errorMessage ?? "") }
    }
}

struct BrandHeading: View {
    let title: String
    var body: some View { VStack(alignment: .leading, spacing: 12) {
        HStack { Image("AEMonogram").resizable().scaledToFit().frame(width: 48, height: 48); Text("ATELIER ELUNORA").font(.caption).tracking(3) }
        Text(title).font(.system(size: 34, weight: .regular, design: .serif))
    }.foregroundStyle(olive) }
}

struct CapturePage: View {
    @EnvironmentObject private var store: PhotoStore
    @State private var cameraVisible = false
    @State private var selected: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var cameraError: String?
    @State private var cameraOpening = false
    var body: some View {
        NavigationStack {
            ScrollView { VStack(alignment: .leading, spacing: 24) {
                BrandHeading(title: "Keep this moment.")
                Image(systemName: "camera.aperture").font(.system(size: 110, weight: .ultraLight)).frame(maxWidth: .infinity).padding(36)
                Text("Take a photo or choose one you already love. Your photos stay on this phone until you remove them.")
                Button { Task { await openCamera() } } label: { Label("Take a photo", systemImage: "camera.fill").font(.headline).foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(olive).disabled(cameraOpening || importing)
                PhotosPicker(selection: $selected, maxSelectionCount: 12, matching: .images) { Label("Choose from phone", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).disabled(importing)
                if importing { ProgressView("Saving your photos…") }
                Text("\(store.photos.count) photos saved in My photos").font(.footnote)
            }.padding(24) }.background(ivory).foregroundStyle(olive)
            .navigationTitle("Capture").navigationBarTitleDisplayMode(.inline)
            .fullScreenCover(isPresented: $cameraVisible) { PhoneCamera(onPhoto: { store.save($0); cameraVisible = false }, onCancel: { cameraVisible = false }).ignoresSafeArea() }
            .onChange(of: selected) { _, items in
                guard !items.isEmpty else { return }
                Task { importing = true; defer { importing = false; selected = [] }
                    for item in items { do {
                        if let data = try await item.loadTransferable(type: Data.self) { store.saveImported(data) }
                        else { store.errorMessage = "A selected photo could not be loaded." }
                    } catch { store.errorMessage = "Could not import photo: \(error.localizedDescription)" } }
                }
            }
            .alert("Camera", isPresented: Binding(get: { cameraError != nil }, set: { if !$0 { cameraError = nil } })) {
                Button("OK", role: .cancel) { cameraError = nil }
                Button("Open Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
            } message: { Text(cameraError ?? "") }
        }
    }
    @MainActor private func openCamera() async {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { cameraError = "Use a physical iPhone to take photos. You can import photos in the simulator."; return }
        cameraOpening = true; defer { cameraOpening = false }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        var allowed = status == .authorized
        if status == .notDetermined { allowed = await AVCaptureDevice.requestAccess(for: .video) }
        if allowed { cameraVisible = true } else { cameraError = "Allow camera access in Settings to take photos." }
    }
}

struct PhotosPage: View {
    @EnvironmentObject private var store: PhotoStore
    @State private var deleting: SavedPhoto?
    var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 20) {
        BrandHeading(title: "Your little keepsakes.")
        Text("\(store.photos.count) saved photos. Magnet ordering from these photos is coming next.")
        if store.photos.isEmpty { ContentUnavailableView("Your tray is ready", systemImage: "photo", description: Text("Take or import a photo from Capture.")) }
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
            ForEach(store.photos) { photo in VStack {
                if let image = store.thumbnail(photo) { Image(uiImage: image).resizable().scaledToFit().frame(height: 155).frame(maxWidth: .infinity).background(.white).clipShape(RoundedRectangle(cornerRadius: 14)) }
                Button("Remove", role: .destructive) { deleting = photo }.font(.footnote)
            } }
        }
    }.padding(24) }.background(ivory).foregroundStyle(olive).navigationTitle("My photos").navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Remove this saved photo?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) { if let photo = deleting { store.remove(photo) }; deleting = nil }
        } message: { Text("The original in your phone’s Photos library is unaffected.") }
    } }
}

private struct WebDestination: Identifiable { let id = UUID(); let url: URL }
struct ExplorePage: View {
    @State private var destination: WebDestination?
    private let pages = [("Shop photo magnets", "/collections/photo-magnets"), ("Client gallery", "/pages/client-gallery"), ("Wedding packages", "/pages/packages"), ("Special events", "/pages/special-events"), ("Contact", "/pages/contact")]
    var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 24) {
        BrandHeading(title: "Made to be kept.")
        Text("Explore our keepsakes, event experiences, and your private gallery.")
        ForEach(pages, id: \.0) { page in Button { if let url = URL(string: "https://atelierelunora.com" + page.1) { destination = WebDestination(url: url) } } label: { HStack { Text(page.0); Spacer(); Image(systemName: "arrow.up.right") }.padding(12) }.buttonStyle(.bordered) }
        Text("These pages use your website. Photos saved in this app are not transferred to checkout yet.").font(.footnote)
    }.padding(24) }.background(ivory).foregroundStyle(olive).navigationTitle("Explore").navigationBarTitleDisplayMode(.inline)
        .sheet(item: $destination) { StoreBrowser(url: $0.url).ignoresSafeArea() }
    } }
}
