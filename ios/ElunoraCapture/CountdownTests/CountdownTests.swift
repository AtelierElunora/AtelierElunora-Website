import Foundation

@MainActor final class TickGate {
    var waiting: [CheckedContinuation<Void, Error>] = []
    func sleep() async throws {
        try await withCheckedThrowingContinuation { waiting.append($0) }
    }
    func tick() { precondition(!waiting.isEmpty); waiting.removeFirst().resume() }
}

@main struct CountdownTests {
    @MainActor static func until(_ condition: () -> Bool) async {
        for _ in 0..<10_000 {
            if condition() { return }
            await Task.yield()
        }
        fatalError("Countdown did not reach expected state")
    }
    @MainActor static func main() async {
        let gate = TickGate()
        let countdown = CaptureCountdown(sleep: { try await gate.sleep() })
        var captures = 0
        countdown.start(seconds: 5) { captures += 1 }
        countdown.start(seconds: 3) { captures += 100 } // repeated tap ignored
        for expected in stride(from: 5, through: 1, by: -1) {
            await until { gate.waiting.count == 1 }
            precondition(countdown.remaining == expected && captures == 0)
            gate.tick()
        }
        await until { captures == 1 }
        precondition(!countdown.isRunning)

        countdown.start(seconds: 3) { captures += 100 }
        await until { gate.waiting.count == 1 }
        countdown.cancel() // models Cancel, disconnect, or backgrounding
        precondition(!countdown.isRunning)
        countdown.start(seconds: 3) { captures += 1 }
        await until { gate.waiting.count == 2 }
        gate.tick() // stale cancelled timer must not affect the replacement
        for expected in stride(from: 3, through: 1, by: -1) {
            await until { gate.waiting.count == 1 }
            precondition(countdown.remaining == expected)
            gate.tick()
        }
        await until { captures == 2 }
        precondition(!countdown.isRunning)
        countdown.start(seconds: 0) { captures += 1 }
        precondition(captures == 3 && !countdown.isRunning)
        precondition(CaptureCountdown.validatedDelay(-1) == 5)
        precondition(CaptureCountdown.validatedDelay(10) == 10)
        print("PASS: countdown duration, one exposure, cancellation, stale-task restart, off and settings validation")
    }
}
