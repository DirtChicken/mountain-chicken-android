import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import type { Vector3 } from "../domain/types";
import { add, dot, normalize, sub } from "../domain/vec";
import { invert, type Mat4 } from "../viewer/math";
import type { SurfaceMesh } from "./types";

export type ScanPhoto = {
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  /** Column-major camera-to-world matrix, when the scanner provides it. */
  worldFromCamera?: number[];
  position?: Vector3;
  forward?: Vector3;
  up?: Vector3;
  jpegBase64: string;
};

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

const SAND = [196, 165, 116];

export type PhotoFit = { flipX: boolean; flipY: boolean; useOrigin: boolean };

export function projectToPhoto(
  worldPoint: Vector3,
  photo: ScanPhoto,
  fit: PhotoFit = { flipX: false, flipY: false, useOrigin: true },
): { x: number; y: number; score: number } | null {
  const cameraPoint = toCamera(worldPoint, photo);
  if (!cameraPoint) return null;
  const depth = -cameraPoint.z;
  if (depth < 0.08) return null;
  const x = fit.flipX
    ? photo.cx - photo.fx * (cameraPoint.x / depth)
    : photo.fx * (cameraPoint.x / depth) + photo.cx;
  const y = fit.flipY
    ? photo.cy + photo.fy * (cameraPoint.y / depth)
    : photo.cy - photo.fy * (cameraPoint.y / depth);
  if (x < 1 || y < 1 || x >= photo.width - 1 || y >= photo.height - 1) return null;
  return { x, y, score: depth };
}

/** Pick the camera-to-photo mapping that actually lands the rock inside the picture. */
export function choosePhotoFit(mesh: SurfaceMesh, photo: ScanPhoto, origin: Vector3): PhotoFit {
  const options: PhotoFit[] = [];
  for (const useOrigin of [true, false]) {
    for (const flipY of [false, true]) {
      for (const flipX of [false, true]) options.push({ flipX, flipY, useOrigin });
    }
  }
  let best = options[0];
  let bestHits = -1;
  const count = Math.floor(mesh.positions.length / 3);
  const step = Math.max(1, Math.floor(count / 24));
  for (const fit of options) {
    let hits = 0;
    for (let vertex = 0; vertex < count; vertex += step) {
      const local = at(mesh.positions, vertex);
      const world = fit.useOrigin ? add(local, origin) : local;
      if (projectToPhoto(world, photo, fit)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = fit;
    }
  }
  return best;
}

export function samplePhoto(image: RgbaImage, x: number, y: number): [number, number, number] {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(y)));
  const index = (y0 * image.width + x0) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
}

