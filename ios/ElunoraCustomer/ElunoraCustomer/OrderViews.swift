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
    @State private var groups: [LoadedGallery] = []
    @State private var loading = false
    @State private var errorMessage: String?
    @State private var selected: SelectedGalleryPhoto?
    @State private var loadID = UUID()
    private var identity: String { commerce.session?.email?.lowercased() ?? "" }
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    BrandHeading(title: "Your memories, together.")
                    if identity.isEmpty {
                        Text("Sign in with the email that received your gallery invitations. Your assigned galleries and photos will appear here.")
                        Button { open = true } label: { Text("Sign in to my galleries").foregroundStyle(ivory).frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
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
                                Text("\(group.photos.count) photos").font(.footnote)
                                if let message = group.error {
                                    Text(message).font(.footnote).foregroundStyle(.red)
                                } else if group.photos.isEmpty && !loading {
                                    Text("Photos will appear here when they are added to this gallery.").font(.footnote)
                                }
                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                                    ForEach(group.photos) { photo in
                                        Button { selected = SelectedGalleryPhoto(galleryId: group.id, photo: photo) } label: {
                                            NativeGalleryImage(eventId: group.id, photo: photo, fullSize: false)
                                        }.buttonStyle(.plain).accessibilityLabel("View \(photo.filename)")
                                    }
                                }
                            }
                        }
                    }
                }.padding(24)
            }.background(ivory).foregroundStyle(olive)
                .navigationTitle("Galleries").navigationBarTitleDisplayMode(.inline)
                .refreshable { await reload() }
                .task(id: identity) { selected = nil; await reload() }
                .sheet(isPresented: $open, onDismiss: { Task { await reload() } }) {
                    WebPortal(url: URL(string: "https://www.atelierelunora.com/pages/client-gallery")!, title: "Gallery account and tools", session: identity.isEmpty ? nil : commerce.session, connection: true).environmentObject(commerce)
                }
                .sheet(item: $selected) { selection in
                    GalleryPhotoViewer(selection: selection).environmentObject(commerce)
                }
        }
    }
    @MainActor private func reload() async {
        let requestID = UUID(); loadID = requestID
        groups = []; errorMessage = nil
        guard !identity.isEmpty else { loading = false; return }
        loading = true
        defer { if loadID == requestID { loading = false } }
        do {
            let galleries = try await commerce.assignedGalleries()
            try Task.checkCancellation()
            guard loadID == requestID else { return }
            groups = galleries.map { LoadedGallery(gallery: $0) }
            for gallery in galleries {
                do {
                    let detail = try await commerce.galleryDetail(gallery.id)
                    try Task.checkCancellation()
                    guard loadID == requestID else { return }
                    if let index = groups.firstIndex(where: { $0.id == gallery.id }) { groups[index].photos = detail.photos }
                } catch {
                    guard loadID == requestID, !Task.isCancelled else { return }
                    if let index = groups.firstIndex(where: { $0.id == gallery.id }) { groups[index].error = error.localizedDescription }
                }
            }
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
    @State private var image: UIImage?
    @State private var failed = false
    @State private var retry = 0
    var body: some View {
        VStack {
            if let image {
                if fullSize { Image(uiImage: image).resizable().scaledToFit() }
                else { GeometryReader { geometry in Image(uiImage: image).resizable().scaledToFill().frame(width: geometry.size.width, height: 160).clipped().clipShape(RoundedRectangle(cornerRadius: 12)) }.frame(height: 160) }
            } else if failed {
                if fullSize { Button("Retry photo") { retry += 1 }.frame(maxWidth: .infinity, minHeight: 160) }
                else { Label("Tap to retry", systemImage: "photo").font(.footnote).frame(maxWidth: .infinity, minHeight: 160) }
            } else { ProgressView().frame(maxWidth: .infinity, minHeight: 160) }
        }
        .task(id: "\(commerce.session?.access_token ?? ""):\(eventId):\(photo.id):\(retry)") {
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
    @State private var error: String?
    private let links = [("Shop all keepsakes", "/collections/all"), ("Wedding packages", "/pages/packages"), ("Event experiences", "/pages/event-experience"), ("Special events", "/pages/special-events"), ("Availability and inquiries", "/pages/contact"), ("About Atelier Elunora", "/pages/about"), ("Privacy policy", "/policies/privacy-policy")]
    var body: some View { NavigationStack { List {
        Section { BrandHeading(title: "Made to be kept.") }
        Section("Account") {
            Text(commerce.session?.email?.isEmpty == false ? (commerce.session?.email ?? "") : commerce.session == nil ? "Not connected" : "Private guest workspace")
            Button("Sign in or connect account") { portal = PortalDestination(url: URL(string: "https://www.atelierelunora.com/pages/client-gallery")!, title: "Gallery account", connect: true) }.disabled(commerce.busy)
            if commerce.session != nil { Button("Sign out", role: .destructive) { signOut = true }.disabled(commerce.busy) }
        }
        Section("Services and store") { ForEach(links, id: \.0) { link in Button(link.0) { portal = PortalDestination(url: URL(string: "https://www.atelierelunora.com" + link.1)!, title: link.0) } } }
        if !commerce.checkouts.isEmpty { Section("Recent checkout links") {
            Text("Opening checkout is not confirmation of payment. Your Shopify confirmation email is the order record.").font(.footnote)
            ForEach(commerce.checkouts) { receipt in Button("Selection \(receipt.reference.prefix(8)) · Reopen checkout") { if let url = URL(string: receipt.checkoutUrl) { portal = PortalDestination(url: url, title: "Secure checkout") } } }
        } }
        if let error { Section { Text(error).foregroundStyle(.red) } }
    }.scrollContentBackground(.hidden).background(ivory).navigationTitle("Atelier Elunora")
        .sheet(item: $portal) { target in WebPortal(url: target.url, title: target.title, connection: target.connect).environmentObject(commerce) }
        .confirmationDialog("Sign out of the app?", isPresented: $signOut, titleVisibility: .visible) { Button("Sign out", role: .destructive) { Task {
            do { try await commerce.signOut(); await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast); error = nil }
            catch { self.error = error.localizedDescription }
        } } } message: { Text("Your local photos and order draft stay on this phone.") }
    } }
}
