import SwiftUI
import UIKit
import ImageIO

struct SavedPhoto: Identifiable {
    let id: String
    let url: URL
}

@MainActor final class PhotoStore: ObservableObject {
    @Published private(set) var photos: [SavedPhoto] = []
    @Published var errorMessage: String?
    private let directory: URL

    init() {
        directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Keepsakes", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            photos = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
                .filter { $0.pathExtension == "jpg" || $0.pathExtension == "image" }
                .sorted { $0.lastPathComponent > $1.lastPathComponent }
                .map { SavedPhoto(id: $0.lastPathComponent, url: $0) }
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
        do { try FileManager.default.removeItem(at: photo.url); photos.removeAll { $0.id == photo.id } }
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
}