export function decodeScanPhoto(photo: ScanPhoto): RgbaImage {
  const bytes = base64ToBytes(photo.jpegBase64);
  const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

export function colorVertices(
  mesh: SurfaceMesh,
  photos: ScanPhoto[],
  images: RgbaImage[],
  origin: Vector3,
): Uint8Array {
  const count = Math.floor(mesh.positions.length / 3);
  const colors = new Uint8Array(count * 3);
  for (let vertex = 0; vertex < count; vertex++) {
    const local = at(mesh.positions, vertex);
    const normal = at(mesh.normals, vertex);
    const color = colorAt(local, normal, photos, images, origin, [], fitsFor(photos, mesh, origin));
    colors[vertex * 3] = color[0];
    colors[vertex * 3 + 1] = color[1];
    colors[vertex * 3 + 2] = color[2];
  }
  return colors;
}

/** Lay the face onto a square photo by projecting every texel into the scan pictures. */
export function bakeFaceTexture(
  mesh: SurfaceMesh,
  photos: ScanPhoto[],
  images: RgbaImage[],
  origin: Vector3,
  size = 512,
): { jpeg: Uint8Array; uvs: Float32Array; coloredTexels: number } | null {
  if (photos.length === 0 || images.length === 0) return null;
  const gains = exposureGains(images);
  const uvs = planarUvs(mesh.positions);
  const rgba = new Uint8Array(size * size * 4);
  let colored = 0;
  const triangles = Math.floor(mesh.indices.length / 3);
  for (let triangle = 0; triangle < triangles; triangle++) {
    const i0 = mesh.indices[triangle * 3];
    const i1 = mesh.indices[triangle * 3 + 1];
    const i2 = mesh.indices[triangle * 3 + 2];
    const p0 = at(mesh.positions, i0);
    const p1 = at(mesh.positions, i1);
    const p2 = at(mesh.positions, i2);
    const n0 = at(mesh.normals, i0);
    const n1 = at(mesh.normals, i1);
    const n2 = at(mesh.normals, i2);
    const uv0 = uvAt(uvs, i0);
    const uv1 = uvAt(uvs, i1);
    const uv2 = uvAt(uvs, i2);
    const minX = Math.max(0, Math.floor(Math.min(uv0[0], uv1[0], uv2[0]) * (size - 1)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(uv0[0], uv1[0], uv2[0]) * (size - 1)));
    const minY = Math.max(0, Math.floor(Math.min(uv0[1], uv1[1], uv2[1]) * (size - 1)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(uv0[1], uv1[1], uv2[1]) * (size - 1)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const u = x / (size - 1);
        const v = y / (size - 1);
        const bary = barycentric(u, v, uv0, uv1, uv2);
        if (!bary) continue;
        const [w0, w1, w2] = bary;
        const point = {
          x: p0.x * w0 + p1.x * w1 + p2.x * w2,
          y: p0.y * w0 + p1.y * w1 + p2.y * w2,
          z: p0.z * w0 + p1.z * w1 + p2.z * w2,
        };
        const normal = normalize({
          x: n0.x * w0 + n1.x * w1 + n2.x * w2,
          y: n0.y * w0 + n1.y * w1 + n2.y * w2,
          z: n0.z * w0 + n1.z * w1 + n2.z * w2,
        });
        const color = colorAt(point, normal, photos, images, origin, gains, fitsFor(photos, mesh, origin));
        const pixel = (y * size + x) * 4;
        rgba[pixel] = color[0];
        rgba[pixel + 1] = color[1];
        rgba[pixel + 2] = color[2];
        rgba[pixel + 3] = 255;
        colored++;
      }
    }
  }
  if (colored < 32) return null;
  fillGaps(rgba, size);
  const encoded = encodeJpeg({ data: rgba, width: size, height: size }, 82);
  return { jpeg: encoded.data, uvs, coloredTexels: colored };
}

export function texturedObj(mesh: SurfaceMesh, uvs: Float32Array): { obj: string; mtl: string } {
  const lines = ["mtllib mesh.mtl", "usemtl rockphoto"];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lines.push(`v ${n(mesh.positions[i])} ${n(mesh.positions[i + 1])} ${n(mesh.positions[i + 2])}`);
  }
  for (let i = 0; i < uvs.length; i += 2) {
    lines.push(`vt ${n(uvs[i])} ${n(1 - uvs[i + 1])}`);
  }
  for (let i = 0; i < mesh.normals.length; i += 3) {
    lines.push(`vn ${n(mesh.normals[i])} ${n(mesh.normals[i + 1])} ${n(mesh.normals[i + 2])}`);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] + 1;
    const b = mesh.indices[i + 1] + 1;
    const c = mesh.indices[i + 2] + 1;
    lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
  }
  const mtl = ["newmtl rockphoto", "Kd 1.000 1.000 1.000", "Ka 1.000 1.000 1.000", "illum 2", "map_Kd mesh.jpg", ""].join("\n");
  return { obj: lines.join("\n") + "\n", mtl };
}

const fitCache = new WeakMap<ScanPhoto, PhotoFit>();

function fitsFor(photos: ScanPhoto[], mesh: SurfaceMesh, origin: Vector3): PhotoFit[] {
  return photos.map((photo) => {
    const cached = fitCache.get(photo);
    if (cached) return cached;
    const fit = choosePhotoFit(mesh, photo, origin);
    fitCache.set(photo, fit);
    return fit;
  });
}

