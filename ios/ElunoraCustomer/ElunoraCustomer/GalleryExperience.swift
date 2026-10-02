import SwiftUI
import Photos
import UIKit

struct ZoomableGalleryImage: UIViewRepresentable {
    let image: UIImage
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.minimumZoomScale = 1; scroll.maximumZoomScale = 4
        scroll.delegate = context.coordinator
        let view = UIImageView(image: image); view.contentMode = .scaleAspectFit
        scroll.addSubview(view); context.coordinator.imageView = view
        return scroll
    }
    func updateUIView(_ scroll: UIScrollView, context: Context) {
        context.coordinator.imageView?.image = image
        if scroll.zoomScale == 1 { context.coordinator.imageView?.frame = scroll.bounds; scroll.contentSize = scroll.bounds.size }
        DispatchQueue.main.async {
            if scroll.zoomScale == 1 { context.coordinator.imageView?.frame = scroll.bounds; scroll.contentSize = scroll.bounds.size }
        }
    }
    final class Coordinator: NSObject, UIScrollViewDelegate {
        var imageView: UIImageView?
        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }
    }
}

struct GalleryViewerPage: View {
    @EnvironmentObject private var commerce: CommerceModel
    let eventID: String
    let photo: GalleryPhoto
    @State private var image: UIImage?
    @State private var error: String?
    @State private var retry = 0
    var body: some View {
        Group {
            if let image { ZoomableGalleryImage(image: image).accessibilityLabel(photo.filename) }
            else if let error { VStack { Text(error); Button("Retry") { retry += 1 } }.padding() }
            else { ProgressView("Loading photo…") }
        }.task(id: "\(commerce.previewVersion):\(photo.id):\(retry)") {
            image = nil
            do { let result = try await commerce.galleryPreview(eventId: eventID, photoId: photo.id); try Task.checkCancellation(); image = result; error = nil }
            catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}

struct GalleryPhotoViewer: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var commerce: CommerceModel
    let selection: SelectedGalleryPhoto
    @State private var selectedID: String
    @State private var file: SharedFile?
    @State private var shareFolder: URL?
    @State private var working = false
    @State private var error: String?
    @State private var saved = false
    init(selection: SelectedGalleryPhoto) { self.selection = selection; _selectedID = State(initialValue: selection.photo.id) }
    private var photos: [GalleryPhoto] { selection.photos.isEmpty ? [selection.photo] : selection.photos }
    private var current: GalleryPhoto { photos.first { $0.id == selectedID } ?? selection.photo }
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                TabView(selection: $selectedID) {
                    ForEach(photos) { photo in GalleryViewerPage(eventID: selection.galleryId, photo: photo).tag(photo.id) }
                }.tabViewStyle(.page(indexDisplayMode: .automatic))
                Text("\((photos.firstIndex { $0.id == selectedID } ?? 0) + 1) of \(photos.count) · Pinch to zoom").font(.footnote)
                HStack {
                    Button { commerce.toggleFavorite(selectedID, eventId: selection.galleryId) } label: {
                        Label(commerce.isFavorite(selectedID, eventId: selection.galleryId) ? "Favorited" : "Favorite", systemImage: commerce.isFavorite(selectedID, eventId: selection.galleryId) ? "heart.fill" : "heart")
                    }
                    if current.hasOriginal == true {
                        Menu("Save or share") {
                            Button("Share original") { Task { await download(saveToPhotos: false) } }
                            Button("Save original to Photos") { Task { await download(saveToPhotos: true) } }
                        }.disabled(working)
                    }
                }.buttonStyle(.bordered)
                if working { ProgressView("Preparing original…") }
                if saved { Text("Saved to Photos").font(.footnote) }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }.padding(.bottom).background(ivory).navigationTitle(current.filename).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.disabled(working) } }
                .sheet(item: $file, onDismiss: { if let shareFolder { try? FileManager.default.removeItem(at: shareFolder) }; shareFolder = nil; file = nil }) { file in FileShareView(url: file.url) }
                .onDisappear { if let shareFolder { try? FileManager.default.removeItem(at: shareFolder) } }
                .onChange(of: selectedID) { _, _ in saved = false; error = nil }
                .onChange(of: commerce.session?.email) { _, _ in dismiss() }
        }.interactiveDismissDisabled(working)
    }
    private func download(saveToPhotos: Bool) async {
        guard !working else { return }; working = true; saved = false; error = nil; defer { working = false }
        let photo = current
        do {
            let url = try await commerce.downloadOriginal(eventId: selection.galleryId, photo: photo)
            if saveToPhotos {
                defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
                let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
                guard status == .authorized || status == .limited else { throw CustomerError(message: "Allow adding photos in Settings, or use Share original to save to Files.") }
                try await PHPhotoLibrary.shared().performChanges {
                    let options = PHAssetResourceCreationOptions(); options.originalFilename = photo.filename
                    PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: url, options: options)
                }
                saved = true
            } else { shareFolder = url.deletingLastPathComponent(); file = SharedFile(url: url) }
        } catch { self.error = error.localizedDescription }
    }
}
