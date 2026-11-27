package expo.modules.rockvision

import android.app.Activity
import android.graphics.Bitmap
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import java.io.ByteArrayOutputStream
import java.lang.reflect.InvocationTargetException
import java.nio.ByteBuffer
import java.nio.ByteOrder

object DepthSampler {
  private val gate = Any()

  fun captureColor(activity: Activity): Map<String, Any> = readFrame(activity, wantColor = true)

  fun sample(activity: Activity): Map<String, Any> = readFrame(activity, wantColor = false)

  fun readFrame(activity: Activity, wantColor: Boolean): Map<String, Any> {
    synchronized(gate) {
      val root = activity.window?.decorView
        ?: return skipped("The camera view is not on screen.")
      val ar = findNamed(root, "com.viro.core.ViroViewARCore")
        ?: return skipped("The AR camera is not on screen.")
      val session = findTyped(ar, "com.google.ar.core.Session", 0)
      val frame = findTyped(ar, "com.google.ar.core.Frame", 0)
        ?: return skipped("No ARCore frame is available on this tick.")
      val mode = readMode(session)
      val read = readDepth(frame)
      var color: Map<String, Any>? = null
      var colorError: String? = null
      if (wantColor) {
        var image: Any? = null
        try {
          val acquired = acquire(frame, "acquireCameraImage")
          image = acquired.image
          if (image != null) color = yuvToColor(frame, image) else colorError = acquired.error
        } finally {
          closeImage(image)
        }
      }
      val error = read.error ?: colorError
      return mapOf(
        "success" to true,
        "skipped" to (read.points.isEmpty()),
        "mode" to mode,
        "source" to read.source,
        "error" to (error ?: ""),
        "message" to if (read.points.isNotEmpty()) "Depth is on ($mode)." else (error ?: "This depth frame is not ready yet."),
        "points" to read.points,
      ) + (color ?: emptyMap())
    }
  }

  private fun readMode(session: Any?): String {
    if (session == null) return "unknown"
    return try {
      val field = session.javaClass.declaredFields.firstOrNull { it.type.name == "com.google.ar.core.Config" } ?: return "unknown"
      field.isAccessible = true
      val config = field.get(session) as? Any ?: return "unknown"
      config.javaClass.getMethod("getDepthMode").invoke(config).toString().lowercase()
    } catch (error: Exception) {
      "unknown"
    }
  }

  private data class Read(val source: String, val points: List<Map<String, Float>>, val error: String?)
  private data class Acquired(val image: Any?, val error: String?)

  private fun readDepth(frame: Any): Read {
    val raw = readImage(frame, "acquireRawDepthImage16Bits", "acquireRawDepthConfidenceImage", "arcore-raw")
    if (raw.points.isNotEmpty()) return raw
    val smooth = readImage(frame, "acquireDepthImage16Bits", null, "arcore-smooth")
    if (smooth.points.isNotEmpty()) return smooth
    return Read("none", emptyList(), smooth.error ?: raw.error)
  }

  /** Acquire, read, and close one depth image before the next image is requested. */
  private fun readImage(frame: Any, method: String, confidenceMethod: String?, source: String): Read {
    var image: Any? = null
    var confidence: Any? = null
    return try {
      val acquired = acquire(frame, method)
      image = acquired.image
      if (image == null) return Read("none", emptyList(), acquired.error)
      if (confidenceMethod != null) confidence = acquire(frame, confidenceMethod).image
      val points = unproject(frame, image, confidence)
      Read(if (points.isEmpty()) "none" else source, points, null)
    } catch (error: Exception) {
      Read("none", emptyList(), describe(error))
    } finally {
      closeImage(image)
      closeImage(confidence)
    }
  }

  private fun acquire(frame: Any, method: String): Acquired {
    return try {
      Acquired(frame.javaClass.getMethod(method).invoke(frame), null)
    } catch (error: InvocationTargetException) {
      Acquired(null, describe(error.cause ?: error))
    } catch (error: Exception) {
      Acquired(null, describe(error))
    }
  }

  private fun describe(error: Throwable): String {
    val name = error.javaClass.simpleName.ifBlank { error.javaClass.name }
    val detail = error.message?.trim().orEmpty()
    return if (detail.isEmpty()) name else "$name: $detail"
  }