function colorAt(
  local: Vector3,
  normal: Vector3,
  photos: ScanPhoto[],
  images: RgbaImage[],
  origin: Vector3,
  gains: number[] = [],
  fits: PhotoFit[] = [],
): [number, number, number] {
  const hits: { weight: number; rgb: [number, number, number] }[] = [];
  const unit = normalize(normal);
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const image = images[i];
    if (!image) continue;
    const fit = fits[i] ?? { flipX: false, flipY: false, useOrigin: true };
    const world = fit.useOrigin ? add(local, origin) : local;
    const projected = projectToPhoto(world, photo, fit);
    if (!projected) continue;
    const eye = cameraPosition(photo);
    if (!eye) continue;
    const facing = dot(unit, normalize(sub(eye, world)));
    if (facing < 0.18) continue;
    const gain = gains[i] ?? 1;
    hits.push({ weight: facing * facing, rgb: samplePhoto(image, projected.x, projected.y).map((channel) => channel * gain) as [number, number, number] });
  }
  hits.sort((a, b) => b.weight - a.weight);
  const used = hits.slice(0, 2);
  let weight = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const hit of used) {
    weight += hit.weight;
    r += hit.rgb[0] * hit.weight;
    g += hit.rgb[1] * hit.weight;
    b += hit.rgb[2] * hit.weight;
  }
  if (weight <= 0) return [SAND[0], SAND[1], SAND[2]];
  return [clampByte(r / weight), clampByte(g / weight), clampByte(b / weight)];
}

function exposureGains(images: RgbaImage[]): number[] {
  const levels = images.map((image) => medianLuma(image));
  const finite = levels.filter((value) => value > 12);
  const target = finite.length ? finite.slice().sort((a, b) => a - b)[Math.floor(finite.length / 2)] : 128;
  return levels.map((value) => Math.min(1.65, Math.max(0.6, target / Math.max(12, value))));
}

function medianLuma(image: RgbaImage): number {
  const samples: number[] = [];
  for (let i = 0; i < image.data.length; i += 64 * 4) {
    samples.push(0.3 * image.data[i] + 0.59 * image.data[i + 1] + 0.11 * image.data[i + 2]);
  }
  if (!samples.length) return 128;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toCamera(world: Vector3, photo: ScanPhoto): Vector3 | null {
  if (photo.worldFromCamera && photo.worldFromCamera.length === 16) {
    const inverse = invert(photo.worldFromCamera as Mat4);
    const x = inverse[0] * world.x + inverse[4] * world.y + inverse[8] * world.z + inverse[12];
    const y = inverse[1] * world.x + inverse[5] * world.y + inverse[9] * world.z + inverse[13];
    const z = inverse[2] * world.x + inverse[6] * world.y + inverse[10] * world.z + inverse[14];
    return { x, y, z };
  }
  if (!photo.position || !photo.forward || !photo.up) return null;
  const forward = normalize(photo.forward);
  const up = normalize(photo.up);
  const right = normalize({
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  });
  const offset = sub(world, photo.position);
  return {
    x: dot(offset, right),
    y: dot(offset, up),
    z: -dot(offset, forward),
  };
}

export function cameraMatrix(photo: ScanPhoto): Mat4 | null {
  if (photo.worldFromCamera && photo.worldFromCamera.length === 16) return photo.worldFromCamera as Mat4;
  if (!photo.position || !photo.forward || !photo.up) return null;
  const forward = normalize(photo.forward);
  const up = normalize(photo.up);
  const right = normalize({
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  });
  return [
    right.x, right.y, right.z, 0,
    up.x, up.y, up.z, 0,
    -forward.x, -forward.y, -forward.z, 0,
    photo.position.x, photo.position.y, photo.position.z, 1,
  ];
}

function cameraPosition(photo: ScanPhoto): Vector3 | null {
  if (photo.worldFromCamera && photo.worldFromCamera.length === 16) {
    return { x: photo.worldFromCamera[12], y: photo.worldFromCamera[13], z: photo.worldFromCamera[14] };
  }
  return photo.position ?? null;
}

export function planarUvs(positions: Float32Array): Float32Array {
  const count = Math.floor(positions.length / 3);
  const mean = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < count; i++) {
    mean.x += positions[i * 3];
    mean.y += positions[i * 3 + 1];
    mean.z += positions[i * 3 + 2];
  }
  mean.x /= count || 1;
  mean.y /= count || 1;
  mean.z /= count || 1;
  const axisA = dominantAxis(positions, mean, { x: 1, y: 0, z: 0 });
  const axisB = dominantAxis(positions, mean, { x: 0, y: 1, z: 0 }, axisA);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const raw = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const point = sub(at(positions, i), mean);
    const u = dot(point, axisA);
    const v = dot(point, axisB);
    raw[i * 2] = u;
    raw[i * 2 + 1] = v;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const spanU = Math.max(1e-4, maxU - minU);
  const spanV = Math.max(1e-4, maxV - minV);
  for (let i = 0; i < count; i++) {
    raw[i * 2] = 0.02 + 0.96 * ((raw[i * 2] - minU) / spanU);
    raw[i * 2 + 1] = 0.02 + 0.96 * ((raw[i * 2 + 1] - minV) / spanV);
  }
  return raw;
}

