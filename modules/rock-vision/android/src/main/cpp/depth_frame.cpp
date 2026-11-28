#include <jni.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <dlfcn.h>
#include <vector>

// Viro 3.3 keeps the ARCore session as C++ pointers, not Java Session/Frame
// fields. Offsets are from libviro_renderer.so / libviro_arcore.so in
// @reactvision/react-viro 3.3.0:
//   mNativeRef -> shared_ptr { VROSceneRendererARCore*, control }
//   renderer + 0x140 -> VROARSessionARCore*
//   session  + 0x90  -> arcore::Session*
//   session  + 0xa8  -> arcore::Frame*
//   wrapper  + 0x8   -> ArSession* / ArFrame*

namespace {

struct ArSession;
struct ArFrame;
struct ArImage;
struct ArCamera;
struct ArPose;
struct ArCameraIntrinsics;

using AcquireImage = int (*)(const ArSession*, const ArFrame*, ArImage**);
using ImageSize = void (*)(const ArSession*, const ArImage*, int32_t*);
using ImagePlaneI = void (*)(const ArSession*, const ArImage*, int32_t, int32_t*);
using ImagePlaneData = void (*)(const ArSession*, const ArImage*, int32_t, const uint8_t**, int32_t*);
using ImageRelease = void (*)(ArImage*);
using AcquireCamera = void (*)(const ArSession*, const ArFrame*, ArCamera**);
using CameraRelease = void (*)(ArCamera*);
using CameraIntrinsics = void (*)(const ArSession*, const ArCamera*, ArCameraIntrinsics*);
using CameraPose = void (*)(const ArSession*, const ArCamera*, ArPose*);
using IntrinsicsCreate = void (*)(const ArSession*, ArCameraIntrinsics**);
using IntrinsicsDestroy = void (*)(ArCameraIntrinsics*);
using IntrinsicsFocal = void (*)(const ArSession*, const ArCameraIntrinsics*, float*, float*);
using IntrinsicsDims = void (*)(const ArSession*, const ArCameraIntrinsics*, int32_t*, int32_t*);
using PoseCreate = void (*)(const ArSession*, const float*, ArPose**);
using PoseDestroy = void (*)(ArPose*);
using PoseMatrix = void (*)(const ArSession*, const ArPose*, float*);

struct Api {
  AcquireImage rawDepth = nullptr;
  AcquireImage smoothDepth = nullptr;
  AcquireImage confidence = nullptr;
  ImageSize width = nullptr;
  ImageSize height = nullptr;
  ImagePlaneI rowStride = nullptr;
  ImagePlaneI pixelStride = nullptr;
  ImagePlaneData planeData = nullptr;
  ImageRelease release = nullptr;
  AcquireCamera acquireCamera = nullptr;
  CameraRelease releaseCamera = nullptr;
  CameraPose cameraPose = nullptr;
  CameraIntrinsics cameraIntrinsics = nullptr;
  IntrinsicsCreate createIntrinsics = nullptr;
  IntrinsicsDestroy destroyIntrinsics = nullptr;
  IntrinsicsFocal focal = nullptr;
  IntrinsicsFocal principal = nullptr;
  IntrinsicsDims dimensions = nullptr;
  PoseCreate createPose = nullptr;
  PoseDestroy destroyPose = nullptr;
  PoseMatrix poseMatrix = nullptr;
  bool ready = false;
};

Api& api() {
  static Api loaded = [] {
    Api out;
    void* lib = dlopen("libarcore_sdk_c.so", RTLD_NOW | RTLD_NOLOAD);
    if (!lib) lib = dlopen("libarcore_sdk_c.so", RTLD_NOW);
    if (!lib) return out;
    auto load = [lib](const char* name) { return dlsym(lib, name); };
    out.rawDepth = reinterpret_cast<AcquireImage>(load("ArFrame_acquireRawDepthImage16Bits"));
    out.smoothDepth = reinterpret_cast<AcquireImage>(load("ArFrame_acquireDepthImage16Bits"));
    out.confidence = reinterpret_cast<AcquireImage>(load("ArFrame_acquireRawDepthConfidenceImage"));
    out.width = reinterpret_cast<ImageSize>(load("ArImage_getWidth"));
    out.height = reinterpret_cast<ImageSize>(load("ArImage_getHeight"));
    out.rowStride = reinterpret_cast<ImagePlaneI>(load("ArImage_getPlaneRowStride"));
    out.pixelStride = reinterpret_cast<ImagePlaneI>(load("ArImage_getPlanePixelStride"));
    out.planeData = reinterpret_cast<ImagePlaneData>(load("ArImage_getPlaneData"));
    out.release = reinterpret_cast<ImageRelease>(load("ArImage_release"));
    out.acquireCamera = reinterpret_cast<AcquireCamera>(load("ArFrame_acquireCamera"));
    out.releaseCamera = reinterpret_cast<CameraRelease>(load("ArCamera_release"));
    out.cameraPose = reinterpret_cast<CameraPose>(load("ArCamera_getPose"));
    out.cameraIntrinsics = reinterpret_cast<CameraIntrinsics>(load("ArCamera_getImageIntrinsics"));
    out.createIntrinsics = reinterpret_cast<IntrinsicsCreate>(load("ArCameraIntrinsics_create"));
    out.destroyIntrinsics = reinterpret_cast<IntrinsicsDestroy>(load("ArCameraIntrinsics_destroy"));
    out.focal = reinterpret_cast<IntrinsicsFocal>(load("ArCameraIntrinsics_getFocalLength"));
    out.principal = reinterpret_cast<IntrinsicsFocal>(load("ArCameraIntrinsics_getPrincipalPoint"));
    out.dimensions = reinterpret_cast<IntrinsicsDims>(load("ArCameraIntrinsics_getImageDimensions"));
    out.createPose = reinterpret_cast<PoseCreate>(load("ArPose_create"));
    out.destroyPose = reinterpret_cast<PoseDestroy>(load("ArPose_destroy"));
    out.poseMatrix = reinterpret_cast<PoseMatrix>(load("ArPose_getMatrix"));
    out.ready = out.smoothDepth && out.width && out.height && out.rowStride && out.pixelStride && out.planeData &&
                out.release && out.acquireCamera && out.releaseCamera && out.cameraPose && out.cameraIntrinsics &&
                out.createIntrinsics && out.destroyIntrinsics && out.focal && out.principal && out.dimensions &&
                out.createPose && out.destroyPose && out.poseMatrix;
    return out;
  }();
  return loaded;
}

template <typename T>
T readAt(const void* base, size_t offset) {
  T value{};
  std::memcpy(&value, static_cast<const char*>(base) + offset, sizeof(T));
  return value;
}

bool plausible(const void* pointer) {
  const auto value = reinterpret_cast<uintptr_t>(pointer);
  return value > 0x10000 && (value % sizeof(void*)) == 0;
}

struct Handles {
  ArSession* session = nullptr;
  ArFrame* frame = nullptr;
};

Handles handlesFrom(jlong nativeRef) {
  Handles handles;
  if (nativeRef < 0x10000) return handles;
  void* renderer = readAt<void*>(reinterpret_cast<void*>(nativeRef), 0);
  if (!plausible(renderer)) return handles;
  void* sessionObject = readAt<void*>(renderer, 0x140);
  if (!plausible(sessionObject)) return handles;
  void* sessionWrapper = readAt<void*>(sessionObject, 0x90);
  void* frameWrapper = readAt<void*>(sessionObject, 0xa8);
  if (!plausible(sessionWrapper) || !plausible(frameWrapper)) return handles;
  handles.session = readAt<ArSession*>(sessionWrapper, 0x8);
  handles.frame = readAt<ArFrame*>(frameWrapper, 0x8);
  if (!plausible(handles.session) || !plausible(handles.frame)) {
    handles.session = nullptr;
    handles.frame = nullptr;
  }
  return handles;
}

void transform(const float* matrix, float x, float y, float z, float& ox, float& oy, float& oz) {
  ox = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  oy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  oz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
}

std::vector<float> unproject(const Api& symbols, ArSession* session, ArImage* image, ArImage* confidence, const float* matrix, float fx, float fy, float cx, float cy, int32_t intrinsicWidth, int32_t intrinsicHeight) {
  int32_t width = 0;
  int32_t height = 0;
  int32_t rowStride = 0;
  int32_t pixelStride = 0;
  const uint8_t* data = nullptr;
  int32_t dataSize = 0;
  symbols.width(session, image, &width);
  symbols.height(session, image, &height);
  symbols.rowStride(session, image, 0, &rowStride);
  symbols.pixelStride(session, image, 0, &pixelStride);
  symbols.planeData(session, image, 0, &data, &dataSize);
  const uint8_t* confidenceData = nullptr;
  int32_t confidenceStride = 0;
  int32_t confidenceSize = 0;
  if (confidence) {
    symbols.rowStride(session, confidence, 0, &confidenceStride);
    symbols.planeData(session, confidence, 0, &confidenceData, &confidenceSize);
  }
  std::vector<float> points;
  if (!data || width < 8 || height < 8 || pixelStride < 2 || fx < 1.f || fy < 1.f) return points;
  const float scaleX = static_cast<float>(width) / std::max(intrinsicWidth, 1);
  const float scaleY = static_cast<float>(height) / std::max(intrinsicHeight, 1);
  fx *= scaleX;
  fy *= scaleY;
  cx *= scaleX;
  cy *= scaleY;
  const int step = std::max(4, std::max(width, height) / 14);
  points.reserve(160 * 3);
  for (int y = step; y < height - step && points.size() < 160 * 3; y += step) {
    for (int x = step; x < width - step && points.size() < 160 * 3; x += step) {
      const int index = y * rowStride + x * pixelStride;
      if (index < 0 || index + 1 >= dataSize) continue;
      if (confidenceData) {
        const int confidenceIndex = y * confidenceStride + x;
        if (confidenceIndex < 0 || confidenceIndex >= confidenceSize || confidenceData[confidenceIndex] < 96) continue;
      }
      const int millimeters = data[index] | (data[index + 1] << 8);
      if (millimeters < 150 || millimeters > 6000) continue;
      const float meters = millimeters / 1000.f;
      const float cameraX = (x - cx) * meters / fx;
      const float cameraY = -(y - cy) * meters / fy;
      float worldX = 0;
      float worldY = 0;
      float worldZ = 0;
      transform(matrix, cameraX, cameraY, -meters, worldX, worldY, worldZ);
      points.push_back(worldX);
      points.push_back(worldY);
      points.push_back(worldZ);
    }
  }
  return points;
}

struct Shot {
  int status = -101;
  int source = 0;
  std::vector<float> points;
};

Shot readImage(const Api& symbols, ArSession* session, ArFrame* frame, AcquireImage acquire, int source, const float* matrix, float fx, float fy, float cx, float cy, int32_t intrinsicWidth, int32_t intrinsicHeight, bool withConfidence) {
  Shot shot;
  ArImage* image = nullptr;
  ArImage* confidence = nullptr;
  const int status = acquire(session, frame, &image);
  if (status != 0 || !image) {
    if (image) symbols.release(image);
    shot.status = status == 0 ? -12 : status;
    return shot;
  }
  if (withConfidence && symbols.confidence) {
    if (symbols.confidence(session, frame, &confidence) != 0) {
      if (confidence) symbols.release(confidence);
      confidence = nullptr;
    }
  }
  shot.points = unproject(symbols, session, image, confidence, matrix, fx, fy, cx, cy, intrinsicWidth, intrinsicHeight);
  if (confidence) symbols.release(confidence);
  symbols.release(image);
  shot.source = source;
  shot.status = shot.points.empty() ? -102 : 0;
  return shot;
}

jfloatArray pack(JNIEnv* env, int status, int source, const std::vector<float>& points) {
  const jsize count = static_cast<jsize>(3 + points.size());
  std::vector<float> out(static_cast<size_t>(count));
  out[0] = static_cast<float>(status);
  out[1] = static_cast<float>(source);
  out[2] = static_cast<float>(points.size() / 3);
  if (!points.empty()) std::memcpy(out.data() + 3, points.data(), points.size() * sizeof(float));
  jfloatArray array = env->NewFloatArray(count);
  env->SetFloatArrayRegion(array, 0, count, out.data());
  return array;
}

}  // namespace

