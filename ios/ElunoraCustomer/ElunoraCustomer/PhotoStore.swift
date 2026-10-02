import SwiftUI
import UIKit
import ImageIO

struct SavedPhoto: Identifiable {
    let id: String
    let url: URL
}

struct PhotoDraft: Codable, Identifiable, Equatable {
    var id: String
    var quantity: Int = 1
    var x: Double = 50
    var y: Double = 50
    var zoom: Double = 1
}
struct OrderDraft: Codable, Equatable {
    var orderId = UUID().uuidString
    var count = 6
    var items: [PhotoDraft] = []
    var consent = false
}

@MainActor final class PhotoStore: ObservableObject {
    @Published private(set) var photos: [SavedPhoto] = []
    @Published var errorMessage: String?
    @Published var order = OrderDraft() { didSet { saveDraft() } }
    private let directory: URL
    private let thumbnails = NSCache<NSString, UIImage>()
    private var thumbnailTasks: [String: Task<UIImage?, Never>] = [:]
    private var draftURL: URL { directory.appendingPathComponent("order-draft.json") }

    init(directory customDirectory: URL? = nil) {
        directory = customDirectory ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Keepsakes", isDirectory: true)
        thumbnails.totalCostLimit = 32 * 1024 * 1024
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            photos = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
                .filter { $0.pathExtension == "jpg" || $0.pathExtension == "image" }
                .sorted { $0.lastPathComponent > $1.lastPathComponent }
                .map { SavedPhoto(id: $0.lastPathComponent, url: $0) }
            if let data = try? Data(contentsOf: draftURL), var saved = try? JSONDecoder().decode(OrderDraft.self, from: data) {
                saved.items = saved.items.filter { draft in photos.contains { $0.id == draft.id } }
                order = saved
            }
        } catch { errorMessage = "Could not load saved photos: \(error.localizedDescription)" }
    }

    func save(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.98) else { errorMessage = "Could not save this photo."; return }
        saveData(data, suffix: "jpg")
    }

    func saveImported(_ data: Data) {
        guard CGImageSourceCreateWithData(data as CFData, nil) != nil else { errorMessage = "This photo format could not be read."; return }
        saveData(data, suffix: "image")
    }

    private func saveData(_ data: Data, suffix: String) {
        let name = "\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString).\(suffix)"
        let url = directory.appendingPathComponent(name)
        do { try data.write(to: url, options: [.atomic, .completeFileProtection]); photos.insert(SavedPhoto(id: name, url: url), at: 0) }
        catch { errorMessage = "Could not save photo: \(error.localizedDescription)" }
    }

    func remove(_ photo: SavedPhoto) {
        do { try FileManager.default.removeItem(at: photo.url); try? FileManager.default.removeItem(at: directory.appendingPathComponent("UploadCopies").appendingPathComponent(photo.id + ".jpg")); thumbnails.removeObject(forKey: photo.id as NSString); photos.removeAll { $0.id == photo.id }; order.items.removeAll { $0.id == photo.id } }
        catch { errorMessage = "Could not remove photo: \(error.localizedDescription)" }
    }

    func loadThumbnail(_ photo: SavedPhoto) async -> UIImage? {
        if let image = thumbnails.object(forKey: photo.id as NSString) { return image }
        if let task = thumbnailTasks[photo.id] { return await task.value }
        let url = photo.url
        let task = Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 900
                  ] as CFDictionary) else { return nil }
            return UIImage(cgImage: image)
        }
        thumbnailTasks[photo.id] = task
        let image = await task.value
        thumbnailTasks[photo.id] = nil
        guard photos.contains(where: { $0.id == photo.id }) else { return nil }
        if let image { thumbnails.setObject(image, forKey: photo.id as NSString, cost: (image.cgImage?.bytesPerRow ?? 0) * (image.cgImage?.height ?? 0)) }
        return image
    }
    func photo(_ id: String) -> SavedPhoto? { photos.first { $0.id == id } }
    func pixelSide(_ photo: SavedPhoto, draft: PhotoDraft) async -> Int? {
        let url = photo.url, zoom = draft.zoom
        return await Task.detached {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? Int,
                  let height = properties[kCGImagePropertyPixelHeight] as? Int else { return nil }
            return Int(CropGeometry.side(width: Double(width), height: Double(height), zoom: zoom))
        }.value
    }
    func cropped(_ image: UIImage, draft: PhotoDraft) -> UIImage {
        guard let source = image.cgImage else { return image }
        let width = Double(source.width), height = Double(source.height)
        let side = CropGeometry.side(width: width, height: height, zoom: draft.zoom)
        let rect = CGRect(x: (width - side) * CropGeometry.clamped(draft.x, 0...100) / 100,
                          y: (height - side) * CropGeometry.clamped(draft.y, 0...100) / 100, width: side, height: side)
        return source.cropping(to: rect).map { UIImage(cgImage: $0) } ?? image
    }
    func storageBytes() -> Int {
        guard let files = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        return files.compactMap { ($0 as? URL).flatMap { try? $0.resourceValues(forKeys: [.fileSizeKey]).fileSize } }.reduce(0, +)
    }
    func clearUploadCopies() {
        do {
            let folder = directory.appendingPathComponent("UploadCopies")
            if FileManager.default.fileExists(atPath: folder.path) { try FileManager.default.removeItem(at: folder) }
        } catch { errorMessage = "Could not clear prepared copies: \(error.localizedDescription)" }
    }
    func removeAll() {
        for photo in photos { remove(photo) }
        if photos.isEmpty { startNewOrder(); clearUploadCopies() }
    }
    private func saveDraft() {
        do { try JSONEncoder().encode(order).write(to: draftURL, options: [.atomic, .completeFileProtection]) }
        catch { errorMessage = "Could not save your order draft. Please retry before leaving the app." }
    }
    func toggleSelection(_ photo: SavedPhoto) {
        order.consent = false
        if order.items.contains(where: { $0.id == photo.id }) { order.items.removeAll { $0.id == photo.id } }
        else if order.items.count < 50 { order.items.append(PhotoDraft(id: photo.id)) }
        else { errorMessage = "Choose up to 50 different photos per order." }
    }
    func startNewOrder() { order = OrderDraft() }
    func uploadFile(_ photo: SavedPhoto) async throws -> URL {
        let folder = directory
        return try await Task.detached(priority: .userInitiated) { try Self.prepareFile(photo, directory: folder) }.value
    }
    nonisolated private static func prepareFile(_ photo: SavedPhoto, directory: URL) throws -> URL {
        let folder = directory.appendingPathComponent("UploadCopies", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(photo.id + ".jpg")
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let source = CGImageSourceCreateWithURL(photo.url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 4096] as CFDictionary),
              let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.94) else { throw CustomerError(message: "Could not prepare this photo for printing.") }
        try data.write(to: target, options: [.atomic, .completeFileProtection]); return target
    }
}
