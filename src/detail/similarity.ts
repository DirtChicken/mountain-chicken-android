import type { Vector3 } from "../domain/types";

export type Similarity = {
  scale: number;
  rotation: number[][];
  translation: Vector3;
};

export type AlignmentPair = {
  name: string;
  source: [number, number, number];
  target: [number, number, number];
};

/** Umeyama similarity: scale, rotation, and translation that carry NodeODM camera centers onto the ARCore scan. */
export function solveSimilarity(source: Vector3[], target: Vector3[]): Similarity | null {
  if (source.length < 3 || source.length !== target.length) return null;
  if (colinear(source) || colinear(target)) return null;
  const count = source.length;
  const sourceMean = mean(source);
  const targetMean = mean(target);
  const covariance = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const s = sub(source[i], sourceMean);
    const t = sub(target[i], targetMean);
    variance += s.x * s.x + s.y * s.y + s.z * s.z;
    const column = [s.x, s.y, s.z];
    const row = [t.x, t.y, t.z];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) covariance[r][c] += row[r] * column[c];
    }
  }
  if (variance < 1e-10) return null;
  const { u, s, v } = svd3(covariance);
  const product = mul(u, transpose(v));
  const det = determinant(product);
  const diagonal = [1, 1, det < 0 ? -1 : 1];
  const rotation = mul(mul(u, diag(diagonal)), transpose(v));
  const scale = (s[0] + s[1] + diagonal[2] * s[2]) / variance;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const rotated = applyRotation(rotation, sourceMean);
  return {
    scale,
    rotation,
    translation: {
      x: targetMean.x - scale * rotated.x,
      y: targetMean.y - scale * rotated.y,
      z: targetMean.z - scale * rotated.z,
    },
  };
}

export function applySimilarity(similarity: Similarity, point: Vector3): Vector3 {
  const rotated = applyRotation(similarity.rotation, point);
  return {
    x: similarity.scale * rotated.x + similarity.translation.x,
    y: similarity.scale * rotated.y + similarity.translation.y,
    z: similarity.scale * rotated.z + similarity.translation.z,
  };
}

export function similarityFromPairs(pairs: AlignmentPair[]): Similarity | null {
  return solveSimilarity(
    pairs.map((pair) => ({ x: pair.source[0], y: pair.source[1], z: pair.source[2] })),
    pairs.map((pair) => ({ x: pair.target[0], y: pair.target[1], z: pair.target[2] })),
  );
}

/** Move every POSITION accessor in a GLB into the scan frame. Indices stay 16-bit. */
export function transformGlb(glb: Uint8Array, similarity: Similarity): Uint8Array {
  const copy = new Uint8Array(glb);
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(copy.slice(20, 20 + jsonLength))) as {
    meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
    accessors?: { bufferView?: number; componentType?: number; count?: number; type?: string; min?: number[]; max?: number[] }[];
    bufferViews?: { byteOffset?: number; byteLength?: number }[];
  };
  const binStart = 20 + jsonLength + 8;
  const positions = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (typeof primitive.attributes?.POSITION === "number") positions.add(primitive.attributes.POSITION);
    }
  }
  for (const index of positions) {
    const accessor = json.accessors?.[index];
    const bufferView = accessor ? json.bufferViews?.[accessor.bufferView ?? -1] : null;
    if (!accessor || !bufferView || accessor.componentType !== 5126 || accessor.type !== "VEC3") continue;
    const start = binStart + (bufferView.byteOffset ?? 0);
    const count = accessor.count ?? 0;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const offset = start + i * 12;
      const moved = applySimilarity(similarity, {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
      });
      view.setFloat32(offset, moved.x, true);
      view.setFloat32(offset + 4, moved.y, true);
      view.setFloat32(offset + 8, moved.z, true);
      min = [Math.min(min[0], moved.x), Math.min(min[1], moved.y), Math.min(min[2], moved.z)];
      max = [Math.max(max[0], moved.x), Math.max(max[1], moved.y), Math.max(max[2], moved.z)];
    }
    accessor.min = min;
    accessor.max = max;
  }
  const nextJson = JSON.stringify(json);
  const encoded = new TextEncoder().encode(nextJson);
  if (encoded.length > jsonLength) return copy;
  copy.set(encoded, 20);
  for (let i = encoded.length; i < jsonLength; i++) copy[20 + i] = 0x20;
  return copy;
}

