import SwiftUI
import PhotosUI
import AVFoundation

let olive = Color(red: 65/255, green: 72/255, blue: 39/255)
let ivory = Color(red: 235/255, green: 229/255, blue: 217/255)

@main struct ElunoraCustomerApp: App {
    @UIApplicationDelegateAdaptor(TransferAppDelegate.self) private var appDelegate
    @StateObject private var journey = CustomerJourney()
    @StateObject private var store = PhotoStore()
    @StateObject private var commerce = CommerceModel()
    @StateObject private var event = EventUploadModel()
    @StateObject private var fonts = BrandFontStore()
    var body: some Scene { WindowGroup { UnifiedAppRoot().onOpenURL { journey.open($0) }.brandFont().environmentObject(store).environmentObject(commerce).environmentObject(event).environmentObject(fonts).environmentObject(journey).tint(olive).preferredColorScheme(.light) } }
}

struct CustomerHome: View {
    @EnvironmentObject private var journey: CustomerJourney
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var commerce: CommerceModel
    @EnvironmentObject private var event: EventUploadModel
    @EnvironmentObject private var store: PhotoStore
    var body: some View {
        TabView(selection: $journey.tab) {
            CapturePage().tabItem { Label("Capture", systemImage: "camera") }.tag(CustomerTab.capture)
            PhotosPage().tabItem { Label("My photos", systemImage: "photo.on.rectangle") }.tag(CustomerTab.photos)
            OrderPage().tabItem { Label("Order", systemImage: "bag") }.tag(CustomerTab.order)
            GalleryPage().tabItem { Label("Galleries", systemImage: "rectangle.stack") }.tag(CustomerTab.galleries)
            MorePage().tabItem { Label("Account", systemImage: "person.crop.circle") }.tag(CustomerTab.account)
        }
        .task(id: commerce.session?.email ?? "") { event.useProfile(commerce.session?.email ?? ""); await event.resumeQueue(store: store) }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await event.resumeQueue(store: store) } } }
        .onReceive(event.connectivity.$online) { online in if online { Task { await event.resumeQueue(store: store) } } }
        .onReceive(NotificationCenter.default.publisher(for: .backgroundTransferFinished)) { _ in Task { await event.resumeQueue(store: store) } }
        .sheet(item: $journey.eventLink) { target in NavigationStack { EventUploadPage(initialLink: target.value).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { journey.eventLink = nil } } } } }
        .alert("Photo library", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) { Button("OK") { store.errorMessage = nil } } message: { Text(store.errorMessage ?? "") }
    }
}

struct BrandHeading: View {
    let title: String
    var body: some View { VStack(alignment: .leading, spacing: 12) {
        HStack { Image("AEMonogram").resizable().scaledToFit().frame(width: 48, height: 48); Text("ATELIER ELUNORA").brandFont(.emphasis, size: 16, relativeTo: .callout).tracking(0.8) }
        Text(title).brandFont(.heading, size: 34, relativeTo: .largeTitle)
    }.foregroundStyle(olive) }
}

struct CapturePage: View {
    @EnvironmentObject private var journey: CustomerJourney
    @EnvironmentObject private var event: EventUploadModel
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
                NavigationLink(destination: EventUploadPage()) { Label(event.active.map { "Sharing with " + $0.name } ?? "Join an event", systemImage: "qrcode.viewfinder") }.buttonStyle(.bordered)
                Image(systemName: "camera.aperture").font(.system(size: 110, weight: .ultraLight)).frame(maxWidth: .infinity).padding(36)
                Text("Take a photo or choose one you already love. Your photos are saved on this phone. Selected photos upload when you continue to magnet checkout.")
                Button { Task { await openCamera() } } label: { Label("Take a photo", systemImage: "camera.fill").brandFont(.emphasis).foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(CustomerPrimaryButtonStyle()).tint(olive).disabled(cameraOpening || importing)
                PhotosPicker(selection: $selected, maxSelectionCount: 12, matching: .images) { Label("Choose from phone", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity) }.buttonStyle(.bordered).disabled(importing)
                if importing { ProgressView("Saving your photos…") }
                Text("\(store.photos.count) photos saved in My photos").brandFont(size: 13, relativeTo: .footnote)
                if !store.photos.isEmpty { Button { journey.tab = .photos } label: { Text("Choose photos for magnets →").font(.body.weight(.semibold)).foregroundStyle(ivory) }.buttonStyle(CustomerPrimaryButtonStyle()).tint(olive) }
            }.padding(24) }.background(ivory).foregroundStyle(olive)
            .navigationTitle("Capture").navigationBarTitleDisplayMode(.inline)
            .fullScreenCover(isPresented: $cameraVisible) { PhoneCamera(onPhoto: { store.save($0); cameraVisible = false }, onCancel: { cameraVisible = false }).ignoresSafeArea() }
            .onChange(of: selected) { _, items in
                guard !items.isEmpty else { return }
                Task { importing = true; defer { importing = false; selected = [] }
                    for item in items { do {
                        let data = try await item.loadTransferable(type: Data.self)
                        if let data { store.saveImported(data) } else { store.errorMessage = "A selected photo could not be loaded." }
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
    @Environment(\.dynamicTypeSize) private var textSize
    @EnvironmentObject private var event: EventUploadModel
    @EnvironmentObject private var journey: CustomerJourney
    @EnvironmentObject private var store: PhotoStore
    @EnvironmentObject private var commerce: CommerceModel
    @State private var deleting: SavedPhoto?
    var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 20) {
        BrandHeading(title: "Your little keepsakes.")
        Text("Choose your photos, then continue to select a pack and review your crops.")
        if !store.order.items.isEmpty { Button { journey.tab = .order } label: { Text("Continue with \(store.order.items.count) photos →").font(.body.weight(.semibold)).foregroundStyle(ivory) }.buttonStyle(CustomerPrimaryButtonStyle()).tint(olive) }
        if store.photos.isEmpty { ContentUnavailableView("Your tray is ready", systemImage: "photo", description: Text("Take or import a photo from Capture.")) }
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: textSize.isAccessibilitySize ? 1 : 2), spacing: 16) {
            ForEach(store.photos) { photo in VStack {
                LocalPhotoImage(photo: photo).frame(height: 155).frame(maxWidth: .infinity).background(.white).clipShape(RoundedRectangle(cornerRadius: 14))
                Button { store.toggleSelection(photo) } label: { Label(store.order.items.contains(where: { $0.id == photo.id }) ? "Selected" : "Select", systemImage: store.order.items.contains(where: { $0.id == photo.id }) ? "checkmark.circle.fill" : "circle") }.buttonStyle(.bordered).disabled(commerce.busy)
                Button("Remove", role: .destructive) { deleting = photo }.brandFont(size: 13, relativeTo: .footnote).disabled(commerce.busy || commerce.pendingCheckout != nil || event.hasQueuedUploads || event.busy)
            } }
        }
    }.padding(24) }.background(ivory).foregroundStyle(olive).navigationTitle("My photos").navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Remove this saved photo?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) { if let photo = deleting { store.remove(photo) }; deleting = nil }
        } message: { Text("The original in your phone’s Photos library is unaffected.") }
    } }
}
