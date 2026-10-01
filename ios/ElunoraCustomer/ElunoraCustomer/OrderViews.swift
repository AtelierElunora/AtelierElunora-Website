import SwiftUI
import WebKit

struct PortalDestination: Identifiable {
    let id = UUID()
    let url: URL
    let title: String
    var connect = false
}

struct OrderPage: View {
    @EnvironmentObject private var store: PhotoStore
    @EnvironmentObject private var commerce: CommerceModel
    @State private var portal: PortalDestination?
    @State private var editing: PhotoDraft?
    @State private var reviewing = false
    @State private var checkout: CheckoutReceipt?
    @State private var error: String?
    @State private var restart = false
    private var selectedPack: MagnetPack? { commerce.pricing?.packs.first { $0.count == store.order.count } }
    private var total: Int { store.order.items.reduce(0) { $0 + $1.quantity } }
    private var ready: Bool { total == store.order.count && !store.order.items.isEmpty && selectedPack != nil && commerce.pricing?.enabled == true && store.order.consent }

    var body: some View {
        NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 24) {
            BrandHeading(title: "From photo to keepsake.")
            if commerce.session == nil {
                Text("Connect a private workspace through our website security check. You can order without creating an account.")
                Button { connect() } label: { Text("Connect private workspace").font(.headline).foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
            } else {
                Text((commerce.session?.email?.isEmpty == false) ? "Connected: \(commerce.session?.email ?? "")" : "Private guest workspace connected").font(.footnote)
                Button(commerce.pricing == nil ? "Load available packs" : "Refresh pricing") { Task { await loadPricing() } }.buttonStyle(.bordered)
            }
            if let pricing = commerce.pricing {
                Text("1 · Choose your pack").font(.headline)
                ForEach(pricing.packs) { pack in Button { store.order.count = pack.count; reviewing = false } label: {
                    HStack { Image(systemName: store.order.count == pack.count ? "checkmark.circle.fill" : "circle"); Text("\(pack.count) magnets"); Spacer(); Text(pack.price) }.padding(10)
                }.buttonStyle(.bordered) }
                if !pricing.enabled { Text("Checkout is currently paused. Your photos and draft remain saved.").font(.footnote) }
            }
            Text("2 · Choose and crop your photos").font(.headline)
            Text("\(total) / \(store.order.count) magnets selected").font(.title3)
            if store.order.items.isEmpty { Text("Open My photos to select the photos you’d like to print.") }
            ForEach(store.order.items) { draft in
                if let photo = store.photos.first(where: { $0.id == draft.id }) {
                    HStack(spacing: 16) {
                        if let image = store.cropPreview(photo, draft: draft) { Image(uiImage: image).resizable().scaledToFit().frame(width: 100, height: 100).clipShape(RoundedRectangle(cornerRadius: 12)) }
                        VStack(alignment: .leading, spacing: 10) {
                            Stepper("\(draft.quantity) \(draft.quantity == 1 ? "copy" : "copies")", value: quantityBinding(draft.id), in: 1...12)
                            Button("Adjust crop") { editing = draft }
                            Button("Remove from order", role: .destructive) { store.order.items.removeAll { $0.id == draft.id } }
                        }
                    }
                }
            }
            Toggle("I agree to upload these selected photos to my private workspace so Atelier Elunora can make and fulfill my magnet order.", isOn: $store.order.consent).font(.footnote)
            if reviewing {
                Divider(); Text("3 · Review before payment").font(.headline)
                Text("\(total) square photo magnets · \(selectedPack?.price ?? "")").font(.title3)
                Text("Your previews show the crop that will be sent for printing. Shipping and tax are calculated at Shopify checkout.").font(.footnote)
                Button { Task { await checkoutNow() } } label: { Text("Continue to secure checkout").font(.headline).foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).disabled(!ready)
            } else {
                Button { reviewing = true } label: { Text("Review my magnets").font(.headline).foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).disabled(!ready)
            }
            Button("Start a new order") { restart = true }.font(.footnote)
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
        }.padding(24).disabled(commerce.busy) }.background(ivory).foregroundStyle(olive)
            .overlay { if commerce.busy { VStack { ProgressView(); Text(commerce.progress).font(.footnote) }.padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18)) } }
            .navigationTitle("Order magnets").navigationBarTitleDisplayMode(.inline)
            .sheet(item: $portal, onDismiss: { if commerce.session != nil && commerce.pricing == nil { Task { await loadPricing() } } }) { target in WebPortal(url: target.url, title: target.title, connection: target.connect).environmentObject(commerce) }
            .sheet(item: $editing) { draft in CropEditor(draft: draft).environmentObject(store) }
            .sheet(item: $checkout) { receipt in if let url = URL(string: receipt.checkoutUrl) { WebPortal(url: url, title: "Secure checkout").environmentObject(commerce) } }
            .onChange(of: store.order.items) { _, _ in reviewing = false }
            .confirmationDialog("Start another order?", isPresented: $restart, titleVisibility: .visible) { Button("Clear this draft and start new", role: .destructive) { store.startNewOrder(); reviewing = false; error = nil } } message: { Text("Your saved photos remain. A new order uses a new selection revision.") }
        }
    }
    private func connect() { portal = PortalDestination(url: URL(string: "https://www.atelierelunora.com/pages/client-gallery?view=photo-magnets&upload_variant=52214866018592")!, title: "Private workspace", connect: true) }
    private func quantityBinding(_ id: String) -> Binding<Int> {
        Binding(get: { store.order.items.first { $0.id == id }?.quantity ?? 1 }, set: { value in if let index = store.order.items.firstIndex(where: { $0.id == id }) { store.order.items[index].quantity = value } })
    }
    private func loadPricing() async { do { try await commerce.connectWorkspace(); error = nil } catch { self.error = error.localizedDescription } }
    private func checkoutNow() async {
        guard let pack = selectedPack else { return }
        do { checkout = try await commerce.prepareCheckout(entries: store.order.items, photos: store.photos, pack: pack, imageStore: store, consent: store.order.consent, orderId: store.order.orderId); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct CropEditor: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: PhotoStore
    @State var draft: PhotoDraft
    var body: some View { NavigationStack { ScrollView { VStack(spacing: 20) {
        if let photo = store.photos.first(where: { $0.id == draft.id }), let image = store.cropPreview(photo, draft: draft) { Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 18)) }
        VStack(alignment: .leading) { Text("Zoom · \(Int(draft.zoom * 100))%"); Slider(value: $draft.zoom, in: 1...3, step: 0.05) }
        VStack(alignment: .leading) { Text("Horizontal position"); Slider(value: $draft.x, in: 0...100, step: 1) }
        VStack(alignment: .leading) { Text("Vertical position"); Slider(value: $draft.y, in: 0...100, step: 1) }
        Button("Reset crop") { draft.x = 50; draft.y = 50; draft.zoom = 1 }.buttonStyle(.bordered)
        Text("Only this order’s crop changes. Your saved photo remains intact.").font(.footnote)
    }.padding(24) }.background(ivory).foregroundStyle(olive).navigationTitle("Crop your magnet").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { if let index = store.order.items.firstIndex(where: { $0.id == draft.id }) { store.order.items[index] = draft }; dismiss() } } }
    } }
}