function dominantAxis(positions: Float32Array, mean: Vector3, seed: Vector3, reject?: Vector3): Vector3 {
  let axis = normalize(seed);
  if (reject) axis = normalize(sub(axis, { x: reject.x * dot(axis, reject), y: reject.y * dot(axis, reject), z: reject.z * dot(axis, reject) }));
  for (let iteration = 0; iteration < 8; iteration++) {
    const next = { x: 0, y: 0, z: 0 };
    const count = Math.floor(positions.length / 3);
    for (let i = 0; i < count; i++) {
      let point = sub(at(positions, i), mean);
      if (reject) {
        const along = dot(point, reject);
        point = { x: point.x - reject.x * along, y: point.y - reject.y * along, z: point.z - reject.z * along };
      }
      const scale = dot(point, axis);
      next.x += point.x * scale;
      next.y += point.y * scale;
      next.z += point.z * scale;
    }
    axis = normalize(next);
  }
  return axis;
}

function barycentric(
  u: number,
  v: number,
  a: [number, number],
  b: [number, number],
  c: [number, number],
): [number, number, number] | null {
  const denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denom) < 1e-8) return null;
  const w0 = ((b[1] - c[1]) * (u - c[0]) + (c[0] - b[0]) * (v - c[1])) / denom;
  const w1 = ((c[1] - a[1]) * (u - c[0]) + (a[0] - c[0]) * (v - c[1])) / denom;
  const w2 = 1 - w0 - w1;
  if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) return null;
  return [w0, w1, w2];
}

function fillGaps(rgba: Uint8Array, size: number): void {
  for (let pass = 0; pass < 3; pass++) {
    const copy = rgba.slice();
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const pixel = (y * size + x) * 4;
        if (copy[pixel + 3] === 255) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const other = ((y + dy) * size + (x + dx)) * 4;
          if (copy[other + 3] !== 255) continue;
          r += copy[other];
          g += copy[other + 1];
          b += copy[other + 2];
          n++;
        }
        if (n === 0) continue;
        rgba[pixel] = r / n;
        rgba[pixel + 1] = g / n;
        rgba[pixel + 2] = b / n;
        rgba[pixel + 3] = 255;
      }
    }
  }
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 255) continue;
    rgba[i] = SAND[0];
    rgba[i + 1] = SAND[1];
    rgba[i + 2] = SAND[2];
    rgba[i + 3] = 255;
  }
}

function at(values: Float32Array, index: number): Vector3 {
  return { x: values[index * 3] || 0, y: values[index * 3 + 1] || 0, z: values[index * 3 + 2] || 0 };
}

function uvAt(uvs: Float32Array, index: number): [number, number] {
  return [uvs[index * 2] || 0, uvs[index * 2 + 1] || 0];
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function n(value: number): string {
  return value.toFixed(5);
}
