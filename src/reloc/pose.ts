import type { Vector3 } from "../domain/types";
import { add, dot, length, normalize, scale, sub } from "../domain/vec";
import { multiply, transformPoint, type Mat4 } from "../viewer/math";

export type Intrinsics = { fx: number; fy: number; cx: number; cy: number };

export type Observation = { point: Vector3; u: number; v: number };

export type PoseSolve = {
  worldFromCamera: Mat4;
  cameraFromWorld: Mat4;
  inliers: number;
  reprojectionPx: number;
};

/** Camera pose in the scan frame, from 2D-3D pairs. OpenGL camera: Y up, looking down -Z. */
export function solvePnp(
  observations: Observation[],
  intrinsics: Intrinsics,
  options: { iterations?: number; thresholdPx?: number; seed?: number } = {},
): PoseSolve | null {
  if (observations.length < 6) return null;
  const iterations = options.iterations ?? 48;
  const threshold = options.thresholdPx ?? 8;
  let rng = options.seed ?? 1;
  const next = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  let best: { pose: Mat4; inliers: number[]; error: number } | null = null;
  const seeds = observations.length <= 16 ? [observations] : [];
  for (const sample of seeds) {
    const pose = poseFromPoints(sample, intrinsics);
    if (!pose) continue;
    const scored = score(observations, pose, intrinsics, threshold);
    best = { pose, inliers: scored.inliers, error: scored.error };
  }
  for (let attempt = 0; attempt < iterations; attempt++) {
    const sample = pick(observations, 6, next);
    const pose = poseFromPoints(sample, intrinsics);
    if (!pose) continue;
    const scored = score(observations, pose, intrinsics, threshold);
    if (!best || scored.inliers.length > best.inliers.length || (scored.inliers.length === best.inliers.length && scored.error < best.error)) {
      best = { pose, inliers: scored.inliers, error: scored.error };
    }
  }
  if (!best || best.inliers.length < 6) return null;
  const refined = poseFromPoints(best.inliers.map((index) => observations[index]), intrinsics) ?? best.pose;
  const finalScore = score(observations, refined, intrinsics, threshold);
  if (finalScore.inliers.length < 6) return null;
  return {
    worldFromCamera: refined,
    cameraFromWorld: invertRigid(refined),
    inliers: finalScore.inliers.length,
    reprojectionPx: finalScore.error,
  };
}

/** Where a scan-frame point sits in the current AR session. */
export function sessionFromScan(liveWorldFromCamera: Mat4, cameraFromScan: Mat4): Mat4 {
  return multiply(liveWorldFromCamera, cameraFromScan);
}

export function yawAboutY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** Twist the placed model around its own up axis. */
export function nudgeYaw(placed: Mat4, radians: number): Mat4 {
  return multiply(placed, yawAboutY(radians));
}

