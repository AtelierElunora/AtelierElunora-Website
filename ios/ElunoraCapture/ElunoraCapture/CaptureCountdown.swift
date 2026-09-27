import Foundation
import Combine

@MainActor final class CaptureCountdown: ObservableObject {
    @Published private(set) var remaining: Int?
    var isRunning: Bool { remaining != nil }
    private var task: Task<Void, Never>?
    private var generation = UUID()
    private let sleep: () async throws -> Void

    init(sleep: @escaping () async throws -> Void = { try await Task.sleep(nanoseconds: 1_000_000_000) }) {
        self.sleep = sleep
    }
    static func validatedDelay(_ seconds: Int) -> Int {
        [0, 3, 5, 10].contains(seconds) ? seconds : 5
    }
    func start(seconds: Int, completion: @escaping @MainActor () -> Void) {
        guard !isRunning else { return }
        let delay = Self.validatedDelay(seconds)
        let epoch = UUID(); generation = epoch
        guard delay > 0 else { completion(); return }
        remaining = delay
        task = Task { [weak self] in
            guard let self else { return }
            for number in stride(from: delay, through: 1, by: -1) {
                guard !Task.isCancelled, self.generation == epoch else { return }
                self.remaining = number
                do { try await self.sleep() }
                catch {
                    if self.generation == epoch { self.cancel() }
                    return
                }
            }
            guard !Task.isCancelled, self.generation == epoch else { return }
            self.remaining = nil; self.task = nil
            completion()
        }
    }
    func cancel() {
        generation = UUID(); task?.cancel(); task = nil; remaining = nil
    }
}
