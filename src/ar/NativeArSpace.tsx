import { useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ViroAmbientLight,
  ViroARScene,
  ViroARSceneNavigator,
  ViroDirectionalLight,
  ViroGeometry,
  ViroMaterials,
  ViroPolyline,
  ViroSphere,
  type ViroARHitTestResult,
} from "@reactvision/react-viro";
import { originForAnchor, scanPointToWorld } from "../domain/frame";
import type { Route, Vector3 } from "../domain/types";
import { logError } from "../log";
import { basePoint } from "../mesh/reconstruct";
import type { SurfaceMesh } from "../mesh/types";
import { colors } from "../theme/theme";
import { bestHit, hitPosition } from "./hits";
import { placeMesh, type ViroMeshData } from "./placeMesh";

ViroMaterials.createMaterials({
  mcSandstone: {
    lightingModel: "Lambert",
    diffuseColor: "#C4A574",
    cullMode: "None",
  },
  mcCopper: { lightingModel: "Constant", diffuseColor: "#E08A3C" },
  mcChalk: { lightingModel: "Constant", diffuseColor: "#F6F1E7" },
  mcAmber: { lightingModel: "Constant", diffuseColor: "#F0B429" },
  mcFinish: { lightingModel: "Constant", diffuseColor: "#E15B4A" },
});

type Live = {
  mesh: SurfaceMesh;
  routes: Route[];
  origin: Vector3;
  yaw: number;
  scale: number;
  locked: boolean;
  revision: number;
  hitCenter: null | (() => Promise<Vector3 | null>);
};

const live: Live = {
  mesh: emptyMesh(),
  routes: [],
  origin: { x: 0, y: 0, z: 0 },
  yaw: 0,
  scale: 1,
  locked: false,
  revision: 0,
  hitCenter: null,
};

function SpaceScene() {
  const sceneRef = useRef<ViroARScene>(null);
  useEffect(() => {
    live.hitCenter = async () => {
      const scene = sceneRef.current;
      if (!scene) return null;
      const { width, height } = Dimensions.get("window");
      try {
        const hits = (await scene.performARHitTestWithPoint(width / 2, height * 0.46)) as ViroARHitTestResult[];
        const hit = bestHit(hits);
        return hit ? hitPosition(hit) : null;
      } catch {
        return null;
      }
    };
    return () => {
      live.hitCenter = null;
    };
  }, []);

  let placed: ViroMeshData | null = null;
  if (live.locked && live.mesh.positions.length >= 9) {
    try {
      placed = placeMesh(live.mesh, live.origin, live.yaw, live.scale);
    } catch (error) {
      logError("place mesh", error, { vertices: Math.floor(live.mesh.positions.length / 3) });
    }
  }
  return (
    <ViroARScene ref={sceneRef} anchorDetectionTypes={["PlanesHorizontal", "PlanesVertical"]}>
      <ViroAmbientLight color="#ffffff" intensity={500} />
      <ViroDirectionalLight color="#fff4e0" direction={[0.2, -1, -0.35]} intensity={900} />
      {placed ? (
        <ViroGeometry
          key={`rock-${live.revision}`}
          vertices={placed.vertices}
          normals={placed.normals}
          triangleIndices={placed.triangles}
          materials={["mcSandstone"]}
        />
      ) : null}
      {live.locked
        ? live.routes.map((route) => <RouteNodes key={route.id} route={route} />)
        : null}
    </ViroARScene>
  );
}

function RouteNodes({ route }: { route: Route }) {
  const points = [...route.points].sort((a, b) => a.order - b.order);
  const line = points.map((point) => {
    const world = worldFrom(point.position);
    return [world.x, world.y, world.z] as [number, number, number];
  });
  return (
    <>
      {line.length >= 2 ? (
        <ViroPolyline points={line} thickness={0.02} materials={["mcCopper"]} />
      ) : null}
      {points.map((point) => {
        if (point.type === "path") return null;
        const world = worldFrom(point.position);
        const material = point.type === "start" ? "mcAmber" : point.type === "finish" ? "mcFinish" : "mcChalk";
        return (
          <ViroSphere
            key={point.id}
            position={[world.x, world.y, world.z]}
            radius={point.type === "start" ? 0.05 : 0.035}
            materials={[material]}
          />
        );
      })}
    </>
  );
}

