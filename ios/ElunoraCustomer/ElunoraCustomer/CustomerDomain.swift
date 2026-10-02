import Foundation

enum CustomerTab: Hashable { case capture, photos, order, galleries, account }

enum CustomerLink: Equatable {
    case event(String)
    case galleries
    case order
    static func parse(_ url: URL) -> CustomerLink? {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              ["atelierelunora.com", "www.atelierelunora.com"].contains(url.host?.lowercased() ?? "") else { return nil }
        switch url.path {
        case "/pages/share-photos":
            guard let fragment = URLComponents(url: url, resolvingAgainstBaseURL: false)?.fragment,
                  let items = URLComponents(string: "https://event.invalid/?" + fragment)?.queryItems,
                  items.filter({ $0.name == "event" }).count == 1,
                  let value = items.first(where: { $0.name == "event" })?.value,
                  value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return nil }
            return .event(url.absoluteString)
        case "/pages/client-gallery": return .galleries
        case "/pages/photo-magnets": return .order
        default: return nil
        }
    }
}

enum CropGeometry {
    static func clamped(_ value: Double, _ range: ClosedRange<Double>) -> Double {
        value.isFinite ? min(range.upperBound, max(range.lowerBound, value)) : range.lowerBound
    }
    static func side(width: Double, height: Double, zoom: Double) -> Double {
        max(0, min(width, height)) / clamped(zoom, 1...3)
    }
    static func shifted(position: Double, translation: Double, imageDimension: Double, cropSide: Double, viewSide: Double) -> Double {
        let travel = imageDimension - cropSide
        guard travel > 0, viewSide > 0 else { return position }
        return clamped(position - translation * cropSide / viewSide / travel * 100, 0...100)
    }
}

enum CustomerDates {
    static func parse(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

enum UploadRetryPolicy {
    static func delay(attempt: Int) -> TimeInterval { min(300, pow(2, Double(min(8, max(0, attempt)))) * 2) }
    static func retryable(status: Int?) -> Bool { status == nil || status == 408 || status == 429 || (status ?? 0) >= 500 }
}