extern "C" JNIEXPORT jfloatArray JNICALL
Java_expo_modules_rockvision_DepthNative_read(JNIEnv* env, jclass, jlong nativeRef) {
  const Api& symbols = api();
  if (!symbols.ready) return pack(env, -103, 0, {});
  const Handles handles = handlesFrom(nativeRef);
  if (!handles.session || !handles.frame) return pack(env, -101, 0, {});

  ArCamera* camera = nullptr;
  symbols.acquireCamera(handles.session, handles.frame, &camera);
  if (!camera) return pack(env, -101, 0, {});
  ArPose* pose = nullptr;
  ArCameraIntrinsics* intrinsics = nullptr;
  symbols.createPose(handles.session, nullptr, &pose);
  symbols.createIntrinsics(handles.session, &intrinsics);
  symbols.cameraPose(handles.session, camera, pose);
  symbols.cameraIntrinsics(handles.session, camera, intrinsics);
  float matrix[16] = {};
  float fx = 0;
  float fy = 0;
  float cx = 0;
  float cy = 0;
  int32_t imageWidth = 1;
  int32_t imageHeight = 1;
  symbols.poseMatrix(handles.session, pose, matrix);
  symbols.focal(handles.session, intrinsics, &fx, &fy);
  symbols.principal(handles.session, intrinsics, &cx, &cy);
  symbols.dimensions(handles.session, intrinsics, &imageWidth, &imageHeight);
  symbols.destroyPose(pose);
  symbols.destroyIntrinsics(intrinsics);
  symbols.releaseCamera(camera);
  if (fx < 1.f || fy < 1.f) return pack(env, -104, 0, {});

  if (symbols.rawDepth) {
    Shot raw = readImage(symbols, handles.session, handles.frame, symbols.rawDepth, 1, matrix, fx, fy, cx, cy, imageWidth, imageHeight, true);
    if (raw.status == 0) return pack(env, 0, raw.source, raw.points);
    if (raw.status == -11) return pack(env, raw.status, 0, {});
  }
  Shot smooth = readImage(symbols, handles.session, handles.frame, symbols.smoothDepth, 2, matrix, fx, fy, cx, cy, imageWidth, imageHeight, false);
  if (smooth.status == 0) return pack(env, 0, smooth.source, smooth.points);
  return pack(env, smooth.status, 0, {});
}
