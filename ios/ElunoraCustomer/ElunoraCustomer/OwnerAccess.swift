import SwiftUI
import UIKit

// Role is derived only from the authenticated /session response, never an email
// allowlist, editable metadata, local preferences, or a decoded unverified JWT.
enum AppAccessRole: Equatable {
    case unverified, customer, ownerMFA, owner
    static func verified(owner: Bool, aal: String) -> AppAccessRole {
        owner ? (aal == "aal2" ? .owner : .ownerMFA) : .customer
    }
}
struct OwnerFactor: Decodable, Identifiable { let id: String; let name: String }
struct OwnerMFAStatus: Decodable { let owner: Bool; let aal: String; let factors: [OwnerFactor] }
struct OwnerEvent: Decodable, Identifiable {
    let id: String
    let name: String
    let active: Bool
    let deleted_at: String?
    let purge_started_at: String?
}
struct OwnerEventsReply: Decodable { let events: [OwnerEvent] }
struct OwnerStationReply: Decodable { let id: String; let expiresAt: String; let url: String }

@MainActor struct UnifiedAppRoot: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            if commerce.session == nil { CustomerHome() }
            else {
                switch commerce.accessRole {
                case .unverified:
                    CustomerHome().safeAreaInset(edge: .top) {
                        HStack(spacing: 12) {
                            Label(commerce.roleError == nil ? "Checking account. Local photos are available." : "Offline access · Photos stay on this phone", systemImage: "wifi.slash")
                            Spacer()
                            Button("Retry") { Task { await commerce.checkAccess() } }
                        }.font(.footnote).padding(12).background(ivory)
                    }
                case .customer: CustomerHome()
                case .ownerMFA: OwnerVerificationView(unlocking: false) {}
                case .owner:
                    if commerce.customerPreview {
                        CustomerHome().safeAreaInset(edge: .top) {
                            HStack { Text("Owner · Customer view"); Spacer(); Button("Return to booth") { commerce.customerPreview = false } }
                                .font(.system(.subheadline, weight: .semibold)).padding(12).background(ivory).foregroundStyle(olive)
                        }
                    } else { OwnerBoothDashboard(ownerEmail: commerce.session?.email ?? "").id(commerce.session?.email ?? "") }
                }
            }
        }
        .task { await commerce.checkAccess() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await commerce.checkAccess() } } }
        .overlay { if scenePhase != .active && commerce.accessRole != .customer && commerce.session != nil { ivory.ignoresSafeArea().overlay { Image("AEMonogram").resizable().scaledToFit().frame(width: 90, height: 90) } } }
    }
}

@MainActor struct OwnerVerificationView: View {
    @EnvironmentObject private var commerce: CommerceModel
    @Environment(\.dismiss) private var dismiss
    let unlocking: Bool
    let verified: () -> Void
    @State private var factors: [OwnerFactor] = []
    @State private var factorID = ""
    @State private var code = ""
    @State private var error: String?
    @State private var working = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(unlocking ? "Unlock owner controls" : "Verify your owner account").font(.title2)
                    Text("Enter the six-digit code from your authenticator app.")
                    if factors.count > 1 {
                        Picker("Authenticator", selection: $factorID) { ForEach(factors) { Text($0.name).tag($0.id) } }
                    }
                    TextField("Six-digit code", text: $code).font(.body).keyboardType(.numberPad).textContentType(.oneTimeCode).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(working ? "Verifying…" : "Verify authenticator") {
                        Task {
                            working = true; error = nil
                            defer { working = false; code = "" }
                            do { try await commerce.verifyOwner(factorID: factorID, code: code); verified() }
                            catch { self.error = error.localizedDescription }
                        }
                    }.disabled(working || factorID.isEmpty || code.count != 6)
                    if working { ProgressView() }
                    if let error { Text(error).foregroundStyle(.red) }
                    if factors.isEmpty && !working { Text("If your owner account has no verified authenticator yet, complete setup in the owner studio first, then retry.").font(.footnote) }
                    Button("Reload authenticators") { Task { await load() } }.disabled(working)
                }
                if !unlocking { Section { Button("Sign out", role: .destructive) { Task { do { try await commerce.signOut() } catch { self.error = error.localizedDescription } } } } }
            }.font(.body).navigationTitle("Owner verification").navigationBarTitleDisplayMode(.inline)
                .toolbar { if unlocking { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(working) } } }
                .task { await load() }
        }.interactiveDismissDisabled(working)
    }
    private func load() async {
        guard !working else { return }; working = true; error = nil; defer { working = false }
        do { let status = try await commerce.ownerMFAStatus(); factors = status.factors; factorID = factors.first?.id ?? "" }
        catch { self.error = error.localizedDescription }
    }
}