function mean(points: Vector3[]): Vector3 {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
  return { x: total.x / points.length, y: total.y / points.length, z: total.z / points.length };
}

function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function colinear(points: Vector3[]): boolean {
  const origin = points[0];
  const span = points.slice(1).map((point) => sub(point, origin));
  for (let i = 0; i < span.length; i++) {
    for (let j = i + 1; j < span.length; j++) {
      const cross = {
        x: span[i].y * span[j].z - span[i].z * span[j].y,
        y: span[i].z * span[j].x - span[i].x * span[j].z,
        z: span[i].x * span[j].y - span[i].y * span[j].x,
      };
      if (cross.x * cross.x + cross.y * cross.y + cross.z * cross.z > 1e-8) return false;
    }
  }
  return true;
}

function applyRotation(rotation: number[][], point: Vector3): Vector3 {
  return {
    x: rotation[0][0] * point.x + rotation[0][1] * point.y + rotation[0][2] * point.z,
    y: rotation[1][0] * point.x + rotation[1][1] * point.y + rotation[1][2] * point.z,
    z: rotation[2][0] * point.x + rotation[2][1] * point.y + rotation[2][2] * point.z,
  };
}

function transpose(matrix: number[][]): number[][] {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function mul(a: number[][], b: number[][]): number[][] {
  return a.map((row) => b[0].map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0)));
}

function diag(values: number[]): number[][] {
  return values.map((value, row) => values.map((_, column) => (row === column ? value : 0)));
}

function determinant(matrix: number[][]): number {
  const [a, b, c] = matrix;
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function svd3(matrix: number[][]): { u: number[][]; s: number[]; v: number[][] } {
  const ata = mul(transpose(matrix), matrix);
  const eigen = jacobi(ata);
  const values = eigen.values.map((value) => Math.max(0, value));
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  const v = order.map((index) => eigen.vectors.map((row) => row[index]));
  const vColumns = transpose(v);
  const s = order.map((index) => Math.sqrt(values[index]));
  const av = mul(matrix, vColumns);
  const u = [0, 1, 2].map((column) => {
    if (s[column] < 1e-10) return [column === 0 ? 1 : 0, column === 1 ? 1 : 0, column === 2 ? 1 : 0];
    return av.map((row) => row[column] / s[column]);
  });
  return { u: transpose(u), s, v: vColumns };
}

function jacobi(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const a = matrix.map((row) => row.slice());
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iteration = 0; iteration < 24; iteration++) {
    let p = 0;
    let q = 1;
    let largest = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > largest) {
      p = 0;
      q = 2;
      largest = Math.abs(a[0][2]);
    }
    if (Math.abs(a[1][2]) > largest) {
      p = 1;
      q = 2;
      largest = Math.abs(a[1][2]);
    }
    if (largest < 1e-12) break;
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const tau = (aqq - app) / (2 * apq);
    const tangent = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;
    a[p][p] = app - tangent * apq;
    a[q][q] = aqq + tangent * apq;
    a[p][q] = 0;
    a[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k === p || k === q) continue;
      const aik = a[k][p];
      const akq = a[k][q];
      a[k][p] = a[p][k] = cosine * aik - sine * akq;
      a[k][q] = a[q][k] = sine * aik + cosine * akq;
    }
    for (let k = 0; k < 3; k++) {
      const vip = vectors[k][p];
      const viq = vectors[k][q];
      vectors[k][p] = cosine * vip - sine * viq;
      vectors[k][q] = sine * vip + cosine * viq;
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors };
}