struct LoadedGallery: Identifiable {
    let gallery: AssignedGallery
    var photos: [GalleryPhoto] = []
    var error: String?
    var id: String { gallery.id }
}
struct SelectedGalleryPhoto: Identifiable {
    let galleryId: String
    let photo: GalleryPhoto
    var id: String { galleryId + ":" + photo.id }
}

struct GalleryPage: View {
    @EnvironmentObject private var commerce: CommerceModel
    @State private var open = false
    @State private var login = false
    @State private var magnetGallery: LoadedGallery?
    @State private var groups: [LoadedGallery] = []
    @State private var loading = false
    @State private var errorMessage: String?
    @State private var selected: SelectedGalleryPhoto?
    @State private var loadID = UUID()
    @State private var loadedIdentity = ""
    @State private var lastLoadedAt: Date?
    private var identity: String { commerce.session?.email?.lowercased() ?? "" }
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    BrandHeading(title: "Your memories, together.")
                    if identity.isEmpty {
                        Text("Sign in with the email that received your gallery invitations. Your assigned galleries and photos will appear here.")
                        Button { login = true } label: { Text("Sign in to my galleries").foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
                    } else {
                        Text("Galleries for \(identity)").font(.footnote)
                        HStack {
                            Button("Refresh galleries") { Task { await reload() } }.disabled(loading)
                            Spacer()
                            Button("Gallery tools") { open = true }
                        }
                        if loading { ProgressView("Loading your galleries…") }
                        if let errorMessage { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                        if !loading && groups.isEmpty && errorMessage == nil {
                            ContentUnavailableView("No galleries assigned yet", systemImage: "rectangle.stack", description: Text("Galleries appear after access is granted to this email. Refresh after receiving a new invitation."))
                        }
                        ForEach(groups) { group in
                            VStack(alignment: .leading, spacing: 12) {
                                Divider()
                                Text(group.gallery.name).font(.system(size: 25, design: .serif))
                                if let date = group.gallery.event_date { Text(date).font(.footnote) }
                                HStack {
                                    Text("\(group.photos.count) photos").font(.footnote)
                                    Spacer()
                                    Button("Create magnets") { magnetGallery = group }.buttonStyle(.borderedProminent).foregroundStyle(ivory).disabled(group.photos.isEmpty || commerce.busy)
                                }
                                if let message = group.error {
                                    Text(message).font(.footnote).foregroundStyle(.red)
                                } else if group.photos.isEmpty && !loading {
                                    Text("Photos will appear here when they are added to this gallery.").font(.footnote)
                                }
                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                                    ForEach(group.photos) { photo in
                                        VStack {
                                            Button { selected = SelectedGalleryPhoto(galleryId: group.id, photo: photo) } label: {
                                                NativeGalleryImage(eventId: group.id, photo: photo, fullSize: false)
                                            }.frame(height: 160).contentShape(Rectangle()).clipped().buttonStyle(.plain).accessibilityLabel("View \(photo.filename)")
                                            Button { commerce.toggleGalleryPhoto(photo.id, eventId: group.id) } label: {
                                                Label(commerce.galleryOrders[group.id]?.items.contains(where: { $0.id == photo.id }) == true ? "Selected" : "Select", systemImage: commerce.galleryOrders[group.id]?.items.contains(where: { $0.id == photo.id }) == true ? "checkmark.circle.fill" : "circle")
                                            }.buttonStyle(.bordered).contentShape(Rectangle()).disabled(commerce.busy)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }.padding(24)
            }.background(ivory).foregroundStyle(olive)
                .navigationTitle("Galleries").navigationBarTitleDisplayMode(.inline)
                .refreshable { await reload() }
                .task(id: identity) {
                    if loadedIdentity != identity { selected = nil; magnetGallery = nil; groups = []; await reload() }
                    else if lastLoadedAt == nil || Date().timeIntervalSince(lastLoadedAt ?? .distantPast) >= 60 { await reload() }
                }
                .sheet(isPresented: $login, onDismiss: { Task { await reload() } }) { AppLoginView().environmentObject(commerce) }
                .sheet(item: $magnetGallery) { group in GalleryMagnetOrder(gallery: group.gallery, photos: group.photos).environmentObject(commerce) }
                .sheet(isPresented: $open, onDismiss: { Task { await reload() } }) {
                    WebPortal(url: URL(string: "https://www.atelierelunora.com/pages/client-gallery")!, title: "Gallery tools", session: identity.isEmpty ? nil : commerce.session, connection: identity.isEmpty).environmentObject(commerce)
                }
                .sheet(item: $selected) { selection in
                    GalleryPhotoViewer(selection: selection).environmentObject(commerce)
                }
        }
    }
    @MainActor private func reload() async {
        let requestID = UUID(); loadID = requestID; loadedIdentity = identity; lastLoadedAt = nil
        groups = []; errorMessage = nil; commerce.clearPreviews()
        guard !identity.isEmpty else { loading = false; return }
        loading = true
        defer { if loadID == requestID { loading = false } }
        do {
            let galleries = try await commerce.assignedGalleries()
            try Task.checkCancellation()
            guard loadID == requestID else { return }
            groups = galleries.map { LoadedGallery(gallery: $0) }
            let model = commerce
            // Bound concurrent requests to four galleries; publish each result as it arrives.
            for start in stride(from: 0, to: galleries.count, by: 4) {
                let batch = Array(galleries[start..<min(start + 4, galleries.count)])
                await withTaskGroup(of: (String, GalleryDetailReply?, String?).self) { tasks in
                    for gallery in batch {
                        tasks.addTask {
                            do { return (gallery.id, try await model.galleryDetail(gallery.id), nil) }
                            catch { return (gallery.id, nil, error.localizedDescription) }
                        }
                    }
                    for await (id, detail, failure) in tasks {
                        guard loadID == requestID, !Task.isCancelled else { tasks.cancelAll(); return }
                        if let index = groups.firstIndex(where: { $0.id == id }) { groups[index].photos = detail?.photos ?? []; groups[index].error = failure }
                    }
                }
                guard loadID == requestID, !Task.isCancelled else { return }
            }
            lastLoadedAt = Date()
        } catch {
            guard loadID == requestID, !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
        }
    }
}

struct NativeGalleryImage: View {
    @EnvironmentObject private var commerce: CommerceModel
    let eventId: String
    let photo: GalleryPhoto
    let fullSize: Bool
    var crop: PhotoDraft? = nil
    @State private var image: UIImage?
    @State private var failed = false
    @State private var retry = 0
    private var displayedImage: UIImage? {
        guard let image, let crop, let source = image.cgImage else { return image }
        let width = Double(source.width), height = Double(source.height), side = min(width, height) / crop.zoom
        let rect = CGRect(x: (width - side) * crop.x / 100, y: (height - side) * crop.y / 100, width: side, height: side)
        guard let cropped = source.cropping(to: rect) else { return image }
        return UIImage(cgImage: cropped)
    }
    var body: some View {
        VStack {
            if let image = displayedImage {
                if fullSize { Image(uiImage: image).resizable().scaledToFit() }
                else { GeometryReader { geometry in Image(uiImage: image).resizable().scaledToFill().frame(width: geometry.size.width, height: 160).contentShape(Rectangle()).clipped().clipShape(RoundedRectangle(cornerRadius: 12)) }.frame(height: 160).contentShape(Rectangle()).clipped() }
            } else if failed {
                if fullSize { Button("Retry photo") { retry += 1 }.frame(maxWidth: .infinity, minHeight: 160) }
                else { Label("Tap to retry", systemImage: "photo").font(.footnote).frame(maxWidth: .infinity, minHeight: 160) }
            } else { ProgressView().frame(maxWidth: .infinity, minHeight: 160) }
        }
        .task(id: "\(commerce.session?.email ?? ""):\(commerce.previewVersion):\(eventId):\(photo.id):\(retry)") {
            image = nil; failed = false
            do {
                let loaded = try await commerce.galleryPreview(eventId: eventId, photoId: photo.id)
                try Task.checkCancellation(); image = loaded
            } catch { if !Task.isCancelled { failed = true } }
        }
    }
}
struct GalleryPhotoViewer: View {
    @Environment(\.dismiss) private var dismiss
    let selection: SelectedGalleryPhoto
    var body: some View {
        NavigationStack {
            ScrollView { NativeGalleryImage(eventId: selection.galleryId, photo: selection.photo, fullSize: true).padding() }
                .background(ivory).navigationTitle(selection.photo.filename).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

struct MorePage: View {
    @EnvironmentObject private var commerce: CommerceModel
    @State private var portal: PortalDestination?
    @State private var signOut = false
    @State private var login = false
    @State private var error: String?
    private let links = [("Shop all keepsakes", "/collections/all"), ("Wedding packages", "/pages/packages"), ("Event experiences", "/pages/event-experience"), ("Special events", "/pages/special-events"), ("Availability and inquiries", "/pages/contact"), ("About Atelier Elunora", "/pages/about"), ("Privacy policy", "/policies/privacy-policy")]
    var body: some View { NavigationStack { List {
        Section { BrandHeading(title: "Made to be kept.") }
        Section("Account") {
            Text(commerce.session?.email?.isEmpty == false ? (commerce.session?.email ?? "") : commerce.session == nil ? "Not connected" : "Private guest workspace")
            Button("Sign in or switch account") { login = true }.disabled(commerce.busy)
            if commerce.session != nil { Button("Sign out", role: .destructive) { signOut = true }.disabled(commerce.busy) }
        }
        if commerce.session?.email?.isEmpty == false { Section("Your gallery access") { AccountAccessList().environmentObject(commerce) } }
        Section("Services and store") { ForEach(links, id: \.0) { link in Button(link.0) { portal = PortalDestination(url: URL(string: "https://www.atelierelunora.com" + link.1)!, title: link.0) } } }
        if !commerce.checkouts.isEmpty { Section("Recent checkout links") {
            Text("Opening checkout is not confirmation of payment. Your Shopify confirmation email is the order record.").font(.footnote)
            ForEach(commerce.checkouts) { receipt in Button("Selection \(receipt.reference.prefix(8)) · Reopen checkout") { if let url = URL(string: receipt.checkoutUrl) { portal = PortalDestination(url: url, title: "Secure checkout") } } }
        } }
        if let error { Section { Text(error).foregroundStyle(.red) } }
    }.scrollContentBackground(.hidden).background(ivory).navigationTitle("Account")
        .sheet(isPresented: $login) { AppLoginView().environmentObject(commerce) }
        .sheet(item: $portal) { target in WebPortal(url: target.url, title: target.title, connection: target.connect).environmentObject(commerce) }
        .confirmationDialog("Sign out of the app?", isPresented: $signOut, titleVisibility: .visible) { Button("Sign out", role: .destructive) { Task {
            do { try await commerce.signOut(); await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast); error = nil }
            catch { self.error = error.localizedDescription }
        } } } message: { Text("Your local photos and order draft stay on this phone.") }
    } }
}

struct AppLoginView: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var emailMode = false
    @State private var codeSent = false
    @State private var security = false
    @State private var working = false
    @State private var errorMessage: String?
    var body: some View {
        NavigationStack {
            Form {
                Section { BrandHeading(title: "Welcome back."); Text("Sign in to see your account and every gallery shared with your email.") }
                Section("Sign in") {
                    TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(codeSent || working)
                    Toggle("Use an email code", isOn: $emailMode).disabled(codeSent || working)
                    if emailMode {
                        if codeSent { TextField("Eight-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode) }
                    } else { SecureField("Password", text: $password).textContentType(.password).disabled(working) }
                    if codeSent {
                        Button("Verify code and sign in") { Task { await verify() } }.disabled(code.count != 8 || working)
                        Button("Request another code") { codeSent = false; code = ""; security = true }
                    } else {
                        Button(emailMode ? "Send sign-in code" : "Sign in") { security = true }.disabled(email.trimmingCharacters(in: .whitespaces).isEmpty || (!emailMode && password.isEmpty) || working || commerce.busy)
                    }
                    if working { ProgressView("Signing in…") }
                    if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
                }
                Section { Text("Your existing gallery password works here. If you have not set one, use an email code. The app remembers your verified session securely; it does not save your password.").font(.footnote) }
            }.navigationTitle("Sign in").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { password = ""; dismiss() }.disabled(working) } }
                .sheet(isPresented: $security) { LoginSecurityCheck { token in security = false; Task { await authenticate(token) } } }

        }
    }
    private func authenticate(_ token: String) async {
        working = true; errorMessage = nil; defer { working = false }
        do {
            let address = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if emailMode { try await commerce.requestCode(email: address, captcha: token); codeSent = true }
            else { try await commerce.signIn(email: address, password: password, captcha: token); password = ""; dismiss() }
        } catch { errorMessage = error.localizedDescription }
    }
    private func verify() async {
        working = true; errorMessage = nil; defer { working = false }
        do { try await commerce.verifyCode(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), code: code); dismiss() }
        catch { errorMessage = error.localizedDescription }
    }
}

struct LoginSecurityCheck: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var browser = WebBrowserModel(url: URL(string: "https://www.atelierelunora.com/pages/client-gallery")!, session: nil, securityOnly: true)
    @State private var reading = false
    let onToken: (String) -> Void
    var body: some View {
        NavigationStack {
            VStack {
                Text("Complete the security check below, then tap Continue sign-in.").font(.footnote).padding()
                if browser.loading { ProgressView() }
                if let error = browser.error { Text(error).font(.footnote).foregroundStyle(.red).padding() }
                BrowserView(model: browser)
                Button("Continue sign-in") { Task {
                    reading = true; defer { reading = false }
                    do { onToken(try await browser.readCaptcha()) }
                    catch { browser.error = error.localizedDescription }
                } }.buttonStyle(.borderedProminent).disabled(reading || browser.loading).padding()
            }.navigationTitle("Security check").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

struct AccountAccessList: View {
    @EnvironmentObject private var commerce: CommerceModel
    @State private var galleries: [AssignedGallery] = []
    @State private var loading = false
    @State private var errorMessage: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if loading { ProgressView("Checking gallery access…") }
            ForEach(galleries) { gallery in Text(gallery.name).font(.headline) }
            if !loading && galleries.isEmpty && errorMessage == nil { Text("No galleries assigned yet.").font(.footnote) }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
            NavigationLink("View photos in Galleries") { GalleryPage().environmentObject(commerce) }
        }.task(id: commerce.session?.email) {
            galleries = []; loading = true; defer { loading = false }
            do { let result = try await commerce.assignedGalleries(); try Task.checkCancellation(); galleries = result; errorMessage = nil }
            catch { if !Task.isCancelled { errorMessage = error.localizedDescription } }
        }
    }
}

struct GalleryMagnetOrder: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.dismiss) private var dismiss
    let gallery: AssignedGallery
    let photos: [GalleryPhoto]
    @State private var draft = OrderDraft()
    @State private var pricing: PackPricing?
    @State private var editing: PhotoDraft?
    @State private var checkout: CheckoutReceipt?
    @State private var errorMessage: String?
    @State private var reviewed = false
    @State private var loaded = false
    private var pack: MagnetPack? { pricing?.packs.first { $0.count == draft.count } }
    private var total: Int { draft.items.reduce(0) { $0 + $1.quantity } }
    private var ready: Bool { loaded && !draft.items.isEmpty && total == draft.count && draft.consent && pricing?.enabled == true && pack != nil }
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    Text(gallery.name).font(.system(size: 28, design: .serif))
                    Text("Create magnets from this gallery. These photos are already stored securely; no upload is needed.").font(.footnote)
                    if let pricing {
                        ForEach(pricing.packs) { option in Button { draft.count = option.count; reviewed = false } label: { HStack { Image(systemName: draft.count == option.count ? "checkmark.circle.fill" : "circle"); Text("\(option.count) magnets"); Spacer(); Text(option.price) } }.buttonStyle(.bordered) }
                        if !pricing.enabled { Text("Checkout is paused for this gallery.").font(.footnote) }
                    } else { ProgressView("Loading packs…"); Button("Retry pricing") { Task { await loadPrices() } } }
                    Text("\(total) / \(draft.count) magnets selected").font(.headline)
                    if draft.items.isEmpty { Text("Select photos below to add them to your pack.") }
                    ForEach(photos) { photo in
                        HStack {
                            NativeGalleryImage(eventId: gallery.id, photo: photo, fullSize: false, crop: draft.items.first { $0.id == photo.id }).frame(width: 100, height: 160).contentShape(Rectangle()).clipped()
                            VStack(alignment: .leading) {
                                Button(draft.items.contains(where: { $0.id == photo.id }) ? "Remove from pack" : "Select photo") {
                                    if draft.items.contains(where: { $0.id == photo.id }) { draft.items.removeAll { $0.id == photo.id } }
                                    else if draft.items.count < 50 { draft.items.append(PhotoDraft(id: photo.id)) }
                                }.buttonStyle(.bordered)
                                if let item = draft.items.first(where: { $0.id == photo.id }) {
                                    Stepper("\(item.quantity) copies", value: quantity(photo.id), in: 1...12)
                                    Button("Adjust crop") { editing = item }
                                    Text("Zoom \(Int(item.zoom * 100))% · position \(Int(item.x))/\(Int(item.y))").font(.caption)
                                }
                            }
                        }
                    }
                    Toggle("I approve these photos and crop settings for my magnet order.", isOn: $draft.consent).font(.footnote)
                    if reviewed {
                        Text("Review: \(total) magnets · \(pack?.price ?? "")").font(.headline)
                        Text("Shipping and tax are calculated at Shopify checkout. Check every crop before continuing.").font(.footnote)
                        Button("Continue to secure checkout") { Task { await orderNow() } }.buttonStyle(.borderedProminent).foregroundStyle(ivory).disabled(!ready)
                    } else { Button("Review magnets") { reviewed = true }.buttonStyle(.borderedProminent).foregroundStyle(ivory).disabled(!ready) }
                    Button("Start a new gallery order") { draft = OrderDraft(); reviewed = false }
                    if let errorMessage { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
                    if commerce.busy { ProgressView(commerce.progress) }
                }.padding(24).disabled(commerce.busy)
            }.background(ivory).foregroundStyle(olive).navigationTitle("Gallery magnets").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() }.disabled(commerce.busy) } }
                .task { draft = commerce.galleryOrders[gallery.id] ?? OrderDraft(); draft.items.removeAll { item in !photos.contains { $0.id == item.id } }; loaded = true; await loadPrices() }
                .onChange(of: draft) { _, current in commerce.saveGalleryDraft(current, eventId: gallery.id); reviewed = false }
                .sheet(item: $editing) { item in GalleryCropEditor(eventId: gallery.id, draft: item) { changed in if let index = draft.items.firstIndex(where: { $0.id == changed.id }) { draft.items[index] = changed } }.environmentObject(commerce) }
                .sheet(item: $checkout) { receipt in if let url = URL(string: receipt.checkoutUrl) { WebPortal(url: url, title: "Secure checkout").environmentObject(commerce) } }
        }
    }
    private func quantity(_ id: String) -> Binding<Int> { Binding(get: { draft.items.first { $0.id == id }?.quantity ?? 1 }, set: { value in if let index = draft.items.firstIndex(where: { $0.id == id }) { draft.items[index].quantity = value } }) }
    private func loadPrices() async { do { pricing = try await commerce.galleryPricing(gallery.id); errorMessage = nil } catch { errorMessage = error.localizedDescription } }
    private func orderNow() async { guard let pack else { return }; do { checkout = try await commerce.checkoutGallery(eventId: gallery.id, draft: draft, pack: pack); errorMessage = nil } catch { errorMessage = error.localizedDescription } }
}