@MainActor struct OwnerBoothDashboard: View {
    @EnvironmentObject private var commerce: CommerceModel
    @StateObject private var capture: CaptureModel
    @AppStorage("ownerBoothActive") private var boothActive = false
    @State private var locked = true
    @State private var unlocking = false
    @State private var events: [OwnerEvent] = []
    @State private var selectedEvent = ""
    @State private var working = false
    @State private var error: String?
    init(ownerEmail: String) { _capture = StateObject(wrappedValue: CaptureModel(ownerEmail: ownerEmail)) }
    var body: some View {
        NavigationStack {
            List {
                Section { BrandHeading(title: "Your event studio.") }
                Section("Event") {
                    Picker("Choose event", selection: $selectedEvent) {
                        Text("Select an event").tag("")
                        ForEach(events) { Text($0.name).tag($0.id) }
                    }
                    Button("Connect selected event") { Task { await connectSelected() } }.disabled(selectedEvent.isEmpty || working || capture.busy || capture.pending != nil)
                    Button("Refresh events") { Task { await loadEvents() } }.disabled(working)
                    if !capture.eventName.isEmpty { Label(capture.eventName, systemImage: "checkmark.circle") }
                    Text(capture.notice).font(.footnote)
                    if capture.pending != nil { Text("A photo is waiting to be sent. Open the booth and finish it before switching events or accounts.").font(.footnote) }
                }
                Section("Booth") {
                    Button("Open booth setup") { locked = false; boothActive = true }.disabled(!capture.connected || working)
                    Button("Start locked booth") { locked = true; boothActive = true }.disabled(!capture.connected || working)
                    Text("Guests can capture, retake and approve photos. Leaving locked booth mode requires a fresh owner authenticator code. Enable iOS Guided Access to prevent leaving the app itself.").font(.footnote)
                    Text("Approved photos enter the existing event gallery and print workflow. Keep the Mac print helper connected.").font(.footnote)
                }
                Section("Account") {
                    NavigationLink("Brand font diagnostics") { BrandFontSettings() }
                    Button("Switch to customer view") { commerce.customerPreview = true }.disabled(capture.busy || capture.pending != nil || working)
                    Button("Sign out", role: .destructive) { Task {
                        do { try await commerce.signOut(); boothActive = false }
                        catch { self.error = error.localizedDescription }
                    } }.disabled(capture.busy || capture.pending != nil || working)
                }
                if working { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
            }.font(.body).scrollContentBackground(.hidden).background(ivory).navigationTitle("Owner booth")
                .task { await loadEvents() }
                .fullScreenCover(isPresented: $boothActive) {
                    BoothCaptureView(capture: capture, locked: $locked, requestUnlock: { unlocking = true }, closeBooth: { if !locked { boothActive = false } })
                        .font(.body).interactiveDismissDisabled()
                        .sheet(isPresented: $unlocking) {
                            OwnerVerificationView(unlocking: true) { locked = false; unlocking = false }
                        }
                        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
                        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
                }
        }
    }
    private func loadEvents() async {
        guard !working else { return }; working = true; error = nil; defer { working = false }
        do { events = try await commerce.ownerEvents() }
        catch { self.error = error.localizedDescription }
    }
    private func connectSelected() async {
        guard !working, capture.pending == nil else { return }; working = true; error = nil; defer { working = false }
        do {
            let station = try await commerce.createCaptureStation(eventID: selectedEvent)
            capture.link = station.url; await capture.connect()
        } catch { self.error = error.localizedDescription }
    }
}
