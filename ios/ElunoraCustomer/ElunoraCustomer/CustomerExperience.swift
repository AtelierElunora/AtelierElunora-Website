import SwiftUI
import UIKit
import PhotosUI

struct IncomingEventLink: Identifiable { let id = UUID(); let value: String }
@MainActor final class CustomerJourney: ObservableObject {
    @Published var tab: CustomerTab = .capture
    @Published var boothToken: String?
    @Published var showingBoothPhotos = false
    @Published var eventLink: IncomingEventLink?
    func open(_ url: URL) {
        switch CustomerLink.parse(url) {
        case .event(let value): tab = .galleries; eventLink = IncomingEventLink(value: value)
        case .booth(let token): boothToken = token; tab = .galleries; showingBoothPhotos = true
        case .galleries: tab = .galleries
        case .order: tab = .order
        case nil: break
        }
    }
}

struct LocalPhotoImage: View {
    @EnvironmentObject private var store: PhotoStore
    let photo: SavedPhoto
    var crop: PhotoDraft? = nil
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image {
                Image(uiImage: crop.map { store.cropped(image, draft: $0) } ?? image).resizable().scaledToFit()
            } else { ProgressView().accessibilityLabel("Loading photo") }
        }.task(id: photo.id) { image = await store.loadThumbnail(photo) }
    }
}

struct InteractiveCrop: View {
    let image: UIImage
    @Binding var draft: PhotoDraft
    @State private var dragStart: PhotoDraft?
    @State private var zoomStart: Double?
    var body: some View {
        GeometryReader { proxy in
            let side = proxy.size.width
            let width = Double(image.cgImage?.width ?? 1), height = Double(image.cgImage?.height ?? 1)
            let cropSide = CropGeometry.side(width: width, height: height, zoom: draft.zoom)
            let scale = Double(side) / max(1, cropSide)
            Image(uiImage: image).resizable()
                .frame(width: width * scale, height: height * scale)
                .offset(x: -(width - cropSide) * scale * draft.x / 100, y: -(height - cropSide) * scale * draft.y / 100)
                .frame(width: side, height: side, alignment: .topLeading).clipped()
                .overlay { Rectangle().stroke(.white.opacity(0.8), lineWidth: 2).allowsHitTesting(false) }
                .contentShape(Rectangle())
                .gesture(DragGesture().onChanged { value in
                    if dragStart == nil { dragStart = draft }
                    guard let start = dragStart else { return }
                    draft.x = CropGeometry.shifted(position: start.x, translation: value.translation.width, imageDimension: width, cropSide: cropSide, viewSide: side)
                    draft.y = CropGeometry.shifted(position: start.y, translation: value.translation.height, imageDimension: height, cropSide: cropSide, viewSide: side)
                }.onEnded { _ in dragStart = nil })
                .simultaneousGesture(MagnifyGesture().onChanged { value in
                    if zoomStart == nil { zoomStart = draft.zoom }
                    draft.zoom = CropGeometry.clamped((zoomStart ?? 1) * value.magnification, 1...3)
                }.onEnded { _ in zoomStart = nil })
                .accessibilityLabel("Magnet crop preview")
                .accessibilityHint("Use the labeled sliders below to adjust the crop precisely.")
        }.aspectRatio(1, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 16))
        Text("Drag to position. Pinch to zoom.").font(.footnote).foregroundStyle(.secondary)
    }
}

struct CropSliders: View {
    @Binding var draft: PhotoDraft
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Slider(value: $draft.zoom, in: 1...3, step: 0.05) { Text("Zoom") }
                .accessibilityValue("\(Int(draft.zoom * 100)) percent")
            Text("Zoom · \(Int(draft.zoom * 100))%").font(.footnote)
            Slider(value: $draft.x, in: 0...100, step: 1) { Text("Horizontal position") }
            Text("Horizontal position · \(Int(draft.x))%").font(.footnote)
            Slider(value: $draft.y, in: 0...100, step: 1) { Text("Vertical position") }
            Text("Vertical position · \(Int(draft.y))%").font(.footnote)
            Button("Reset crop") { draft.x = 50; draft.y = 50; draft.zoom = 1 }
        }
    }
}

struct PhotoQualityNotice: View {
    let pixels: Int?
    var body: some View {
        if let pixels, pixels < 900 {
            Label("This crop has about \(pixels) pixels per side and may look soft in print. Reduce zoom or choose a larger photo.", systemImage: "exclamationmark.triangle")
                .font(.footnote).foregroundStyle(olive)
        }
    }
}

