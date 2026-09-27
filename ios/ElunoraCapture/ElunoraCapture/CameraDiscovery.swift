import Combine
import Foundation
import ImageCaptureCore

// Discovery only. Detection does not prove Canon remote capture or live-view support.
final class CameraDiscovery: NSObject, ObservableObject, ICDeviceBrowserDelegate {
    @Published var devices: [String] = []
    @Published var status = "Connect the R100 and tap Scan for cameras."
    private let browser = ICDeviceBrowser()
    private var scanning = false

    override init() {
        super.init()
        browser.delegate = self
    }

    func start() {
        guard !scanning else { return }
        scanning = true
        status = "Requesting external-camera permissions…"
        browser.requestContentsAuthorization { [weak self] contents in
            DispatchQueue.main.async {
                guard let self else { return }
                self.status = "Contents permission: \(contents). Requesting control…"
                self.browser.requestControlAuthorization { [weak self] control in
                    DispatchQueue.main.async {
                        guard let self else { return }
                        self.status = "Control permission: \(control). Scanning USB cameras…"
                        self.browser.start()
                    }
                }
            }
        }
    }

    func stop() {
        browser.stop(); scanning = false; devices = []
        status = "Scan stopped."
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) { refresh() }
    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) { refresh() }

    private func refresh() {
        devices = (browser.devices ?? []).compactMap { device in
            guard device is ICCameraDevice else { return nil }
            return device.name ?? "USB camera"
        }
        status = devices.isEmpty ? "No camera detected. Check power, data cable and Wired Accessories permission." : "Camera detected. Shutter control and live view are not implemented in this build."
    }
}
