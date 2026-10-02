import SwiftUI

struct VerifiedCustomerOrder: Decodable, Identifiable {
    let id: String
    let eventId: String
    let eventName: String
    let createdAt: String
    let payment: String
    let production: String
    let orderName: String?
    let items: [VerifiedOrderItem]
    let tracking: [OrderTracking]
    var title: String { orderName ?? "Selection \(id.prefix(8))" }
}
struct VerifiedOrderItem: Decodable { let photoId: String; let quantity: Int; let x: Double; let y: Double; let zoom: Double }
struct OrderTracking: Decodable, Identifiable {
    let number: String
    let company: String?
    let url: String?
    let status: String?
    var id: String { number }
    var safeURL: URL? {
        guard let url, let value = URL(string: url), value.scheme == "https", value.user == nil, value.password == nil else { return nil }
        return value
    }
}
struct CustomerOrdersReply: Decodable { let orders: [VerifiedCustomerOrder] }

struct CustomerOrdersView: View {
    @EnvironmentObject private var commerce: CommerceModel
    @EnvironmentObject private var store: PhotoStore
    @EnvironmentObject private var journey: CustomerJourney
    @State private var orders: [VerifiedCustomerOrder] = []
    @State private var loading = false
    @State private var error: String?
    @State private var portal: PortalDestination?
    @State private var gallery: LoadedGallery?
    @State private var localReorder: CheckoutReceipt?
    @State private var galleryReorder: VerifiedCustomerOrder?
    var body: some View {
        List {
            Section("Order status") {
                if commerce.session == nil { Text("Connect or sign in to check order status.") }
                else { Button("Refresh order status") { Task { await load() } }.disabled(loading) }
                if loading { ProgressView("Checking orders…") }
                if let error { Text(error).font(.footnote).foregroundStyle(.secondary) }
                if orders.isEmpty && !loading { Text("No verified orders are available here yet. A checkout link does not confirm payment.").font(.footnote) }
                ForEach(orders) { order in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(order.title).font(.headline)
                        Text(order.eventName).font(.subheadline)
                        if let date = CustomerDates.parse(order.createdAt) { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.footnote) }
                        Text("Payment: \(paymentLabel(order.payment))")
                        Text("Production: \(productionLabel(order.production))")
                        if order.tracking.isEmpty { Text("Shipping updates have not been received. Check your confirmation email or contact us.").font(.footnote) }
                        ForEach(order.tracking) { tracking in
                            VStack(alignment: .leading) {
                                Text("\(tracking.company ?? "Shipment") · \(tracking.number)").font(.subheadline)
                                if let status = tracking.status { Text(status.replacingOccurrences(of: "_", with: " ").capitalized).font(.footnote) }
                                if let url = tracking.safeURL { Link("Track shipment", destination: url) }
                            }
                        }
                        Button("Order these photos again") { galleryReorder = order }.disabled(loading || commerce.busy || commerce.pendingCheckout != nil)
                    }.padding(.vertical, 6)
                }
            }
            if !commerce.checkouts.isEmpty {
                Section("Saved checkouts") {
                    ForEach(commerce.checkouts) { receipt in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Selection \(receipt.reference.prefix(8))").font(.headline)
                            Text(receipt.date.formatted(date: .abbreviated, time: .shortened)).font(.footnote)
                            Button("Reopen checkout") {
                                if let url = URL(string: receipt.checkoutUrl) { portal = PortalDestination(url: url, title: "Secure checkout") }
                            }
                            if receipt.localPhotos == true, receipt.draft != nil {
                                Button("Create a new order from these photos") { localReorder = receipt }.disabled(commerce.busy || commerce.pendingCheckout != nil)
                            }
                        }
                    }
                }
            }
        }.navigationTitle("Orders and checkout")
            .refreshable { await load() }
            .confirmationDialog("Replace this gallery’s draft with a new order?", isPresented: Binding(get: { galleryReorder != nil }, set: { if !$0 { galleryReorder = nil } }), titleVisibility: .visible) {
                Button("Create new gallery draft") { if let order = galleryReorder { galleryReorder = nil; Task { await reorder(order) } } }
            }
            .task(id: commerce.session?.email ?? "") { orders = []; await load() }
            .sheet(item: $portal, onDismiss: { Task { await load() } }) { target in WebPortal(url: target.url, title: target.title) }
            .sheet(item: $gallery) { group in GalleryMagnetOrder(gallery: group.gallery, photos: group.photos) }
            .confirmationDialog("Replace the current local draft with a new order?", isPresented: Binding(get: { localReorder != nil }, set: { if !$0 { localReorder = nil } }), titleVisibility: .visible) {
                Button("Create new draft") {
                    guard var draft = localReorder?.draft else { return }
                    let missing = draft.items.contains { store.photo($0.id) == nil }
                    guard !missing else { error = "Some original local photos were deleted. Choose new photos in Order."; localReorder = nil; return }
                    draft.orderId = UUID().uuidString; draft.consent = false; store.order = draft; localReorder = nil; journey.tab = .order
                }
            }
    }
    private func load() async {
        guard !loading, commerce.session != nil else { return }; loading = true; defer { loading = false }
        do { let result = try await commerce.customerOrders(); try Task.checkCancellation(); orders = result; error = nil }
        catch { if !Task.isCancelled { self.error = "Order status is unavailable right now. Your Shopify confirmation remains the order record. Pull-to-refresh or try again later." } }
    }
    private func reorder(_ order: VerifiedCustomerOrder) async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do {
            let detail = try await commerce.galleryDetail(order.eventId)
            let ids = Set(detail.photos.map(\.id))
            guard order.items.allSatisfy({ ids.contains($0.photoId) }) else { throw CustomerError(message: "Some photos are no longer available for a new order.") }
            let items = order.items.map { PhotoDraft(id: $0.photoId, quantity: $0.quantity, x: $0.x, y: $0.y, zoom: $0.zoom) }
            let draft = OrderDraft(count: items.reduce(0) { $0 + $1.quantity }, items: items)
            commerce.saveGalleryDraft(draft, eventId: order.eventId)
            gallery = LoadedGallery(gallery: detail.event, photos: detail.photos)
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func paymentLabel(_ status: String) -> String {
        switch status {
        case "paid": "Confirmed paid"
        case "refunded": "Refunded"
        case "partially_refunded": "Partially refunded"
        case "cancelled": "Cancelled"
        case "review": "Needs review"
        default: "Not confirmed"
        }
    }
    private func productionLabel(_ status: String) -> String {
        switch status {
        case "preparing": "Preparing"
        case "ready": "Ready"
        case "completed": "Completed"
        case "cancelled": "Cancelled"
        default: "Submitted"
        }
    }
}