function worldFrom(point: Vector3): Vector3 {
  return scanPointToWorld(point, live.origin, live.yaw, live.scale);
}

export function NativeArSpace({ mesh, routes }: { mesh: SurfaceMesh; routes: Route[] }) {
  const [locked, setLocked] = useState(false);
  const [yawDeg, setYawDeg] = useState(0);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("Stand at the base. Put the crosshair on the ground where the rock meets it, then lock.");
  const anchor = useRef(basePoint(mesh));

  // Viro keeps the first scene function and reads this object during render.
  // Writing it here is what makes the mesh match the controls on that same frame.
  /* eslint-disable react-hooks/immutability */
  live.mesh = mesh;
  live.routes = routes;
  live.yaw = (yawDeg * Math.PI) / 180;
  live.scale = scale;
  live.locked = locked;
  /* eslint-enable react-hooks/immutability */

  const lock = async () => {
    setBusy(true);
    const hit = await live.hitCenter?.();
    setBusy(false);
    if (!hit) {
      setNote("Nothing locked under the crosshair. Step closer and aim at the ground in front of the rock.");
      return;
    }
    live.origin = originForAnchor(hit, anchor.current, live.yaw, live.scale);
    live.revision += 1;
    setLocked(true);
    setNote("Walk around the model. Twist until it sits on the real rock. Routes are drawn in the scan's meters.");
  };

  const nudge = (delta: number) => {
    const next = yawDeg + delta;
    setYawDeg(next);
    live.yaw = (next * Math.PI) / 180;
    live.revision += 1;
  };

  return (
    <View style={styles.fill}>
      <ViroARSceneNavigator
        initialScene={{ scene: SpaceScene }}
        style={styles.fill}
        worldMeshEnabled
        depthEnabled
        occlusionMode="depthBased"
        provider="none"
        worldMeshConfig={{ accumulate: false, debugDrawEnabled: false, maxDepth: 8 }}
      />
      <View pointerEvents="none" style={styles.crosshairWrap}>
        <View style={styles.crosshair} />
      </View>
      <View style={styles.panel} pointerEvents="box-none">
        <Text style={styles.note}>{note}</Text>
        <View style={styles.row}>
          <Pressable style={styles.small} onPress={() => nudge(-15)}><Text style={styles.smallText}>Twist left</Text></Pressable>
          <Pressable style={styles.small} onPress={() => nudge(15)}><Text style={styles.smallText}>Twist right</Text></Pressable>
          <Pressable style={styles.small} onPress={() => setScale((value) => clampScale(value * 0.9))}><Text style={styles.smallText}>Smaller</Text></Pressable>
          <Pressable style={styles.small} onPress={() => setScale(1)}><Text style={styles.smallText}>True size</Text></Pressable>
        </View>
        <Pressable style={styles.lock} onPress={() => void lock()} disabled={busy}>
          <Text style={styles.lockText}>{busy ? "Looking…" : locked ? "Lock the base again" : "Lock the base here"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function clampScale(value: number): number {
  const next = Math.min(2.5, Math.max(0.4, value));
  live.scale = next;
  live.revision += 1;
  return next;
}

function emptyMesh(): SurfaceMesh {
  return {
    positions: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  crosshairWrap: { position: "absolute", top: "42%", left: 0, right: 0, alignItems: "center" },
  crosshair: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.amber,
    backgroundColor: "transparent",
  },
  panel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 18,
    gap: 10,
  },
  note: {
    color: colors.chalk,
    backgroundColor: "rgba(18,20,16,0.82)",
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  small: {
    backgroundColor: colors.slate,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallText: { color: colors.chalk, fontWeight: "800" },
  lock: {
    backgroundColor: colors.copper,
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  lockText: { color: colors.ink, fontSize: 18, fontWeight: "800" },
});
