import SwiftUI

struct GuestWorkspaceView: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var verification = WebBrowserModel(url: URL(string: "https://www.atelierelunora.com/pages/app-security")!, session: nil)
    @State private var working = false
    @State private var error: String?
    @State private var login = false
    var body: some View {
        NavigationStack {
            ScrollView { VStack(alignment: .leading, spacing: 20) {
                Text("Continue as a guest").font(.title2)
                Text("Complete the security check to connect your private photo workspace. No account is needed. Your photos upload only when you approve checkout.")
                if verification.loading { ProgressView("Loading security check…") }
                BrowserView(model: verification).frame(height: 240)
                if let message = verification.error { Text(message).foregroundStyle(.red).font(.footnote) }
                Button(working ? "Connecting…" : "Connect and choose my pack") { Task { await connect() } }
                    .buttonStyle(CustomerPrimaryButtonStyle()).disabled(working || verification.loading || commerce.busy)
                Button("Reload security check") { verification.webView.reload() }.disabled(working)
                Button("Sign in instead") { login = true }.disabled(working)
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }.padding(24) }.background(ivory).navigationTitle("Private workspace")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(working) } }
                .sheet(isPresented: $login, onDismiss: { if commerce.session != nil { dismiss() } }) { AppLoginView() }
        }.interactiveDismissDisabled(working)
    }
    private func connect() async {
        guard !working else { return }; working = true; error = nil; defer { working = false }
        do {
            let token = try await verification.readCaptcha()
            try await commerce.connectAnonymous(captcha: token)
            dismiss()
        } catch { self.error = error.localizedDescription; verification.webView.reload() }
    }
}
