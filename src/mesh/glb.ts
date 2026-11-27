import type { SurfaceMesh } from "./types";

/** One GLB with per-vertex color and the face photo packed inside the file. */
export function meshToGlb(
  mesh: SurfaceMesh,
  colors: Uint8Array,
  uvs: Float32Array,
  jpeg: Uint8Array,
): Uint8Array {
  const count = Math.floor(mesh.positions.length / 3);
  const indexCount = mesh.indices.length;
  const useShort = count <= 65535;
  const indexBytes = align4(indexCount * (useShort ? 2 : 4));
  const positionBytes = count * 12;
  const normalBytes = count * 12;
  const colorBytes = align4(count * 4);
  const uvBytes = count * 8;
  const imageBytes = jpeg.length;
  const binLength = indexBytes + positionBytes + normalBytes + colorBytes + uvBytes + imageBytes;
  const bin = new Uint8Array(binLength);
  let cursor = 0;
  const indexOffset = cursor;
  if (useShort) {
    const view = new DataView(bin.buffer);
    for (let i = 0; i < indexCount; i++) view.setUint16(cursor + i * 2, mesh.indices[i], true);
  } else {
    const view = new DataView(bin.buffer);
    for (let i = 0; i < indexCount; i++) view.setUint32(cursor + i * 4, mesh.indices[i], true);
  }
  cursor += indexBytes;
  const positionOffset = cursor;
  const positionView = new DataView(bin.buffer);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.positions[i * 3 + axis];
      positionView.setFloat32(cursor + (i * 3 + axis) * 4, value, true);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  cursor += positionBytes;
  const normalOffset = cursor;
  const normalView = new DataView(bin.buffer);
  for (let i = 0; i < mesh.normals.length; i++) normalView.setFloat32(cursor + i * 4, mesh.normals[i] || 0, true);
  cursor += normalBytes;
  const colorOffset = cursor;
  for (let i = 0; i < count; i++) {
    bin[cursor + i * 4] = colors[i * 3] ?? 196;
    bin[cursor + i * 4 + 1] = colors[i * 3 + 1] ?? 165;
    bin[cursor + i * 4 + 2] = colors[i * 3 + 2] ?? 116;
    bin[cursor + i * 4 + 3] = 255;
  }
  cursor += colorBytes;
  const uvOffset = cursor;
  const uvView = new DataView(bin.buffer);
  for (let i = 0; i < count; i++) {
    uvView.setFloat32(cursor + i * 8, uvs[i * 2] || 0, true);
    uvView.setFloat32(cursor + i * 8 + 4, 1 - (uvs[i * 2 + 1] || 0), true);
  }
  cursor += uvBytes;
  const imageOffset = cursor;
  bin.set(jpeg, imageOffset);

  const views = [
    view(indexOffset, indexCount * (useShort ? 2 : 4)),
    view(positionOffset, positionBytes),
    view(normalOffset, normalBytes),
    view(colorOffset, count * 4),
    view(uvOffset, uvBytes),
    view(imageOffset, imageBytes),
  ];
  const json = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, TEXCOORD_0: 3 },
        indices: 4,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      extensions: { KHR_materials_unlit: {} },
    }],
    textures: [{ source: 0 }],
    images: [{ mimeType: "image/jpeg", bufferView: 5 }],
    buffers: [{ byteLength: binLength }],
    bufferViews: views,
    accessors: [
      { bufferView: 1, componentType: 5126, count, type: "VEC3", min, max },
      { bufferView: 2, componentType: 5126, count, type: "VEC3" },
      { bufferView: 3, componentType: 5121, count, type: "VEC4", normalized: true },
      { bufferView: 4, componentType: 5126, count, type: "VEC2" },
      { bufferView: 0, componentType: useShort ? 5123 : 5125, count: indexCount, type: "SCALAR" },
    ],
  };
  const jsonText = JSON.stringify(json);
  const jsonBytes = align4(textBytes(jsonText).length);
  const jsonChunk = new Uint8Array(jsonBytes);
  jsonChunk.set(textBytes(jsonText));
  for (let i = textBytes(jsonText).length; i < jsonBytes; i++) jsonChunk[i] = 0x20;
  const binChunk = align4(binLength);
  const total = 12 + 8 + jsonBytes + 8 + binChunk;
  const glb = new Uint8Array(total);
  const header = new DataView(glb.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, total, true);
  header.setUint32(12, jsonBytes, true);
  header.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonChunk, 20);
  const binStart = 20 + jsonBytes;
  header.setUint32(binStart, binChunk, true);
  header.setUint32(binStart + 4, 0x004e4942, true);
  glb.set(bin, binStart + 8);
  return glb;
}

function view(byteOffset: number, byteLength: number) {
  return { buffer: 0, byteOffset, byteLength };
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