  private fun unproject(frame: Any, image: Any, confidence: Any?): List<Map<String, Float>> {
    val width = image.javaClass.getMethod("getWidth").invoke(image) as Int
    val height = image.javaClass.getMethod("getHeight").invoke(image) as Int
    val planes = image.javaClass.getMethod("getPlanes").invoke(image) as Array<*>
    val plane = planes.firstOrNull() ?: return emptyList()
    val buffer = plane.javaClass.getMethod("getBuffer").invoke(plane) as ByteBuffer
    val rowStride = plane.javaClass.getMethod("getRowStride").invoke(plane) as Int
    val pixelStride = plane.javaClass.getMethod("getPixelStride").invoke(plane) as Int
    val bytes = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
    val confidenceBytes = confidence?.let { confidenceBuffer(it) }
    val camera = frame.javaClass.getMethod("getCamera").invoke(frame)
    val intrinsics = camera.javaClass.getMethod("getImageIntrinsics").invoke(camera)
    val focal = intrinsics.javaClass.getMethod("getFocalLength").invoke(intrinsics) as FloatArray
    val principal = intrinsics.javaClass.getMethod("getPrincipalPoint").invoke(intrinsics) as FloatArray
    val dims = intrinsics.javaClass.getMethod("getImageDimensions").invoke(intrinsics) as IntArray
    val scaleX = width.toFloat() / dims[0].coerceAtLeast(1)
    val scaleY = height.toFloat() / dims[1].coerceAtLeast(1)
    val fx = focal[0] * scaleX
    val fy = focal[1] * scaleY
    val cx = principal[0] * scaleX
    val cy = principal[1] * scaleY
    val pose = camera.javaClass.getMethod("getPose").invoke(camera)
    val points = ArrayList<Map<String, Float>>()
    val step = 8
    var y = step
    while (y < height - step && points.size < 240) {
      var x = step
      while (x < width - step && points.size < 240) {
        val depthMm = bytes.getShort(y * rowStride + x * pixelStride).toInt() and 0xFFFF
        val trusted = confidenceBytes?.let { it.get(y * it.rowStride + x).toInt() and 0xFF >= 96 } ?: true
        if (depthMm in 150..6000 && trusted) {
          val meters = depthMm / 1000f
          val cameraPoint = floatArrayOf((x - cx) * meters / fx, -(y - cy) * meters / fy, -meters)
          val world = pose.javaClass.getMethod("transformPoint", FloatArray::class.java).invoke(pose, cameraPoint) as FloatArray
          points.add(mapOf("x" to world[0], "y" to world[1], "z" to world[2]))
        }
        x += step
      }
      y += step
    }
    return points
  }

  private class Confidence(val bytes: ByteBuffer, val rowStride: Int) {
    fun get(index: Int): Byte = bytes.get(index)
  }

  private fun confidenceBuffer(image: Any): Confidence? {
    return try {
      val planes = image.javaClass.getMethod("getPlanes").invoke(image) as Array<*>
      val plane = planes.firstOrNull() ?: return null
      val buffer = (plane.javaClass.getMethod("getBuffer").invoke(plane) as ByteBuffer).duplicate()
      val rowStride = plane.javaClass.getMethod("getRowStride").invoke(plane) as Int
      Confidence(buffer, rowStride)
    } catch (_: Exception) {
      null
    }
  }

  private fun closeImage(image: Any?) {
    if (image == null) return
    try {
      image.javaClass.getMethod("close").invoke(image)
    } catch (_: Exception) {
      // Already closed.
    }
  }

  private fun findTyped(root: Any, typeName: String, depth: Int): Any? {
    if (depth > 5) return null
    if (root.javaClass.name == typeName) return root
    val fields = root.javaClass.declaredFields
    for (field in fields) {
      field.isAccessible = true
      val value = try {
        field.get(root)
      } catch (_: Exception) {
        null
      } ?: continue
      val name = value.javaClass.name
      if (name == typeName) return value
      if (depth < 4 && (name.startsWith("com.viro") || name.startsWith("com.google.ar"))) {
        findTyped(value, typeName, depth + 1)?.let { return it }
      }
    }
    return null
  }

