import SwiftUI
import CoreText
import UIKit

struct ImportedFontFace: Identifiable {
    let id: String
    let label: String
    let family: String
    let weight: Double
}
enum BrandFontRole { case heading, body, emphasis }

@MainActor final class BrandFontStore: ObservableObject {
    @Published private(set) var faces: [ImportedFontFace] = []
    @Published private(set) var heading = ""
    @Published private(set) var bodyFace = ""
    @Published private(set) var emphasis = ""
    @Published private(set) var message: String?

    init() {
        guard let folder = Bundle.main.url(forResource: "BrandedFonts", withExtension: nil) else {
            message = "Add your OTF or TTF files to the BrandedFonts folder, then rebuild the app."
            return
        }
        var failures: [String] = []
        // Enumerate the copied folder, including nested subfolders and uppercase extensions.
        if let files = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) {
            for case let url as URL in files {
                let ext = url.pathExtension.lowercased()
                if ["woff", "woff2"].contains(ext) {
                    failures.append("\(url.lastPathComponent): use the original OTF/TTF edition of this web font.")
                } else if ["otf", "ttf"].contains(ext) {
                    do { try register(url) }
                    catch { failures.append("\(url.lastPathComponent): \(error.localizedDescription)") }
                }
            }
        }
        faces.sort { $0.id.localizedStandardCompare($1.id) == .orderedAscending }
        applyBrandDefaults()
        if !failures.isEmpty { message = failures.joined(separator: "\n") }
        else if faces.isEmpty { message = "Add your OTF or TTF files to BrandedFonts and rebuild. System fonts are active until then." }
    }

    private func register(_ url: URL) throws {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], !descriptors.isEmpty else {
            throw CustomerError(message: "This file is not a readable OpenType or TrueType font.")
        }
        var registrationError: Unmanaged<CFError>?
        let registered = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &registrationError)
        let failure = registrationError?.takeRetainedValue()
        if !registered {
            guard let failure, CFErrorGetCode(failure) == CTFontManagerError.alreadyRegistered.rawValue else {
                throw CustomerError(message: "iOS could not register this font.")
            }
        }
        for descriptor in descriptors {
            let font = CTFontCreateWithFontDescriptor(descriptor, 17, nil)
            let name = CTFontCopyPostScriptName(font) as String
            guard UIFont(name: name, size: 17) != nil else { throw CustomerError(message: "iOS could not load this font face.") }
            let traits = CTFontCopyTraits(font) as NSDictionary
            let weight = (traits[kCTFontWeightTrait] as? NSNumber)?.doubleValue ?? 0
            let face = ImportedFontFace(id: name, label: CTFontCopyFullName(font) as String, family: CTFontCopyFamilyName(font) as String, weight: weight)
            if !faces.contains(where: { $0.id == name }) { faces.append(face) }
        }
    }

    private func normalized(_ face: ImportedFontFace) -> String {
        (face.family + face.label + face.id).lowercased().filter { $0.isLetter || $0.isNumber }
    }
    private func closest(_ candidates: [ImportedFontFace], weight: Double) -> ImportedFontFace? {
        candidates.sorted {
            let first = abs($0.weight - weight), second = abs($1.weight - weight)
            return first == second ? $0.id < $1.id : first < second
        }.first
    }
    private func applyBrandDefaults() {
        let brown = faces.filter { normalized($0).contains("browncarolina") }
        let script = faces.filter { normalized($0).contains("edwardian") }
        // A single alternative family is also usable by simply dropping it in the folder.
        // Avoid choosing an unrelated family for the body when a display script is present.
        let textFaces = brown.isEmpty ? faces.filter { !normalized($0).contains("edwardian") } : brown
        bodyFace = closest(textFaces.filter { $0.weight >= -0.15 }, weight: 0)?.id ?? ""
        heading = closest(script, weight: 0)?.id ?? closest(textFaces, weight: 0)?.id ?? ""
        emphasis = closest(textFaces.filter { $0.weight >= 0.20 }, weight: 0.30)?.id ?? ""
    }
    func font(_ role: BrandFontRole, size: CGFloat, relativeTo style: Font.TextStyle) -> Font {
        if role == .body { return .system(style) }
        if role == .emphasis { return .system(style).weight(.semibold) }
        let name: String
        switch role {
        case .heading: name = heading
        case .body: name = bodyFace
        case .emphasis: name = emphasis
        }
        if !name.isEmpty { return .custom(name, size: size, relativeTo: style) }
        return .system(style, design: role == .heading ? .serif : .default).weight(role == .emphasis ? .semibold : .regular)
    }
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
    var body: some View {
        List {
            Section("Brand fonts") {
                Text("Your brand fonts are included with the app and applied automatically.")
                if let message = fonts.message { Text(message).font(.footnote).foregroundStyle(.secondary) }
                Text("Headings: \(fonts.heading.isEmpty ? "System serif" : fonts.heading)").font(.footnote)
                Text("Body: System regular (Dynamic Type)").font(.footnote)
                Text("Buttons and capitals: System semibold (Dynamic Type)").font(.footnote)
            }
            Section("Readability preview") {
                VStack(alignment: .leading, spacing: 18) {
                    Text("ATELIER ELUNORA").brandFont(.emphasis, size: 16, relativeTo: .callout).tracking(0.8)
                    Text("Made to be kept.").brandFont(.heading, size: 34, relativeTo: .largeTitle)
                    Text("Your photos, gathered together. ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789").brandFont()
                    Text("Take a photo").brandFont(.emphasis).foregroundStyle(ivory).frame(maxWidth: .infinity, minHeight: 48).background(olive, in: RoundedRectangle(cornerRadius: 10))
                    Text("Continue to secure checkout").brandFont(.emphasis).foregroundStyle(ivory).frame(maxWidth: .infinity, minHeight: 48).background(olive, in: RoundedRectangle(cornerRadius: 10))
                }.padding(.vertical, 10).foregroundStyle(olive)
            }
        }.navigationTitle("App fonts")
    }
}
