import ExpoModulesCore
import ARKit
import UIKit

public class RockVisionModule: Module {
  private var session: ARSession?

  public func definition() -> ModuleDefinition {
    Name("RockVision")

    OnCreate {
      NotificationCenter.default.addObserver(
        forName: Notification.Name("VROARDetectorFrame"),
        object: nil,
        queue: .main
      ) { [weak self] note in
        self?.session = note.userInfo?["session"] as? ARSession
      }
    }

    AsyncFunction("captureColor") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let frame = self.session?.currentFrame else {
          promise.resolve(["success": false, "error": "No ARKit frame yet"])
          return
        }
        promise.resolve(Self.colorPayload(frame))
      }
    }

    AsyncFunction("describe") { (jpegBase64: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        promise.resolve(Self.describe(jpegBase64))
      }
    }
  }

  private static func colorPayload(_ frame: ARFrame) -> [String: Any] {
    let pixel = frame.capturedImage
    guard let image = colorImage(pixel) else {
      return ["success": false, "error": "Could not read the camera image"]
    }
    let longest = max(image.size.width, image.size.height)
    let scale: CGFloat = longest > 1280 ? 1280 / longest : 1
    let sized = scale < 1 ? scaleImage(image, scale) : image
    guard let jpeg = sized.jpegData(compressionQuality: 0.86) else {
      return ["success": false, "error": "JPEG encoding failed"]
    }
    let intrinsics = frame.camera.intrinsics
    let pose = frame.camera.transform
    var matrix: [Float] = []
    for column in 0..<4 {
      matrix.append(pose[column][0])
      matrix.append(pose[column][1])
      matrix.append(pose[column][2])
      matrix.append(pose[column][3])
    }
    return [
      "success": true,
      "jpegBase64": jpeg.base64EncodedString(),
      "width": Int(sized.size.width * sized.scale),
      "height": Int(sized.size.height * sized.scale),
      "fx": intrinsics[0][0] * Float(scale),
      "fy": intrinsics[1][1] * Float(scale),
      "cx": intrinsics[2][0] * Float(scale),
      "cy": intrinsics[2][1] * Float(scale),
      "worldFromCamera": matrix,
      "source": "arkit",
    ]
  }

  private static func colorImage(_ pixel: CVPixelBuffer) -> UIImage? {
    CVPixelBufferLockBaseAddress(pixel, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixel, .readOnly) }
    let width = CVPixelBufferGetWidth(pixel)
    let height = CVPixelBufferGetHeight(pixel)
    guard let yBase = CVPixelBufferGetBaseAddressOfPlane(pixel, 0),
          let uvBase = CVPixelBufferGetBaseAddressOfPlane(pixel, 1) else { return nil }
    let yStride = CVPixelBufferGetBytesPerRowOfPlane(pixel, 0)
    let uvStride = CVPixelBufferGetBytesPerRowOfPlane(pixel, 1)
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    let yPtr = yBase.assumingMemoryBound(to: UInt8.self)
    let uvPtr = uvBase.assumingMemoryBound(to: UInt8.self)
    for y in 0..<height {
      for x in 0..<width {
        let yValue = Int(yPtr[y * yStride + x])
        let uvIndex = (y / 2) * uvStride + (x / 2) * 2
        let u = Int(uvPtr[uvIndex]) - 128
        let v = Int(uvPtr[uvIndex + 1]) - 128
        let r = min(255, max(0, yValue + Int(1.402 * Double(v))))
        let g = min(255, max(0, yValue - Int(0.344136 * Double(u) + 0.714136 * Double(v))))
        let b = min(255, max(0, yValue + Int(1.772 * Double(u))))
        let index = (y * width + x) * 4
        rgba[index] = UInt8(r)
        rgba[index + 1] = UInt8(g)
        rgba[index + 2] = UInt8(b)
        rgba[index + 3] = 255
      }
    }
    let data = Data(rgba)
    guard let provider = CGDataProvider(data: data as CFData) else { return nil }
    let space = CGColorSpaceCreateDeviceRGB()
    guard let cg = CGImage(
      width: width,
      height: height,
      bitsPerComponent: 8,
      bitsPerPixel: 32,
      bytesPerRow: width * 4,
      space: space,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
      provider: provider,
      decode: nil,
      shouldInterpolate: false,
      intent: .defaultIntent
    ) else { return nil }
    return UIImage(cgImage: cg)
  }

  private static func scaleImage(_ image: UIImage, _ scale: CGFloat) -> UIImage {
    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
  }

  private static func describe(_ jpegBase64: String) -> [String: Any] {
    guard let data = Data(base64Encoded: jpegBase64), let image = UIImage(data: data), let cg = image.cgImage else {
      return ["points": [], "sharpness": 0]
    }
    let width = cg.width
    let height = cg.height
    guard let bytes = rgba(cg) else { return ["points": [], "sharpness": 0] }
    var points: [[String: Any]] = []
    let step = max(8, min(width, height) / 40)
    var best = 0
    for y in stride(from: step, to: height - step, by: step) {
      for x in stride(from: step, to: width - step, by: step) {
        let score = contrast(bytes, width, x, y)
        if score > best { best = score }
        if score < 28 { continue }
        points.append(["x": x, "y": y, "d": descriptor(bytes, width, height, x, y)])
        if points.count >= 160 { break }
      }
      if points.count >= 160 { break }
    }
    return ["points": points, "sharpness": best]
  }

  private static func rgba(_ image: CGImage) -> [UInt8]? {
    let width = image.width
    let height = image.height
    var data = [UInt8](repeating: 0, count: width * height * 4)
    guard let context = CGContext(
      data: &data,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { return nil }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return data
  }

  private static func contrast(_ rgba: [UInt8], _ width: Int, _ x: Int, _ y: Int) -> Int {
    let center = Int(rgba[(y * width + x) * 4])
    let left = Int(rgba[(y * width + (x - 3)) * 4])
    let right = Int(rgba[(y * width + (x + 3)) * 4])
    let up = Int(rgba[((y - 3) * width + x) * 4])
    let down = Int(rgba[((y + 3) * width + x) * 4])
    return abs(center - left) + abs(center - right) + abs(center - up) + abs(center - down)
  }

  private static func descriptor(_ rgba: [UInt8], _ width: Int, _ height: Int, _ x: Int, _ y: Int) -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    var state: UInt32 = 0x1234567
    for index in 0..<256 {
      state = state &* 1103515245 &+ 12345
      let x1 = Int((state >> 16) & 31) - 15
      state = state &* 1103515245 &+ 12345
      let y1 = Int((state >> 16) & 31) - 15
      state = state &* 1103515245 &+ 12345
      let x2 = Int((state >> 16) & 31) - 15
      state = state &* 1103515245 &+ 12345
      let y2 = Int((state >> 16) & 31) - 15
      let left = sample(rgba, width, height, x + x1, y + y1)
      let right = sample(rgba, width, height, x + x2, y + y2)
      if left < right { bytes[index >> 3] |= 1 << (index & 7) }
    }
    return Data(bytes).base64EncodedString()
  }

  private static func sample(_ rgba: [UInt8], _ width: Int, _ height: Int, _ x: Int, _ y: Int) -> UInt8 {
    if x < 0 || y < 0 || x >= width || y >= height { return 0 }
    return rgba[(y * width + x) * 4]
  }
}