struct OrderPhotoPicker: View {
    @EnvironmentObject private var store: PhotoStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var imported: [PhotosPickerItem] = []
    @State private var importing = false
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    PhotosPicker(selection: $imported, maxSelectionCount: 12, matching: .images) { Label("Add photos from phone", systemImage: "plus") }.buttonStyle(.bordered).disabled(importing)
                    if importing { ProgressView("Importing…") }
                    if store.photos.isEmpty { ContentUnavailableView("Choose your first photo", systemImage: "photo", description: Text("Import photos above, or take one in Capture.")) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: textSize.isAccessibilitySize ? 260 : 130))]) {
                        ForEach(store.photos) { photo in
                            Button { store.toggleSelection(photo) } label: {
                                VStack {
                                    LocalPhotoImage(photo: photo).frame(height: 140)
                                    Label(store.order.items.contains { $0.id == photo.id } ? "Selected" : "Select", systemImage: store.order.items.contains { $0.id == photo.id } ? "checkmark.circle.fill" : "circle")
                                }
                            }.buttonStyle(.bordered)
                        }
                    }
                }.padding(20)
            }.background(ivory).navigationTitle("Choose photos")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done · \(store.order.items.count)") { dismiss() }.disabled(importing) } }
                .onChange(of: imported) { _, items in
                    Task {
                        importing = true; defer { importing = false; imported = [] }
                        for item in items {
                            do { if let data = try await item.loadTransferable(type: Data.self) { store.saveImported(data) } }
                            catch { store.errorMessage = error.localizedDescription }
                        }
                    }
                }
        }.interactiveDismissDisabled(importing)
    }
}

struct CustomerHelp: View {
    var body: some View {
        List {
            Section("Making your magnets") {
                Text("Choose photos, select a pack, check each square crop, and approve your selection. Shipping and tax appear before payment at secure checkout.")
                Text("A checkout link is not a paid order. Your Shopify confirmation is the payment record.")
            }
            Section("Event photos") {
                Text("Event sharing shows only photos submitted through this phone’s event connection. Invited galleries require the invited email account.")
                Text("Uploads are saved for retry. Keep this app installed until pending uploads finish. Background transfers may pause when the phone is locked or offline.")
            }
            Section("Delivery and help") {
                Link("Shipping policy", destination: URL(string: "https://www.atelierelunora.com/policies/shipping-policy")!)
                Link("Contact Atelier Elunora", destination: URL(string: "https://www.atelierelunora.com/pages/contact")!)
            }
        }.navigationTitle("Help and delivery")
    }
}

struct CustomerStorage: View {
    @EnvironmentObject private var store: PhotoStore
    @EnvironmentObject private var event: EventUploadModel
    @EnvironmentObject private var commerce: CommerceModel
    @State private var confirm = false
    @State private var bytes = 0
    var body: some View {
        List {
            Section("On this phone") {
                Text("\(store.photos.count) saved photos")
                Text(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))
                Text("Photos and order drafts remain on this device when you sign out. Only selected photos are uploaded.").font(.footnote)
            }
            Section {
                Button("Clear prepared upload copies") { store.clearUploadCopies(); bytes = store.storageBytes() }.disabled(event.hasQueuedUploads || event.busy || commerce.busy || commerce.pendingCheckout != nil)
                Button("Delete all local photos", role: .destructive) { confirm = true }.disabled(event.hasQueuedUploads || event.busy || commerce.busy || commerce.pendingCheckout != nil)
                Text(commerce.pendingCheckout != nil ? "Finish or cancel your pending checkout upload before clearing local photos." : event.hasQueuedUploads ? "Finish pending event uploads before clearing photos or prepared copies." : "Deleting local photos clears your local magnet draft. Cloud galleries and your phone’s Photos library are unaffected.").font(.footnote)
            }
        }.navigationTitle("Photo storage").task { bytes = store.storageBytes() }
            .confirmationDialog("Delete all app photos and the local order draft?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Delete local photos", role: .destructive) { store.removeAll(); bytes = store.storageBytes() }
            }
    }
}


/// All filled customer controls keep their label readable, including disabled states.
struct CustomerPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(ivory)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frame(minHeight: 44)
            .background(enabled ? olive : olive.opacity(0.85), in: RoundedRectangle(cornerRadius: 14))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
