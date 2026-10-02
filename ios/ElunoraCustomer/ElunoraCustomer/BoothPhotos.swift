import SwiftUI
import Photos

struct BoothContact: Codable, Equatable {
    let channel: String
    let recipient: String
    let consent: Bool
    static func validated(channel: String, recipient: String, consent: Bool) throws -> BoothContact {
        guard consent else { throw CustomerError(message: "Agree to receive your photo invitation, or turn off the invitation option.") }
        let value = channel == "email" ? recipient.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() : recipient.filter { !" ()-".contains($0) }
        let pattern = channel == "email" ? "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" : "^\\+[1-9][0-9]{7,14}$"
        guard ["email", "sms"].contains(channel), value.count <= 254, value.range(of: pattern, options: .regularExpression) != nil else {
            throw CustomerError(message: channel == "email" ? "Enter a valid email address." : "Include your country code, for example +1, in your phone number.")
        }
        return BoothContact(channel: channel, recipient: value, consent: true)
    }
}

enum BoothInviteLink {
    static func token(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil { return trimmed }
        guard let url = URLComponents(string: trimmed), url.user == nil, url.password == nil, url.port == nil else { return nil }
        let parts: [URLQueryItem]?
        if url.scheme == "elunora", url.host == "booth", url.path.isEmpty { parts = url.queryItems }
        else if url.scheme == "https", ["www.atelierelunora.com", "atelierelunora.com"].contains(url.host ?? ""), url.path == "/pages/client-gallery", let fragment = url.fragment { parts = URLComponents(string: "https://local/?" + fragment)?.queryItems }
        else { return nil }
        guard let parts, parts.count == 1, parts[0].name == "booth", let token = parts[0].value, token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return nil }
        return token
    }
}

struct BoothPhoto: Decodable, Identifiable { let id: String; let eventName: String; let filename: String; let expiresAt: String }
struct BoothPhotosReply: Decodable { let photos: [BoothPhoto] }
struct BoothClaimReply: Decodable { let claimed: Bool; let photoId: String }

struct BoothPhotosPage: View {
    @EnvironmentObject private var commerce: CommerceModel
    @EnvironmentObject private var journey: CustomerJourney
    @State private var invitation = ""
    @State private var photos: [BoothPhoto] = []
    @State private var working = false
    @State private var login = false
    @State private var message: String?
    @State private var selected: BoothPhoto?
    private var identity: String { commerce.session?.email ?? "" }
    var body: some View {
        List {
            Section {
                Text("Your booth photos stay private. A photo invitation gives access to that photo, not the full event gallery. Access expires 14 days after capture; save your original before then.")
                if identity.isEmpty {
                    Button("Sign in or create an account") { login = true }
                    Text("Use an email code or choose Create or reset password on the sign-in screen.").font(.footnote)
                } else { Text("Signed in as \(identity)").font(.footnote) }
                SecureField("Paste your photo invitation link", text: $invitation).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Add my booth photo") { Task { await claim() } }.disabled(working || identity.isEmpty || BoothInviteLink.token(invitation) == nil)
                if let message { Text(message).font(.footnote).accessibilityAddTraits(.updatesFrequently) }
            }
            Section("My booth photos") {
                Button("Refresh photos") { Task { await load() } }.disabled(working || identity.isEmpty)
                if working { ProgressView("Loading…") }
                ForEach(photos) { photo in Button { selected = photo } label: { VStack(alignment: .leading) { Text(photo.eventName); Text(photo.filename).font(.footnote) } } }
                if !working && photos.isEmpty && !identity.isEmpty { Text("Claim an invitation above to add your photo.").font(.footnote) }
            }
        }.navigationTitle("My booth photos")
            .task(id: identity) { photos = []; selected = nil; await load() }
            .onAppear { if let token = journey.boothToken { invitation = token } }
            .sheet(isPresented: $login) { AppLoginView().environmentObject(commerce) }
            .sheet(item: $selected) { photo in BoothPhotoViewer(photo: photo).environmentObject(commerce).id(identity) }
    }
    private func claim() async {
        guard !working, let token = BoothInviteLink.token(invitation) else { return }
        working = true; message = nil
        do {
            let result: BoothClaimReply = try await commerce.claimBoothPhoto(token)
            guard result.claimed else { throw CustomerError(message: "Photo access could not be confirmed.") }
            invitation = ""; journey.boothToken = nil; message = "Photo added to your account."
        } catch { message = error.localizedDescription }
        working = false; await load()
    }
    private func load() async {
        guard !identity.isEmpty, !working else { return }; working = true; defer { working = false }
        do { let result: BoothPhotosReply = try await commerce.loadBoothPhotos(); photos = result.photos }
        catch { message = error.localizedDescription }
    }
}

struct BoothPhotoViewer: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.dismiss) private var dismiss
    let photo: BoothPhoto
    @State private var image: UIImage?
    @State private var message: String?
    @State private var working = false
    @State private var retry = 0
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let image { ZoomableGalleryImage(image: image).accessibilityLabel(photo.filename) }
                else if message == nil { ProgressView("Loading photo…") }
                if let message { Text(message).font(.footnote).padding(); Button("Reload photo") { retry += 1 }.disabled(working) }
                Button("Save original to Photos") { Task { await save() } }.buttonStyle(CustomerPrimaryButtonStyle()).disabled(image == nil || working)
            }.padding().navigationTitle(photo.eventName)
                .toolbar { Button("Done") { dismiss() }.disabled(working) }
                .task(id: retry) {
                    message = nil
                    do { let data = try await commerce.boothPhotoData(photo.id); guard let decoded = UIImage(data: data) else { throw CustomerError(message: "Could not display this photo.") }; image = decoded }
                    catch { if !Task.isCancelled { message = error.localizedDescription } }
                }
                .onChange(of: commerce.session?.email) { _, _ in dismiss() }
        }.interactiveDismissDisabled(working)
    }
    private func save() async {
        working = true; defer { working = false }
        do {
            let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard status == .authorized || status == .limited else { throw CustomerError(message: "Allow adding photos in Settings to save your original.") }
            let data = try await commerce.boothPhotoData(photo.id, original: true)
            try await PHPhotoLibrary.shared().performChanges {
                let options = PHAssetResourceCreationOptions(); options.originalFilename = photo.filename
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: options)
            }
            message = "Saved to Photos."
        } catch { message = error.localizedDescription }
    }
}