export function translate(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function poseFromPoints(observations: Observation[], intrinsics: Intrinsics): Mat4 | null {
  const mean = observations.reduce(
    (acc, observation) => add(acc, observation.point),
    { x: 0, y: 0, z: 0 },
  );
  mean.x /= observations.length;
  mean.y /= observations.length;
  mean.z /= observations.length;
  let best: Mat4 | null = null;
  let bestError = 1e9;
  for (let step = 0; step < 12; step++) {
    const yaw = (step / 12) * Math.PI * 2;
    const guess = initialPose(mean, observations, intrinsics, yaw);
    const polished = refineEuler([yaw, 0, 0, guess[12], guess[13], guess[14]], observations, intrinsics);
    const error = meanError(observations, polished, intrinsics);
    if (error < bestError) {
      best = polished;
      bestError = error;
    }
  }
  return bestError < 8 ? best : null;
}

function refineEuler(start: number[], observations: Observation[], intrinsics: Intrinsics): Mat4 {
  let params = start.slice();
  for (let iteration = 0; iteration < 12; iteration++) {
    const pose = eulerPose(params);
    const current = meanError(observations, pose, intrinsics);
    const residual = pixelResiduals(params, observations, intrinsics);
    const jacobian: number[][] = [];
    const eps = 1e-4;
    for (let column = 0; column < 6; column++) {
      const bumped = params.slice();
      bumped[column] += eps;
      const shifted = pixelResiduals(bumped, observations, intrinsics);
      jacobian.push(shifted.map((value, index) => (value - residual[index]) / eps));
    }
    const delta = normalStep(jacobian, residual);
    if (!delta) break;
    let accepted = false;
    for (const gain of [1, 0.5, 0.25]) {
      const trial = params.map((value, index) => value + delta[index] * gain);
      if (meanError(observations, eulerPose(trial), intrinsics) < current - 1e-4) {
        params = trial;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }
  return eulerPose(params);
}

function eulerPose(params: number[]): Mat4 {
  const yaw = yawAboutY(params[0]);
  const pitch = pitchAboutX(params[1]);
  const roll = rollAboutZ(params[2]);
  const rotation = multiply(yaw, multiply(pitch, roll));
  return [
    rotation[0], rotation[1], rotation[2], 0,
    rotation[4], rotation[5], rotation[6], 0,
    rotation[8], rotation[9], rotation[10], 0,
    params[3], params[4], params[5], 1,
  ];
}

function pitchAboutX(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function rollAboutZ(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function pixelResiduals(params: number[], observations: Observation[], intrinsics: Intrinsics): number[] {
  const pose = eulerPose(params);
  const out: number[] = [];
  for (const observation of observations) {
    const projected = projectGl(observation.point, pose, intrinsics);
    if (!projected) {
      out.push(80, 80);
      continue;
    }
    out.push(projected.u - observation.u, projected.v - observation.v);
  }
  return out;
}

function normalStep(jacobian: number[][], residual: number[]): number[] | null {
  const jtj = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  const jtr = new Array<number>(6).fill(0);
  for (let row = 0; row < residual.length; row++) {
    for (let column = 0; column < 6; column++) {
      jtr[column] += jacobian[column][row] * residual[row];
      for (let other = 0; other < 6; other++) jtj[column][other] += jacobian[column][row] * jacobian[other][row];
    }
  }
  for (let i = 0; i < 6; i++) jtj[i][i] += 1e-2;
  return solve6(jtj, jtr.map((value) => -value));
}

function initialPose(mean: Vector3, observations: Observation[], intrinsics: Intrinsics, yaw: number): Mat4 {
  const rotation = yawAboutY(yaw);
  const look = { x: -rotation[8], y: -rotation[9], z: -rotation[10] };
  let worldRadius = 0;
  let imageRadius = 0;
  for (const observation of observations) {
    const offset = sub(observation.point, mean);
    const along = dot(offset, look);
    worldRadius += Math.hypot(offset.x - look.x * along, offset.y - look.y * along, offset.z - look.z * along);
    imageRadius += Math.hypot((observation.u - intrinsics.cx) / intrinsics.fx, (observation.v - intrinsics.cy) / intrinsics.fy);
  }
  worldRadius /= observations.length;
  imageRadius /= observations.length || 1;
  const depth = imageRadius > 0.02 ? worldRadius / imageRadius : 2;
  const position = sub(mean, scale(look, Math.min(30, Math.max(0.4, depth))));
  return [
    rotation[0], rotation[1], rotation[2], 0,
    rotation[4], rotation[5], rotation[6], 0,
    rotation[8], rotation[9], rotation[10], 0,
    position.x, position.y, position.z, 1,
  ];
}

export function projectPoint(point: Vector3, worldFromCamera: Mat4, intrinsics: Intrinsics): { u: number; v: number } | null {
  return projectGl(point, worldFromCamera, intrinsics);
}

function projectGl(point: Vector3, worldFromCamera: Mat4, intrinsics: Intrinsics): { u: number; v: number } | null {
  const camera = transformPoint(invertRigid(worldFromCamera), point);
  const depth = -camera.z;
  if (depth < 0.05) return null;
  return {
    u: intrinsics.fx * (camera.x / depth) + intrinsics.cx,
    v: intrinsics.cy - intrinsics.fy * (camera.y / depth),
  };
}

function meanError(observations: Observation[], pose: Mat4, intrinsics: Intrinsics): number {
  let total = 0;
  let count = 0;
  for (const observation of observations) {
    const projected = projectGl(observation.point, pose, intrinsics);
    if (!projected) continue;
    total += Math.hypot(projected.u - observation.u, projected.v - observation.v);
    count++;
  }
  return count ? total / count : 1e6;
}

function score(observations: Observation[], pose: Mat4, intrinsics: Intrinsics, threshold: number) {
  const inliers: number[] = [];
  let error = 0;
  observations.forEach((observation, index) => {
    const projected = projectGl(observation.point, pose, intrinsics);
    if (!projected) return;
    const pixels = Math.hypot(projected.u - observation.u, projected.v - observation.v);
    if (pixels <= threshold) {
      inliers.push(index);
      error += pixels;
    }
  });
  return { inliers, error: inliers.length ? error / inliers.length : 1e6 };
}

function invertRigid(m: Mat4): Mat4 {
  const r = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ];
  const t = [m[12], m[13], m[14]];
  const rt = transpose3(r);
  const tw = mul3(rt, t.map((value) => -value));
  return [
    rt[0][0], rt[1][0], rt[2][0], 0,
    rt[0][1], rt[1][1], rt[2][1], 0,
    rt[0][2], rt[1][2], rt[2][2], 0,
    tw[0], tw[1], tw[2], 1,
  ];
}

function solve6(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let col = 0; col < 6; col++) {
    let pivot = col;
    for (let row = col + 1; row < 6; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let k = col; k < 7; k++) a[col][k] /= div;
    for (let row = 0; row < 6; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k < 7; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row) => row[6]);
}

function pick<T>(items: T[], count: number, next: () => number): T[] {
  const copy = items.slice();
  for (let i = 0; i < count; i++) {
    const index = i + Math.floor(next() * (copy.length - i));
    [copy[i], copy[index]] = [copy[index], copy[i]];
  }
  return copy.slice(0, count);
}

function transpose3(m: number[][]): number[][] {
  return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
}

function mul3(m: number[][], v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function cameraBasisError(solved: Mat4, expected: Mat4): { position: number; direction: number } {
  const position = length(sub(translationOf(solved), translationOf(expected)));
  const solvedDir = transformDirection(solved, { x: 0, y: 0, z: -1 });
  const expectedDir = transformDirection(expected, { x: 0, y: 0, z: -1 });
  return { position, direction: length(sub(solvedDir, expectedDir)) };
}

function translationOf(m: Mat4): Vector3 {
  return { x: m[12], y: m[13], z: m[14] };
}

function transformDirection(m: Mat4, d: Vector3): Vector3 {
  return normalize({
    x: m[0] * d.x + m[4] * d.y + m[8] * d.z,
    y: m[1] * d.x + m[5] * d.y + m[9] * d.z,
    z: m[2] * d.x + m[6] * d.y + m[10] * d.z,
  });
}

export function placedPoint(sessionFromModel: Mat4, point: Vector3): Vector3 {
  return transformPoint(sessionFromModel, point);
}