struct GalleryCropEditor: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.dismiss) private var dismiss
    let eventId: String
    @State var draft: PhotoDraft
    let onSave: (PhotoDraft) -> Void
    @State private var image: UIImage?
    @State private var errorMessage: String?
    private var cropped: UIImage? {
        guard let source = image?.cgImage else { return nil }
        let width = Double(source.width), height = Double(source.height), side = min(width, height) / draft.zoom
        let rect = CGRect(x: (width - side) * draft.x / 100, y: (height - side) * draft.y / 100, width: side, height: side)
        guard let result = source.cropping(to: rect) else { return nil }; return UIImage(cgImage: result)
    }
    var body: some View {
        NavigationStack {
            ScrollView { VStack(spacing: 20) {
                if let cropped { Image(uiImage: cropped).resizable().scaledToFit() } else { ProgressView("Loading preview…") }
                Text("Zoom"); Slider(value: $draft.zoom, in: 1...3, step: 0.05)
                Text("Horizontal position"); Slider(value: $draft.x, in: 0...100, step: 1)
                Text("Vertical position"); Slider(value: $draft.y, in: 0...100, step: 1)
                Button("Reset crop") { draft.x = 50; draft.y = 50; draft.zoom = 1 }
                if let errorMessage { Text(errorMessage).foregroundStyle(.red); Button("Retry") { Task { await load() } } }
            }.padding(24) }.background(ivory).navigationTitle("Crop magnet").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { onSave(draft); dismiss() }.disabled(image == nil) } }
                .task { await load() }
        }
    }
    private func load() async { do { image = try await commerce.galleryPreview(eventId: eventId, photoId: draft.id); errorMessage = nil } catch { errorMessage = error.localizedDescription } }
}
