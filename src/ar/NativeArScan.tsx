import { useEffect, useRef } from "react";
import { Dimensions, StyleSheet } from "react-native";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroARTrackingReasonConstants,
  ViroTrackingStateConstants,
  type ViroARHitTestResult,
} from "@reactvision/react-viro";
import { bestHit, hitPosition, sampleKind } from "./hits";
import { addScanPhoto, getCaptureSnapshot, noteCameraOrigin, noteSample, noteTracking, noteWorldMesh } from "../state/scanCapture";

type SceneProps = {
  arSceneNavigator: {
    getWorldMeshStats?: () => Promise<{
      available: boolean;
      vertexCount?: number;
      triangleCount?: number;
      source?: string;
      accumulated?: boolean;
    }>;
    captureVPSQueryFrame?: (maxSide?: number) => Promise<{
      success: boolean;
      image?: string;
      width?: number;
      height?: number;
      fx?: number;
      fy?: number;
      cx?: number;
      cy?: number;
      worldFromCamera?: number[];
      error?: string;
    }>;
  };
};

function ScanScene(props?: SceneProps) {
  const sceneRef = useRef<ViroARScene>(null);
  const navigator = props?.arSceneNavigator;

  useEffect(() => {
    let alive = true;
    const statsTimer = setInterval(() => {
      void navigator?.getWorldMeshStats?.().then((stats) => {
        if (!alive || !stats?.available) return;
        noteWorldMesh(stats);
      }).catch(() => undefined);
    }, 700);

    const gridTimer = setInterval(() => {
      void sampleGrid(sceneRef.current);
    }, 500);
    const photoTimer = setInterval(() => {
      void capturePhoto(sceneRef.current, navigator);
    }, 1400);

    return () => {
      alive = false;
      clearInterval(statsTimer);
      clearInterval(gridTimer);
      clearInterval(photoTimer);
    };
  }, [navigator]);

  return (
    <ViroARScene
      ref={sceneRef}
      anchorDetectionTypes={["PlanesHorizontal", "PlanesVertical"]}
      onTrackingUpdated={(state, reason) => noteTracking(trackingLabel(state), coachingFor(state, reason))}
      onCameraARHitTest={(event) => {
        const [x, y, z] = event.cameraOrientation.position;
        noteCameraOrigin({ x, y, z });
        const hit = bestHit(event.hitTestResults as ViroARHitTestResult[]);
        if (!hit) return;
        noteSample(hitPosition(hit), sampleKind(hit.type));
      }}
    />
  );
}

async function capturePhoto(
  scene: ViroARScene | null,
  navigator: SceneProps["arSceneNavigator"] | undefined,
): Promise<void> {
  if (!navigator?.captureVPSQueryFrame || getCaptureSnapshot().tracking !== "locked") return;
  try {
    const frame = await navigator.captureVPSQueryFrame(480);
    if (!frame.success || !frame.image || !frame.width || !frame.height || !frame.fx || !frame.fy) return;
    let position;
    let forward;
    let up;
    const pose = await scene?.getCameraOrientationAsync();
    if (pose) {
      position = { x: pose.position[0], y: pose.position[1], z: pose.position[2] };
      forward = { x: pose.forward[0], y: pose.forward[1], z: pose.forward[2] };
      up = { x: pose.up[0], y: pose.up[1], z: pose.up[2] };
    }
    addScanPhoto({
      width: frame.width,
      height: frame.height,
      fx: frame.fx,
      fy: frame.fy,
      cx: frame.cx ?? frame.width / 2,
      cy: frame.cy ?? frame.height / 2,
      worldFromCamera: frame.worldFromCamera,
      position,
      forward,
      up,
      jpegBase64: frame.image,
    });
  } catch {
    // A missed photo does not stop the scan.
  }
}

async function sampleGrid(scene: ViroARScene | null): Promise<void> {
  if (!scene) return;
  const { width, height } = Dimensions.get("window");
  const xs = [0.22, 0.5, 0.78];
  const ys = [0.28, 0.5, 0.72];
  for (const y of ys) {
    for (const x of xs) {
      try {
        const hits = (await scene.performARHitTestWithPoint(width * x, height * y)) as ViroARHitTestResult[];
        const hit = bestHit(hits);
        if (hit) noteSample(hitPosition(hit), sampleKind(hit.type));
      } catch {
        return;
      }
    }
  }
}

function trackingLabel(state: number): string {
  if (state === ViroTrackingStateConstants.TRACKING_NORMAL) return "locked";
  if (state === ViroTrackingStateConstants.TRACKING_LIMITED) return "limited";
  return "searching";
}

function coachingFor(state: number, reason: number): string {
  if (state === ViroTrackingStateConstants.TRACKING_NORMAL) {
    return "Walk a slow half-circle. The camera is photographing the face while the mesh locks in.";
  }
  if (reason === ViroARTrackingReasonConstants.TRACKING_REASON_EXCESSIVE_MOTION) {
    return "Slow down. Sidestep, don't swing the phone.";
  }
  if (reason === ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_FEATURES) {
    return "The face looks blank. Angle across grain, chalk, and cracks.";
  }
  if (reason === ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_LIGHT) {
    return "Too dark to lock the rock. Find some light on the face.";
  }
  return "Point at the rock and move until tracking locks.";
}

export function NativeArScan() {
  return (
    <ViroARSceneNavigator
      initialScene={{ scene: ScanScene }}
      style={styles.fill}
      worldMeshEnabled
      depthEnabled
      depthCaptureEnabled
      occlusionMode="depthBased"
      provider="none"
      worldMeshConfig={{
        accumulate: true,
        voxelSize: 0.03,
        maxMemoryMB: 96,
        maxDepth: 6,
        stride: 2,
        minConfidence: 0.2,
        debugDrawEnabled: true,
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
