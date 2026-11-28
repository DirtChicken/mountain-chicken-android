package expo.modules.rockvision

object DepthNative {
  init {
    System.loadLibrary("rockvision_depth")
  }

  /** Packed as status, source, count, then x,y,z triples. Called on the GL thread. */
  external fun read(nativeRef: Long): FloatArray
}
