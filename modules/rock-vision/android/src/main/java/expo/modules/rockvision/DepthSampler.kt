package expo.modules.rockvision

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import java.lang.reflect.InvocationTargetException
import java.nio.ByteBuffer
import java.nio.ByteOrder

object DepthSampler {
  fun sample(activity: Activity): Map<String, Any> {
    val root = activity.window?.decorView
      ?: return empty("unavailable", "The camera view is not on screen.")
    val ar = findNamed(root, "com.viro.core.ViroViewARCore")
      ?: return empty("unavailable", "The AR camera is not on screen.")
    val session = findTyped(ar, "com.google.ar.core.Session", 0)
    val frame = findTyped(ar, "com.google.ar.core.Frame", 0)
    if (session == null && frame == null) {
      return empty(
        "unavailable",
        "ARCore depth is not readable from this session. The scan will measure the face from overlapping photos instead.",
      )
    }
    val mode = session?.let { ensureAutomatic(it) } ?: "unknown"
    val live = frame ?: return mapOf(
      "success" to true,
      "mode" to mode,
      "source" to "none",
      "message" to depthMessage(mode, 0),
      "points" to emptyList<Map<String, Float>>(),
    )
    val read = readDepth(live)
    return mapOf(
      "success" to true,
      "mode" to mode,
      "source" to read.source,
      "message" to depthMessage(mode, read.points.size),
      "points" to read.points,
    )
  }

  private fun ensureAutomatic(session: Any): String {
    val config = session.javaClass.declaredFields.firstOrNull { it.type.name == "com.google.ar.core.Config" }?.let { field ->
      field.isAccessible = true
      field.get(session)
    } ?: return "unknown"
    val current = config.javaClass.getMethod("getDepthMode").invoke(config).toString()
    if (current != "DISABLED") return current.lowercase()
    val modeClass = Class.forName("com.google.ar.core.Config\$DepthMode")
    val automatic = modeClass.enumConstants?.firstOrNull { it.toString() == "AUTOMATIC" } ?: return "disabled"
    val supported = session.javaClass.getMethod("isDepthModeSupported", modeClass).invoke(session, automatic) as Boolean
    if (!supported) return "disabled"
    config.javaClass.getMethod("setDepthMode", modeClass).invoke(config, automatic)
    session.javaClass.getMethod("configure", config.javaClass).invoke(session, config)
    return "automatic"
  }

  private data class Read(val source: String, val points: List<Map<String, Float>>)

  private fun readDepth(frame: Any): Read {
    val raw = invokeImage(frame, "acquireRawDepthImage16Bits")
    if (raw != null) {
      val confidence = invokeImage(frame, "acquireRawDepthConfidenceImage")
      val points = unproject(frame, raw, confidence)
      closeImage(raw)
      closeImage(confidence)
      if (points.isNotEmpty()) return Read("arcore-raw", points)
    }
    val smooth = invokeImage(frame, "acquireDepthImage16Bits") ?: return Read("none", emptyList())
    val points = unproject(frame, smooth, null)
    closeImage(smooth)
    return Read(if (points.isEmpty()) "none" else "arcore-smooth", points)
  }

  private fun invokeImage(frame: Any, method: String): Any? {
    return try {
      frame.javaClass.getMethod(method).invoke(frame)
    } catch (error: InvocationTargetException) {
      val name = error.cause?.javaClass?.name ?: ""
      if (name.contains("NotYetAvailable")) null else null
    } catch (_: Exception) {
      null
    }
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
