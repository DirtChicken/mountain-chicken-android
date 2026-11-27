import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useEffect, useMemo, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import type { Route, RoutePoint, Vector3 } from "../domain/types";
import { diagonal, midpoint } from "../domain/vec";
import { logError } from "../log";
import { highestIndex, prepareMeshForDisplay, vertexCount } from "../mesh/prepareMesh";
import type { SurfaceMesh } from "../mesh/types";
import { colors } from "../theme/theme";
import { ViewerFallback } from "./ViewerBoundary";
import { lookAt, multiply, orbitEye, perspective, rayFromScreen } from "../viewer/math";
import { rockColors, routeOverlay, type ColoredMesh } from "../viewer/overlay";
import { raycastMesh } from "../viewer/raycast";

type Props = {
  mesh: SurfaceMesh;
  routes?: Route[];
  draft?: RoutePoint[];
  onPick?: (point: Vector3) => void;
  hint?: string;
};

type GpuMesh = {
  position: WebGLBuffer;
  normal: WebGLBuffer;
  color: WebGLBuffer;
  index: WebGLBuffer;
  count: number;
  indexType: number;
};

const VERT = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uMvp;
uniform mat4 uModelView;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  gl_Position = uMvp * vec4(aPosition, 1.0);
  vNormal = mat3(uModelView) * aNormal;
  vColor = aColor;
}
`;

const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(0.32, 0.86, 0.45));
  float shade = 0.32 + 0.68 * abs(dot(n, light));
  gl_FragColor = vec4(vColor * shade, 1.0);
}
`;

const EMPTY_ROUTES: Route[] = [];
const EMPTY_DRAFT: RoutePoint[] = [];

const session = {
  yaw: 0.75,
  pitch: 0.42,
  distance: 2.4,
  target: { x: 0, y: 0, z: 0 } as Vector3,
  width: 1,
  height: 1,
  mesh: null as SurfaceMesh | null,
  routes: EMPTY_ROUTES,
  draft: EMPTY_DRAFT,
  dirty: true,
  onPick: undefined as ((point: Vector3) => void) | undefined,
  moved: false,
  lastX: 0,
  lastY: 0,
  span: 0,
  stop: null as (() => void) | null,
  onGlError: undefined as ((message: string) => void) | undefined,
};

const pan = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onMoveShouldSetPanResponder: () => true,
  onPanResponderGrant: (event) => {
    session.moved = false;
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) session.span = touchSpan(touches);
    session.lastX = event.nativeEvent.locationX;
    session.lastY = event.nativeEvent.locationY;
  },
  onPanResponderMove: (event) => {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) {
      const span = touchSpan(touches);
      if (session.span > 0) session.distance = clamp(session.distance * (session.span / span), 0.25, 40);
      session.span = span;
      session.moved = true;
      return;
    }
    const dx = event.nativeEvent.locationX - session.lastX;
    const dy = event.nativeEvent.locationY - session.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) session.moved = true;
    session.yaw -= dx * 0.01;
    session.pitch = clamp(session.pitch + dy * 0.008, -1.15, 1.15);
    session.lastX = event.nativeEvent.locationX;
    session.lastY = event.nativeEvent.locationY;
  },
  onPanResponderRelease: (event) => {
    if (session.moved || !session.onPick || !session.mesh) return;
    const ray = rayFromScreen({
      touchX: event.nativeEvent.locationX,
      touchY: event.nativeEvent.locationY,
      width: session.width,
      height: session.height,
      target: session.target,
      yaw: session.yaw,
      pitch: session.pitch,
      distance: session.distance,
    });
    const hit = raycastMesh(session.mesh, ray);
    if (hit) session.onPick(hit.point);
  },
});

export function GlMeshCanvas({ mesh, routes = EMPTY_ROUTES, draft = EMPTY_DRAFT, onPick, hint }: Props) {
  const [problem, setProblem] = useState<string | null>(null);
  const safe = useMemo(() => safeMesh(mesh), [mesh]);

  useEffect(() => {
    session.onGlError = (message) => setProblem(message);
    return () => {
      session.onGlError = undefined;
    };
  }, []);

  useEffect(() => {
    if (!safe) return;
    session.mesh = safe;
    session.target = finiteTarget(safe);
    const span = diagonal(safe.bounds);
    session.distance = Number.isFinite(span) ? Math.max(0.6, span * 1.55) : 2.4;
    session.yaw = 0.75;
    session.pitch = 0.42;
    session.dirty = true;
  }, [safe]);

  useEffect(() => {
    session.routes = routes;
    session.draft = draft;
    session.dirty = true;
  }, [routes, draft]);

  useEffect(() => {
    session.onPick = onPick;
  }, [onPick]);

  useEffect(() => () => session.stop?.(), []);

  if (!safe) {
    return <ViewerFallback message="This scan has no surface to draw. It is still saved." />;
  }
  if (problem) return <ViewerFallback message={problem} />;

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => {
        session.width = event.nativeEvent.layout.width;
        session.height = event.nativeEvent.layout.height;
      }}
      {...pan.panHandlers}
    >
      <GLView style={styles.gl} pointerEvents="none" onContextCreate={start} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function start(gl: ExpoWebGLRenderingContext) {
  const program = link(gl, VERT, FRAG);
  if (!program) {
    session.onGlError?.("The 3D view could not start. The scan is still saved.");
    return;
  }
  gl.useProgram(program);
  const loc = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    color: gl.getAttribLocation(program, "aColor"),
    mvp: gl.getUniformLocation(program, "uMvp"),
    modelView: gl.getUniformLocation(program, "uModelView"),
  };
  let rock: GpuMesh | null = null;
  let overlay: GpuMesh | null = null;
  let alive = true;
  let raf = 0;

  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    try {
      if (session.dirty && session.mesh) {
        dispose(gl, rock);
        dispose(gl, overlay);
        const current = session.mesh;
        rock = upload(gl, {
          positions: current.positions,
          normals: current.normals,
          colors: rockColors(current.positions.length / 3),
          indices: current.indices,
        });
        overlay = upload(gl, routeOverlay(session.routes, session.draft));
        session.dirty = false;
      }
      const frame = sizeOf(gl);
      if (frame.width >= 2 && frame.height >= 2) {
        gl.viewport(0, 0, frame.width, frame.height);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.clearColor(0.07, 0.078, 0.07, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const eye = orbitEye(session.target, session.yaw, session.pitch, session.distance);
        const modelView = lookAt(eye, session.target, { x: 0, y: 1, z: 0 });
        const proj = perspective((48 * Math.PI) / 180, frame.aspect, 0.04, 200);
        gl.uniformMatrix4fv(loc.mvp, false, Float32Array.from(multiply(proj, modelView)));
        gl.uniformMatrix4fv(loc.modelView, false, Float32Array.from(modelView));
        draw(gl, loc, rock);
        draw(gl, loc, overlay);
      }
      gl.endFrameEXP();
    } catch (error) {
      alive = false;
      logError("gl frame", error, {
        vertices: session.mesh ? vertexCount(session.mesh) : 0,
        highestIndex: session.mesh ? highestIndex(session.mesh) : 0,
      });
      session.onGlError?.("The 3D view stopped. The scan is still saved.");
    }
  };
  loop();
  session.stop = () => {
    alive = false;
    cancelAnimationFrame(raf);
    dispose(gl, rock);
    dispose(gl, overlay);
  };
}

