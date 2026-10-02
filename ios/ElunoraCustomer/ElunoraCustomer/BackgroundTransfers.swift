import Foundation
import UIKit
import Network
import Combine

extension Notification.Name { static let backgroundTransferFinished = Notification.Name("ElunoraBackgroundTransferFinished") }

@MainActor final class Connectivity: ObservableObject {
    @Published private(set) var online = true
    private let monitor = NWPathMonitor()
    init() {
        monitor.pathUpdateHandler = { [weak self] path in Task { @MainActor in self?.online = path.status == .satisfied } }
        monitor.start(queue: DispatchQueue(label: "ElunoraConnectivity"))
    }
    deinit { monitor.cancel() }
}

@MainActor protocol CustomerFileTransfers: AnyObject {
    func upload(id: String, request: URLRequest, file: URL) async throws -> Int
    func acknowledge(_ id: String)
    func cancel(prefix: String) async
}

// The OS owns file PUTs. Reserve/finish still use the existing scoped API and
// saved request ID; completion receipts survive an app relaunch.
@MainActor final class BackgroundTransfers: NSObject, ObservableObject, URLSessionTaskDelegate, URLSessionDelegate, CustomerFileTransfers {
    static let shared = BackgroundTransfers()
    static let identifier = "com.atelierelunora.customer.event-transfers.v1"
    @Published private(set) var progress: [String: Double] = [:]
    private var callbacks: [String: CheckedContinuation<Int, Error>] = [:]
    private var receipts: [String: Int] = [:]
    var backgroundCompletion: (() -> Void)?
    private var receiptsURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("transfer-receipts.json")
    }
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        configuration.waitsForConnectivity = true
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForResource = 24 * 60 * 60
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()
    override init() {
        super.init()
        if let data = try? Data(contentsOf: receiptsURL), let saved = try? JSONDecoder().decode([String: Int].self, from: data) { receipts = saved }
    }
    func reconnect() { _ = session }
    func upload(id: String, request: URLRequest, file: URL) async throws -> Int {
        if let status = receipts[id] {
            if (200..<300).contains(status) || status == 409 { return status }
            receipts[id] = nil; saveReceipts()
        }
        guard callbacks[id] == nil else { throw CustomerError(message: "This photo is already uploading.") }
        let tasks = await session.allTasks
        return try await withCheckedThrowingContinuation { continuation in
            callbacks[id] = continuation
            if let existing = tasks.first(where: { $0.taskDescription == id }) { existing.resume() }
            else {
                let task = session.uploadTask(with: request, fromFile: file)
                task.taskDescription = id; progress[id] = 0; task.resume()
            }
        }
    }
    func acknowledge(_ id: String) { receipts[id] = nil; progress[id] = nil; saveReceipts() }
    func cancel(prefix: String) async {
        for task in await session.allTasks where task.taskDescription?.hasPrefix(prefix) == true { task.cancel() }
    }
    private func saveReceipts() {
        do {
            try FileManager.default.createDirectory(at: receiptsURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(receipts).write(to: receiptsURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch { /* A missing receipt is safely recovered by reserve with the same request ID. */ }
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let id = task.taskDescription, totalBytesExpectedToSend > 0 else { return }
        Task { @MainActor in self.progress[id] = Double(totalBytesSent) / Double(totalBytesExpectedToSend) }
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = task.taskDescription else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode
        Task { @MainActor in
            if let error { self.callbacks.removeValue(forKey: id)?.resume(throwing: error) }
            else if let status {
                self.receipts[id] = status; self.saveReceipts()
                self.callbacks.removeValue(forKey: id)?.resume(returning: status)
            } else { self.callbacks.removeValue(forKey: id)?.resume(throwing: CustomerError(message: "Upload receipt unavailable. Retry this photo.")) }
            NotificationCenter.default.post(name: .backgroundTransferFinished, object: nil)
        }
    }
    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in
            let completion = self.backgroundCompletion; self.backgroundCompletion = nil
            completion?()
        }
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // Never forward an upload capability through an unexpected redirect.
        completionHandler(nil)
    }
}

final class TransferAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == BackgroundTransfers.identifier else { completionHandler(); return }
        BackgroundTransfers.shared.backgroundCompletion = completionHandler
        BackgroundTransfers.shared.reconnect()
    }
}
