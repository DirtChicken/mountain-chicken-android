import { useEffect, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import {
  Viro3DSceneNavigator,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroGeometry,
  ViroMaterials,
  ViroOrbitCamera,
  ViroPolyline,
  ViroScene,
  ViroSphere,
} from "@reactvision/react-viro";
import { noteScreen } from "../device/diagnostics";
import type { Route, RoutePoint, Vector3 } from "../domain/types";
import { diagonal, midpoint } from "../domain/vec";
import { logError } from "../log";
import { VIEWER_LIMITS } from "../mesh/prepareMesh";
import type { SurfaceMesh } from "../mesh/types";
import { colors } from "../theme/theme";
import { orbitEye, rayFromScreen } from "../viewer/math";
import { raycastMesh } from "../viewer/raycast";
import { placeMesh } from "../ar/placeMesh";

ViroMaterials.createMaterials({
  mcViewSand: { lightingModel: "Lambert", diffuseColor: "#C4A574", cullMode: "None" },
  mcViewCopper: { lightingModel: "Constant", diffuseColor: "#E08A3C" },
  mcViewChalk: { lightingModel: "Constant", diffuseColor: "#F6F1E7" },
  mcViewAmber: { lightingModel: "Constant", diffuseColor: "#F0B429" },
});

type Props = {
  mesh: SurfaceMesh;
  routes?: Route[];
  draft?: RoutePoint[];
  onPick?: (point: Vector3) => void;
  hint?: string;
};

const camera = {
  mesh: null as SurfaceMesh | null,
  routes: [] as Route[],
  draft: [] as RoutePoint[],
  yaw: 0.8,
  pitch: 0.4,
  distance: 2.5,
  target: { x: 0, y: 1, z: 0 } as Vector3,
  revision: 0,
  onPick: undefined as ((point: Vector3) => void) | undefined,
  width: 1,
  height: 1,
  moved: false,
  lastX: 0,
  lastY: 0,
  span: 0,
};

let bumpView = () => {};

const pan = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onMoveShouldSetPanResponder: () => true,
  onPanResponderGrant: (event) => {
    camera.moved = false;
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) {
      camera.span = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
    }
    camera.lastX = event.nativeEvent.locationX;
    camera.lastY = event.nativeEvent.locationY;
  },
  onPanResponderMove: (event) => {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) {
      const span = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
      if (camera.span > 0) camera.distance = Math.min(40, Math.max(0.3, camera.distance * (camera.span / span)));
      camera.span = span;
      camera.moved = true;
      bumpView();
      return;
    }
    const dx = event.nativeEvent.locationX - camera.lastX;
    const dy = event.nativeEvent.locationY - camera.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) camera.moved = true;
    camera.yaw -= dx * 0.01;
    camera.pitch = Math.min(1.2, Math.max(-1.1, camera.pitch + dy * 0.008));
    camera.lastX = event.nativeEvent.locationX;
    camera.lastY = event.nativeEvent.locationY;
    bumpView();
  },
  onPanResponderRelease: (event) => {
    if (camera.moved || !camera.onPick || !camera.mesh) return;
    const hit = raycastMesh(
      camera.mesh,
      rayFromScreen({
        touchX: event.nativeEvent.locationX,
        touchY: event.nativeEvent.locationY,
        width: camera.width,
        height: camera.height,
        target: camera.target,
        yaw: camera.yaw,
        pitch: camera.pitch,
        distance: camera.distance,
      }),
    );
    if (hit) camera.onPick(hit.point);
  },
});

function RockScene() {
  const mesh = camera.mesh;
  if (!mesh) return <ViroScene />;
  let placed;
  try {
    placed = placeMesh(mesh, { x: 0, y: 0, z: 0 }, 0, 1, VIEWER_LIMITS);
  } catch (error) {
    logError("viro mesh", error);
    return <ViroScene />;
  }
  const eye = orbitEye(camera.target, camera.yaw, camera.pitch, camera.distance);
  return (
    <ViroScene>
      <ViroAmbientLight color="#ffffff" intensity={700} />
      <ViroDirectionalLight color="#fff4e0" direction={[0.25, -1, -0.3]} intensity={900} />
      <ViroOrbitCamera
        active
        position={[eye.x, eye.y, eye.z]}
        focalPoint={[camera.target.x, camera.target.y, camera.target.z]}
        fieldOfView={48}
      />
      {placed.vertices.length > 0 ? (
        <ViroGeometry
          key={`rock-${camera.revision}`}
          vertices={placed.vertices}
          normals={placed.normals}
          triangleIndices={placed.triangles}
          materials={["mcViewSand"]}
        />
      ) : null}
      {camera.routes.map((route) => (
        <RouteLine key={route.id} points={route.points} />
      ))}
      <RouteLine points={camera.draft} />
    </ViroScene>
  );
}

function RouteLine({ points }: { points: RoutePoint[] }) {
  const ordered = [...points].sort((a, b) => a.order - b.order).slice(0, 40);
  if (ordered.length === 0) return null;
  const line = ordered.map((point) => [point.position.x, point.position.y, point.position.z] as [number, number, number]);
  return (
    <>
      {line.length >= 2 ? <ViroPolyline points={line} thickness={0.025} materials={["mcViewCopper"]} /> : null}
      {ordered.map((point) =>
        point.type === "path" ? null : (
          <ViroSphere
            key={point.id}
            position={[point.position.x, point.position.y, point.position.z]}
            radius={point.type === "start" ? 0.06 : 0.04}
            materials={[point.type === "start" ? "mcViewAmber" : "mcViewChalk"]}
          />
        ),
      )}
    </>
  );
}

export function ViroMeshView({ mesh, routes = [], draft = [], onPick, hint }: Props) {
  const [, bump] = useState(0);
  // The Viro scene function is captured once and reads this object while the view mounts.
  /* eslint-disable react-hooks/immutability, react-hooks/globals */
  bumpView = () => bump((value) => value + 1);
  camera.mesh = mesh;
  camera.routes = routes;
  camera.draft = draft;
  camera.onPick = onPick;
  camera.target = finiteTarget(mesh);
  if (camera.distance < 0.2) {
    const span = diagonal(mesh.bounds);
    camera.distance = Number.isFinite(span) ? Math.max(0.6, span * 1.55) : 2.5;
  }
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    noteScreen("plot: 3d view mounted");
    const timer = setTimeout(() => noteScreen("plot: 3d view alive"), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => {
        camera.width = event.nativeEvent.layout.width;
        camera.height = event.nativeEvent.layout.height;
      }}
    >
      <Viro3DSceneNavigator
        initialScene={{ scene: RockScene as never }}
        style={styles.fill}
        hdrEnabled={false}
        bloomEnabled={false}
        shadowsEnabled={false}
      />
      <View style={styles.touch} {...pan.panHandlers} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function finiteTarget(mesh: SurfaceMesh): Vector3 {
  const { min, max } = mesh.bounds ?? { min: undefined, max: undefined };
  const values = [min?.x, min?.y, min?.z, max?.x, max?.y, max?.z];
  if (!min || !max || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return { x: 0, y: 1, z: 0 };
  }
  return midpoint(min, max);
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 240, backgroundColor: colors.bg },
  fill: { flex: 1 },
  touch: { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },
  hint: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    color: colors.chalk,
    backgroundColor: "rgba(18,20,16,0.72)",
    borderRadius: 12,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "700",
  },
});
