import SwiftUI
import CoreText
import UniformTypeIdentifiers
import CryptoKit

struct ImportedFontFace: Identifiable {
    let id: String // The actual PostScript name, never the filename.
    let label: String
    let family: String
    let weight: Double
}
private struct BrandFontChoices: Codable {
    var heading = ""
    var body = ""
    var emphasis = ""
}
enum BrandFontRole { case heading, body, emphasis }

@MainActor final class BrandFontStore: ObservableObject {
    @Published private(set) var faces: [ImportedFontFace] = []
    @Published var heading = "" { didSet { save() } }
    @Published var bodyFace = "" { didSet { save() } }
    @Published var emphasis = "" { didSet { save() } }
    @Published var message: String?
    private let directory: URL
    private var restoring = true
    private var choicesURL: URL { directory.appendingPathComponent("choices.json") }
    init() {
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BrandFonts", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            // Fonts added to the Xcode target can also be used by every installed copy.
            for ext in ["otf", "ttf"] {
                for url in Bundle.main.urls(forResourcesWithExtension: ext, subdirectory: nil) ?? [] { try register(url) }
            }
            for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where ["otf", "ttf"].contains(url.pathExtension.lowercased()) {
                do { try register(url) } catch { message = "One saved font could not load. Import it again or choose another face." }
            }
            if FileManager.default.fileExists(atPath: choicesURL.path) {
                let choices = try JSONDecoder().decode(BrandFontChoices.self, from: Data(contentsOf: choicesURL))
                heading = available(choices.heading); bodyFace = available(choices.body); emphasis = available(choices.emphasis)
            }
        } catch { message = "Could not restore fonts: \(error.localizedDescription)" }
        restoring = false
    }
    private func available(_ name: String) -> String { faces.contains { $0.id == name } ? name : "" }
    private func save() {
        guard !restoring else { return }
        do { try JSONEncoder().encode(BrandFontChoices(heading: heading, body: bodyFace, emphasis: emphasis)).write(to: choicesURL, options: [.atomic, .completeFileProtection]) }
        catch { message = "Could not save font choices: \(error.localizedDescription)" }
    }
    private func register(_ url: URL) throws {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], !descriptors.isEmpty else {
            throw CustomerError(message: "This file is not a readable OpenType or TrueType font.")
        }
        var registrationError: Unmanaged<CFError>?
        let registered = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &registrationError)
        let failure = registrationError?.takeRetainedValue()
        // Duplicate registration is expected when the same face was already imported.
        if !registered, let failure, CFErrorGetCode(failure) != CTFontManagerError.alreadyRegistered.rawValue {
            throw CustomerError(message: "iOS could not register this font: \(failure)")
        }
        for descriptor in descriptors {
            let font = CTFontCreateWithFontDescriptor(descriptor, 17, nil)
            let name = CTFontCopyPostScriptName(font) as String
            guard UIFont(name: name, size: 17) != nil else { continue }
            let traits = CTFontCopyTraits(font) as NSDictionary
            let weight = (traits[kCTFontWeightTrait] as? NSNumber)?.doubleValue ?? 0
            let face = ImportedFontFace(id: name, label: CTFontCopyFullName(font) as String, family: CTFontCopyFamilyName(font) as String, weight: weight)
            if !faces.contains(where: { $0.id == name }) { faces.append(face) }
        }
        faces.sort { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }
    func importFiles(_ urls: [URL]) {
        var imported = 0; var failures: [String] = []
        for source in urls {
            let access = source.startAccessingSecurityScopedResource()
            defer { if access { source.stopAccessingSecurityScopedResource() } }
            do {
                let ext = source.pathExtension.lowercased()
                guard ["otf", "ttf"].contains(ext) else {
                    throw CustomerError(message: "Use the OTF or TTF edition. WOFF/WOFF2 are website font files; renaming them will not convert them.")
                }
                let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size > 0, size <= 20 * 1024 * 1024 else { throw CustomerError(message: "Choose a font file smaller than 20 MB.") }
                let data = try Data(contentsOf: source)
                let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                let target = directory.appendingPathComponent(digest + "." + ext)
                let existed = FileManager.default.fileExists(atPath: target.path)
                if !existed { try data.write(to: target, options: [.atomic, .completeFileProtection]) }
                do { try register(target); imported += 1 }
                catch { if !existed { try? FileManager.default.removeItem(at: target) }; throw error }
            } catch { failures.append(source.lastPathComponent + ": " + error.localizedDescription) }
        }
        message = ([imported > 0 ? "Imported \(imported) font file(s). Choose where to use them below." : ""] + failures).filter { !$0.isEmpty }.joined(separator: "\n")
    }
    func font(_ role: BrandFontRole, size: CGFloat, relativeTo style: Font.TextStyle) -> Font {
        let name: String
        switch role {
        case .heading: name = heading
        case .body: name = bodyFace
        case .emphasis: name = emphasis
        }
        if let face = faces.first(where: { $0.id == name }) {
            // Light display faces never silently replace readable body text/buttons.
            let minimum = role == .emphasis ? 0.20 : role == .body ? -0.15 : -1.0
            if face.weight >= minimum { return .custom(face.id, size: size, relativeTo: style) }
        }
        return .system(style, design: role == .heading ? .serif : .default).weight(role == .emphasis ? .semibold : .regular)
    }
    func reset() { heading = ""; bodyFace = ""; emphasis = "" }
}

