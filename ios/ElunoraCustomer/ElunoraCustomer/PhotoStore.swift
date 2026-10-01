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
    private var draftURL: URL { directory.appendingPathComponent("order-draft.json") }

    init() {
        directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Keepsakes", isDirectory: true)
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
        do { try FileManager.default.removeItem(at: photo.url); try? FileManager.default.removeItem(at: directory.appendingPathComponent("UploadCopies").appendingPathComponent(photo.id + ".jpg")); photos.removeAll { $0.id == photo.id }; order.items.removeAll { $0.id == photo.id } }
        catch { errorMessage = "Could not remove photo: \(error.localizedDescription)" }
    }

    func thumbnail(_ photo: SavedPhoto) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(photo.url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 700
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    private func saveDraft() {
        do { try JSONEncoder().encode(order).write(to: draftURL, options: [.atomic, .completeFileProtection]) }
        catch { errorMessage = "Could not save your order draft. Please retry before leaving the app." }
    }
    func toggleSelection(_ photo: SavedPhoto) {
        if order.items.contains(where: { $0.id == photo.id }) { order.items.removeAll { $0.id == photo.id } }
        else if order.items.count < 50 { order.items.append(PhotoDraft(id: photo.id)) }
        else { errorMessage = "Choose up to 50 different photos per order." }
    }
    func startNewOrder() { order = OrderDraft() }
    func uploadFile(_ photo: SavedPhoto) throws -> URL {
        let folder = directory.appendingPathComponent("UploadCopies", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(photo.id + ".jpg")
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let source = CGImageSourceCreateWithURL(photo.url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 4096] as CFDictionary),
              let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.94) else { throw CustomerError(message: "Could not prepare this photo for printing.") }
        try data.write(to: target, options: [.atomic, .completeFileProtection]); return target
    }
    func cropPreview(_ photo: SavedPhoto, draft: PhotoDraft) -> UIImage? {
        guard let image = thumbnail(photo)?.cgImage else { return nil }
        let w = Double(image.width), h = Double(image.height), side = min(w, h) / max(1, min(3, draft.zoom))
        let rect = CGRect(x: (w - side) * draft.x / 100, y: (h - side) * draft.y / 100, width: side, height: side)
        guard let cropped = image.cropping(to: rect) else { return nil }; return UIImage(cgImage: cropped)
    }
}