function sizeOf(gl: ExpoWebGLRenderingContext): { width: number; height: number; aspect: number } {
  const width = gl.drawingBufferWidth || 1;
  const height = gl.drawingBufferHeight || 1;
  return { width, height, aspect: width / Math.max(1, height) };
}

function safeMesh(mesh: SurfaceMesh): SurfaceMesh | null {
  try {
    if (!mesh?.positions || mesh.positions.length < 9 || !mesh.indices || mesh.indices.length < 3) return null;
    return prepareMeshForDisplay(mesh);
  } catch (error) {
    logError("prepare mesh", error, { vertices: mesh?.positions ? vertexCount(mesh) : 0 });
    return null;
  }
}

function finiteTarget(mesh: SurfaceMesh): Vector3 {
  const { min, max } = mesh.bounds;
  const values = [min?.x, min?.y, min?.z, max?.x, max?.y, max?.z];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return { x: 0, y: 1, z: 0 };
  return midpoint(min, max);
}

function link(gl: ExpoWebGLRenderingContext, vert: string, frag: string): WebGLProgram | null {
  const program = gl.createProgram();
  const vs = shader(gl, gl.VERTEX_SHADER, vert);
  const fs = shader(gl, gl.FRAGMENT_SHADER, frag);
  if (!program || !vs || !fs) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    logError("gl program", new Error(String(gl.getProgramInfoLog(program))));
    return null;
  }
  return program;
}

function shader(gl: ExpoWebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const handle = gl.createShader(type);
  if (!handle) return null;
  gl.shaderSource(handle, source);
  gl.compileShader(handle);
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) {
    logError("gl shader", new Error(String(gl.getShaderInfoLog(handle))));
    return null;
  }
  return handle;
}

function upload(gl: ExpoWebGLRenderingContext, mesh: ColoredMesh): GpuMesh | null {
  if (mesh.indices.length < 3) return null;
  for (let i = 0; i < mesh.indices.length; i++) {
    if (mesh.indices[i] > 65535) {
      throw new Error("Mesh index does not fit in 16-bit GL.");
    }
  }
  const indices = Uint16Array.from(mesh.indices);
  const position = buffer(gl, gl.ARRAY_BUFFER, mesh.positions);
  const normal = buffer(gl, gl.ARRAY_BUFFER, mesh.normals);
  const color = buffer(gl, gl.ARRAY_BUFFER, mesh.colors);
  const index = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices);
  if (!position || !normal || !color || !index) return null;
  return {
    position,
    normal,
    color,
    index,
    count: mesh.indices.length,
    indexType: gl.UNSIGNED_SHORT,
  };
}

function buffer(gl: ExpoWebGLRenderingContext, target: number, data: ArrayBufferView): WebGLBuffer | null {
  const handle = gl.createBuffer();
  if (!handle) return null;
  gl.bindBuffer(target, handle);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return handle;
}

function draw(
  gl: ExpoWebGLRenderingContext,
  loc: { position: number; normal: number; color: number },
  mesh: GpuMesh | null,
) {
  if (!mesh) return;
  bind(gl, loc.position, mesh.position);
  bind(gl, loc.normal, mesh.normal);
  bind(gl, loc.color, mesh.color);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
  gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
}

function bind(gl: ExpoWebGLRenderingContext, location: number, buf: WebGLBuffer) {
  if (location < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
}

function dispose(gl: ExpoWebGLRenderingContext, mesh: GpuMesh | null) {
  if (!mesh) return;
  gl.deleteBuffer(mesh.position);
  gl.deleteBuffer(mesh.normal);
  gl.deleteBuffer(mesh.color);
  gl.deleteBuffer(mesh.index);
}

function touchSpan(touches: readonly { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, minHeight: 240 },
  gl: { flex: 1 },
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