private struct BrandFontModifier: ViewModifier {
    @EnvironmentObject private var fonts: BrandFontStore
    let role: BrandFontRole
    let size: CGFloat
    let style: Font.TextStyle
    func body(content: Content) -> some View { content.font(fonts.font(role, size: size, relativeTo: style)) }
}
extension View {
    func brandFont(_ role: BrandFontRole = .body, size: CGFloat = 17, relativeTo style: Font.TextStyle = .body) -> some View {
        modifier(BrandFontModifier(role: role, size: size, style: style))
    }
}

struct BrandFontSettings: View {
    @EnvironmentObject private var fonts: BrandFontStore
    @State private var importing = false
    var body: some View {
        Form {
            Section("Your font files") {
                Button("Import font files") { importing = true }
                Text("Choose OTF or TTF files from Files or iCloud Drive. Fonts are copied into this app and remembered on this phone.").font(.footnote)
                Text("For a WOFF2 file, use the font’s original OTF/TTF edition. Changing its filename is not enough.").font(.footnote)
                if let message = fonts.message { Text(message).font(.footnote) }
            }
            Section("Where to use them") {
                Picker("Headings", selection: $fonts.heading) {
                    Text("System serif").tag("")
                    ForEach(fonts.faces) { face in Text(face.label).tag(face.id) }
                }
                Picker("Body text", selection: $fonts.bodyFace) {
                    Text("System regular").tag("")
                    ForEach(fonts.faces.filter { $0.weight >= -0.15 }) { face in Text(face.label).tag(face.id) }
                }
                Picker("Buttons and capitals", selection: $fonts.emphasis) {
                    Text("System semibold (readable default)").tag("")
                    ForEach(fonts.faces.filter { $0.weight >= 0.20 }) { face in Text(face.label).tag(face.id) }
                }
                Text("Use Brown Carolina for your chosen text role and Edwardian Script for headings if desired. Import the actual Medium, Semibold or Bold face for buttons and capitals. Light faces are excluded from those controls, and the app keeps a readable semibold fallback when no heavier face is available.").font(.footnote)
                Button("Restore system fonts") { fonts.reset() }
            }
            Section("Live readability preview") {
                VStack(alignment: .leading, spacing: 18) {
                    Text("ATELIER ELUNORA").brandFont(.emphasis, size: 16, relativeTo: .callout).tracking(0.8)
                    Text("Made to be kept.").brandFont(.heading, size: 34, relativeTo: .largeTitle)
                    Text("Your photos, gathered together. ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789").brandFont()
                    Text("Take a photo").brandFont(.emphasis).foregroundStyle(ivory).frame(maxWidth: .infinity, minHeight: 48).background(olive, in: RoundedRectangle(cornerRadius: 10))
                    Text("Continue to secure checkout").brandFont(.emphasis).foregroundStyle(ivory).frame(maxWidth: .infinity, minHeight: 48).background(olive, in: RoundedRectangle(cornerRadius: 10))
                }.padding(.vertical, 10).foregroundStyle(olive)
            }
            Section("Available faces") {
                ForEach(fonts.faces) { face in
                    VStack(alignment: .leading) {
                        Text(face.label).font(.custom(face.id, size: 20, relativeTo: .title3))
                        Text(face.id).font(.caption).textSelection(.enabled)
                        Text(face.weight < -0.15 ? "Light display face · headings only" : face.weight < 0.20 ? "Regular face · headings and body" : "Heavier face · suitable for buttons and capitals").font(.caption)
                    }
                }
            }
            Section {
                Text("These choices style native app screens. Shopify checkout and web pages keep their website fonts. Importing here changes this phone; fonts must be bundled in the Xcode project to ship with everyone’s app.").font(.footnote)
            }
        }.navigationTitle("App fonts")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: true) { result in
                switch result {
                case .success(let urls): fonts.importFiles(urls)
                case .failure(let error): fonts.message = "Could not import fonts: \(error.localizedDescription)"
                }
            }
    }
}
