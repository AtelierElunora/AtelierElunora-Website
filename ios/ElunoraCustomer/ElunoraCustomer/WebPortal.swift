import SwiftUI
import WebKit

struct SharedFile: Identifiable { let id = UUID(); let url: URL }

@MainActor final class WebBrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let webView: WKWebView
    @Published var loading = true
    @Published var error: String?
    @Published var file: SharedFile?
    private let seed: CustomerSession?
    private var seedChecked = false
    private var downloads: [ObjectIdentifier: URL] = [:]
    init(url: URL, session: CustomerSession?, securityOnly: Bool = false) {
        seed = session
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = .default()
        if securityOnly {
            // Keep the existing, origin-verified challenge and its callbacks; omit the website login UI.
            let script = WKUserScript(source: Self.securityScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            configuration.userContentController.addUserScript(script)
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(); webView.navigationDelegate = self; webView.uiDelegate = self; webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url))
    }
    private static let securityScript = """
    (() => {
        if (!['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin) || location.pathname !== '/pages/client-gallery') return;
        const isolate = () => {
            const form = document.querySelector('[data-ae-customer-gallery] .ag-login');
            const input = form && form.querySelector('#ag-email');
            const box = input && input.nextElementSibling;
            const status = box && box.nextElementSibling;
            const retry = status && status.nextElementSibling;
            if (!box || box.tagName !== 'DIV' || !status || status.getAttribute('role') !== 'status' || !retry || retry.tagName !== 'BUTTON' || retry.type !== 'button') return false;
            // Hide surrounding UI in place so the active challenge iframe never reloads.
            for (const child of form.children) {
                if (![box, status, retry].includes(child)) child.style.setProperty('display','none','important');
            }
            form.id = 'ae-app-security';
            form.style.cssText = 'display:block!important;max-width:440px;margin:24px auto;padding:16px;';
            let branch = form;
            while (branch.parentElement && branch !== document.body) {
                const parent = branch.parentElement;
                for (const sibling of parent.children) {
                    if (sibling !== branch) sibling.style.setProperty('display','none','important');
                }
                parent.style.setProperty('display','block','important');
                branch = parent;
            }
            document.body.style.setProperty('background','#EBE5D9','important');
            return true;
        };
        if (isolate()) return;
        const observer = new MutationObserver(() => { if (isolate()) observer.disconnect(); });
        observer.observe(document.body, {childList:true,subtree:true});
    })();
    """
    private func isStore(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.user == nil && url.password == nil && ["www.atelierelunora.com", "atelierelunora.com"].contains(url.host ?? "")
    }
    func readCaptcha() async throws -> String {
        guard isStore(webView.url), webView.url?.path == "/pages/client-gallery" else { throw CustomerError(message: "Return to the gallery security check.") }
        let result = try await webView.callAsyncJavaScript("""
        if (!['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin) || location.pathname !== '/pages/client-gallery') return null;
        return window.turnstile ? window.turnstile.getResponse() : null;
        """, arguments: [:], in: nil, contentWorld: .page)
        guard let token = result as? String, !token.isEmpty, token.count <= 2048 else { throw CustomerError(message: "Finish the security check, then tap Continue sign-in.") }
        return token
    }
    func readSession() async throws -> CustomerSession {
        guard isStore(webView.url), webView.url?.path == "/pages/client-gallery" else { throw CustomerError(message: "Return to the Atelier Elunora gallery page and finish the security check or sign-in.") }
        let result = try await webView.callAsyncJavaScript("""
        if (!['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin) || location.pathname !== '/pages/client-gallery') return null;
        return sessionStorage.getItem('elunora-shopify-gallery-session');
        """, arguments: [:], in: nil, contentWorld: .page)
        guard let json = result as? String, let data = json.data(using: .utf8), let session = try? JSONDecoder().decode(CustomerSession.self, from: data) else { throw CustomerError(message: "Complete Continue without signing in, or sign in to your gallery, then tap Connect to app.") }
        return session
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { loading = true; error = nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading = false
        guard !seedChecked, isStore(webView.url) else { return }; seedChecked = true
        guard let seed, let data = try? JSONEncoder().encode(seed), let json = String(data: data, encoding: .utf8) else { return }
        Task { do {
            let changed = try await webView.callAsyncJavaScript("""
            if (!['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin)) return false;
            if (sessionStorage.getItem('elunora-shopify-gallery-session')) return false;
            sessionStorage.setItem('elunora-shopify-gallery-session', session); return true;
            """, arguments: ["session": json], in: nil, contentWorld: .page)
            if changed as? Bool == true { webView.reload() }
        } catch { self.error = "Could not reconnect this page. You can sign in on the page instead." } }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loading = false; self.error = "Could not load this page. Check your connection and tap Reload." }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loading = false; self.error = "Page loading was interrupted. Tap Reload to retry." }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if ["https", "http", "about", "blob"].contains(url.scheme ?? "") {
            if url.scheme == "http" { decisionHandler(.cancel); error = "This page requires a secure HTTPS connection."; return }
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated { UIApplication.shared.open(url) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil, let url = action.request.url, url.scheme == "https" { webView.load(action.request) }; return nil
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let name = (suggestedFilename as NSString).lastPathComponent
            let target = folder.appendingPathComponent(name.isEmpty ? "Atelier-photos.zip" : name)
            downloads[ObjectIdentifier(download)] = target; completionHandler(target)
        } catch { self.error = "Could not save the download. Please retry."; completionHandler(nil) }
    }
    func downloadDidFinish(_ download: WKDownload) { if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { file = SharedFile(url: url) } }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { downloads.removeValue(forKey: ObjectIdentifier(download)); self.error = "Download interrupted. Please retry from your gallery." }
}

struct BrowserView: UIViewRepresentable {
    @ObservedObject var model: WebBrowserModel
    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
struct FileShareView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
struct WebPortal: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var browser: WebBrowserModel
    @EnvironmentObject private var commerce: CommerceModel
    @State private var connecting = false
    let title: String
    let connection: Bool
    init(url: URL, title: String, session: CustomerSession? = nil, connection: Bool = false) {
        self.title = title; self.connection = connection
        _browser = StateObject(wrappedValue: WebBrowserModel(url: url, session: session))
    }
    var body: some View {
        NavigationStack { VStack(spacing: 0) {
            if connection { Text("Finish the website security check or sign in below, then tap Connect to app.").font(.footnote).padding() }
            if browser.loading { ProgressView().padding(8) }
            if let error = browser.error { Text(error).font(.footnote).foregroundStyle(.red).padding() }
            BrowserView(model: browser)
            HStack {
                Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left").padding() }.accessibilityLabel("Back")
                Button { browser.webView.reload() } label: { Image(systemName: "arrow.clockwise").padding() }.accessibilityLabel("Reload")
                Spacer()
                if connection { Button(connecting ? "Connecting…" : "Connect to app") { Task {
                    connecting = true; defer { connecting = false }
                    do { let session = try await browser.readSession(); try await commerce.accept(session); dismiss() }
                    catch { browser.error = error.localizedDescription }
                } }.buttonStyle(.borderedProminent).disabled(connecting || browser.loading) }
            }.padding(.horizontal)
        }.navigationTitle(title).navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .sheet(item: $browser.file) { FileShareView(url: $0.url) }
        }
    }
}
