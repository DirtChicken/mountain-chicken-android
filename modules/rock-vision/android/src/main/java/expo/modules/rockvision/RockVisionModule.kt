package expo.modules.rockvision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume

class RockVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RockVision")

    AsyncFunction("captureColor") Coroutine { ->
      withContext(Dispatchers.Main) {
        val activity = appContext.currentActivity
          ?: return@withContext mapOf("success" to false, "error" to "No activity")
        val root = activity.window?.decorView
          ?: return@withContext mapOf("success" to false, "error" to "No window")
        val ar = findNamed(root, "com.viro.core.ViroViewARCore")
          ?: return@withContext mapOf("success" to false, "error" to "The AR camera is not on screen")
        val surface = ar.javaClass.methods.firstOrNull { it.name == "getSurfaceView" }?.invoke(ar) as? SurfaceView
          ?: return@withContext mapOf("success" to false, "error" to "No camera surface")
        if (surface.width < 2 || surface.height < 2) {
          return@withContext mapOf("success" to false, "error" to "Camera surface is not ready")
        }
        val bitmap = Bitmap.createBitmap(surface.width, surface.height, Bitmap.Config.ARGB_8888)
        suspendCancellableCoroutine { continuation ->
          PixelCopy.request(surface, bitmap, { result ->
            if (result != PixelCopy.SUCCESS) {
              continuation.resume(mapOf("success" to false, "error" to "Could not copy the camera image"))
              return@request
            }
            val scaled = limit(bitmap, 1280)
            val stream = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 86, stream)
            continuation.resume(
              mapOf(
                "success" to true,
                "jpegBase64" to Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP),
                "width" to scaled.width,
                "height" to scaled.height,
                "source" to "arcore-display",
              )
            )
          }, Handler(Looper.getMainLooper()))
        }
      }
    }

    AsyncFunction("describe") Coroutine { jpegBase64: String ->
      withContext(Dispatchers.Default) {
        val bytes = Base64.decode(jpegBase64, Base64.DEFAULT)
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
          ?: return@withContext mapOf("points" to emptyList<Map<String, Any>>(), "sharpness" to 0)
        val scaled = limit(bitmap, 480)
        val width = scaled.width
        val height = scaled.height
        val pixels = IntArray(width * height)
        scaled.getPixels(pixels, 0, width, 0, 0, width, height)
        val points = ArrayList<Map<String, Any>>()
        val step = maxOf(8, minOf(width, height) / 40)
        var best = 0
        var y = step
        while (y < height - step && points.size < 160) {
          var x = step
          while (x < width - step && points.size < 160) {
            val score = contrast(pixels, width, x, y)
            if (score > best) best = score
            if (score >= 28) {
              points.add(mapOf("x" to x * bitmap.width / width, "y" to y * bitmap.height / height, "d" to descriptor(pixels, width, height, x, y)))
            }
            x += step
          }
          y += step
        }
        mapOf("points" to points, "sharpness" to best)
      }
    }
  }
}

private fun findNamed(view: View, name: String): View? {
  if (view.javaClass.name == name) return view
  if (view is ViewGroup) {
    for (index in 0 until view.childCount) {
      findNamed(view.getChildAt(index), name)?.let { return it }
    }
  }
  return null
}

private fun limit(bitmap: Bitmap, maxSide: Int): Bitmap {
  val longest = maxOf(bitmap.width, bitmap.height)
  if (longest <= maxSide) return bitmap
  val scale = maxSide.toFloat() / longest
  return Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
}

private fun gray(pixel: Int): Int = (pixel shr 16) and 255

private fun contrast(pixels: IntArray, width: Int, x: Int, y: Int): Int {
  val center = gray(pixels[y * width + x])
  val left = gray(pixels[y * width + (x - 3)])
  val right = gray(pixels[y * width + (x + 3)])
  val up = gray(pixels[(y - 3) * width + x])
  val down = gray(pixels[(y + 3) * width + x])
  return kotlin.math.abs(center - left) + kotlin.math.abs(center - right) + kotlin.math.abs(center - up) + kotlin.math.abs(center - down)
}

private fun descriptor(pixels: IntArray, width: Int, height: Int, x: Int, y: Int): String {
  val bytes = ByteArray(32)
  var state = 0x1234567
  for (index in 0 until 256) {
    state = state * 1103515245 + 12345
    val x1 = ((state ushr 16) and 31) - 15
    state = state * 1103515245 + 12345
    val y1 = ((state ushr 16) and 31) - 15
    state = state * 1103515245 + 12345
    val x2 = ((state ushr 16) and 31) - 15
    state = state * 1103515245 + 12345
    val y2 = ((state ushr 16) and 31) - 15
    if (sample(pixels, width, height, x + x1, y + y1) < sample(pixels, width, height, x + x2, y + y2)) {
      bytes[index shr 3] = (bytes[index shr 3].toInt() or (1 shl (index and 7))).toByte()
    }
  }
  return Base64.encodeToString(bytes, Base64.NO_WRAP)
}

private fun sample(pixels: IntArray, width: Int, height: Int, x: Int, y: Int): Int {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0
  return gray(pixels[y * width + x])
}
