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
    init(url: URL, session: CustomerSession?) {
        seed = session
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = .default()
        if ["www.atelierelunora.com", "atelierelunora.com"].contains(url.host ?? ""), url.path == "/pages/app-security" {
            let styling = WKUserScript(source: """
            if (['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin) && location.pathname === '/pages/app-security') {
                const style = document.createElement('style');
                style.textContent = 'html,body,#ae-app-security{background:#E8E5D9!important}#ae-app-security{padding:8px!important;color:#4A4B36!important}';
                document.head.append(style);
                const status = document.getElementById('ae-app-status');
                const update = () => { if (status && status.textContent.includes('Tap Continue sign-in')) status.textContent = 'Verification complete.'; };
                if (status) { update(); new MutationObserver(update).observe(status,{childList:true,subtree:true}); }
            }
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            configuration.userContentController.addUserScript(styling)
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(); webView.navigationDelegate = self; webView.uiDelegate = self; webView.allowsBackForwardNavigationGestures = true
        if url.path == "/pages/app-security" {
            webView.isOpaque = false; webView.backgroundColor = .clear; webView.scrollView.backgroundColor = .clear; webView.scrollView.isScrollEnabled = false
        }
        webView.load(URLRequest(url: url))
    }
    private func isStore(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.user == nil && url.password == nil && ["www.atelierelunora.com", "atelierelunora.com"].contains(url.host ?? "")
    }
    func readCaptcha() async throws -> String {
        guard isStore(webView.url), webView.url?.path == "/pages/app-security" else { throw CustomerError(message: "Reload the security check.") }
        let result = try await webView.callAsyncJavaScript("""
        if (!['https://www.atelierelunora.com','https://atelierelunora.com'].includes(location.origin) || location.pathname !== '/pages/app-security') return null;
        return window.aeAppCaptchaToken || null;
        """, arguments: [:], in: nil, contentWorld: .page)
        guard let token = result as? String, !token.isEmpty, token.count <= 2048 else { throw CustomerError(message: "Complete the security check, then tap Sign in or Send sign-in code.") }
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