  private fun findNamed(view: View, typeName: String): View? {
    if (view.javaClass.name == typeName) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findNamed(view.getChildAt(index), typeName)?.let { return it }
      }
    }
    return null
  }

  private fun yuvToColor(frame: Any, image: Any): Map<String, Any> {
    val width = image.javaClass.getMethod("getWidth").invoke(image) as Int
    val height = image.javaClass.getMethod("getHeight").invoke(image) as Int
    val planes = image.javaClass.getMethod("getPlanes").invoke(image) as Array<*>
    val yPlane = planes[0]!!
    val uPlane = planes.getOrNull(1)
    val vPlane = planes.getOrNull(2)
    val yBuffer = planeBuffer(yPlane)
    val uBuffer = uPlane?.let { planeBuffer(it) }
    val vBuffer = vPlane?.let { planeBuffer(it) }
    val step = maxOf(1, maxOf(width, height) / 960)
    val outWidth = width / step
    val outHeight = height / step
    val pixels = IntArray(outWidth * outHeight)
    for (y in 0 until outHeight) {
      for (x in 0 until outWidth) {
        val sx = x * step
        val sy = y * step
        val luma = yBuffer.get(sy, sx).toInt() and 0xFF
        val chromaU = uBuffer?.get(sy / 2, sx / 2)?.toInt()?.and(0xFF) ?: 128
        val chromaV = vBuffer?.get(sy / 2, sx / 2)?.toInt()?.and(0xFF) ?: 128
        val r = (luma + 1.402 * (chromaV - 128)).toInt().coerceIn(0, 255)
        val g = (luma - 0.344136 * (chromaU - 128) - 0.714136 * (chromaV - 128)).toInt().coerceIn(0, 255)
        val b = (luma + 1.772 * (chromaU - 128)).toInt().coerceIn(0, 255)
        pixels[y * outWidth + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
      }
    }
    val bitmap = Bitmap.createBitmap(pixels, outWidth, outHeight, Bitmap.Config.ARGB_8888)
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 86, stream)
    val jpeg = stream.toByteArray()
    val camera = frame.javaClass.getMethod("getCamera").invoke(frame)
    val intrinsics = camera.javaClass.getMethod("getImageIntrinsics").invoke(camera)
    val focal = intrinsics.javaClass.getMethod("getFocalLength").invoke(intrinsics) as FloatArray
    val principal = intrinsics.javaClass.getMethod("getPrincipalPoint").invoke(intrinsics) as FloatArray
    val pose = camera.javaClass.getMethod("getPose").invoke(camera)
    val matrix = FloatArray(16)
    pose.javaClass.getMethod("toMatrix", FloatArray::class.java, Int::class.javaPrimitiveType).invoke(pose, matrix, 0)
    val scale = 1f / step
    return mapOf(
      "success" to true,
      "jpegBase64" to Base64.encodeToString(jpeg, Base64.NO_WRAP),
      "width" to outWidth,
      "height" to outHeight,
      "bytes" to jpeg.size,
      "fx" to focal[0] * scale,
      "fy" to focal[1] * scale,
      "cx" to principal[0] * scale,
      "cy" to principal[1] * scale,
      "worldFromCamera" to matrix.toList(),
      "source" to "arcore-yuv",
    )
  }

  private class Plane(val bytes: ByteBuffer, val rowStride: Int, val pixelStride: Int) {
    fun get(row: Int, col: Int): Byte {
      val index = row * rowStride + col * pixelStride
      if (index < 0 || index >= bytes.limit()) return 0
      return bytes.get(index)
    }
  }

  private fun planeBuffer(plane: Any): Plane {
    val buffer = (plane.javaClass.getMethod("getBuffer").invoke(plane) as ByteBuffer).duplicate().order(ByteOrder.LITTLE_ENDIAN)
    val rowStride = plane.javaClass.getMethod("getRowStride").invoke(plane) as Int
    val pixelStride = plane.javaClass.getMethod("getPixelStride").invoke(plane) as Int
    return Plane(buffer, rowStride, pixelStride)
  }

  private fun skipped(error: String): Map<String, Any> {
    return mapOf(
      "success" to true,
      "skipped" to true,
      "mode" to "waiting",
      "source" to "none",
      "error" to error,
      "message" to error,
      "points" to emptyList<Map<String, Float>>(),
    )
  }

  private fun empty(mode: String, message: String): Map<String, Any> {
    return mapOf("success" to false, "mode" to mode, "source" to "none", "message" to message, "points" to emptyList<Map<String, Float>>())
  }

  private fun depthMessage(mode: String, count: Int): String {
    return when {
      count > 0 -> "Depth is on ($mode)."
      mode == "disabled" -> "ARCore depth is turned off on this session. Overlapping photos will measure the face instead."
      mode == "unavailable" -> "No depth image is available. Overlapping photos will measure the face instead."
      else -> "Depth mode is $mode, but this frame has no depth yet. Keep moving so the phone can build it."
    }
  }
}
