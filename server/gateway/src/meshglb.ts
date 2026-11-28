const MAX_VERTICES = 65000;

export type ObjMesh = {
  positions: number[];
  uvs: number[];
  faces: number[];
};

export function parseObj(text: string): ObjMesh {
  const positions: number[][] = [];
  const uvs: number[][] = [];
  const outPositions: number[] = [];
  const outUvs: number[] = [];
  const faces: number[] = [];
  const weld = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/);
      positions.push([Number(x), Number(y), Number(z)]);
    } else if (line.startsWith("vt ")) {
      const [, u, v] = line.split(/\s+/);
      uvs.push([Number(u), Number(v)]);
    } else if (line.startsWith("f ")) {
      const corners = line.split(/\s+/).slice(1);
      if (corners.length < 3) continue;
      const ids = corners.map((corner) => {
        const [v, vt] = corner.split("/");
        const key = `${v}/${vt ?? ""}`;
        const known = weld.get(key);
        if (known != null) return known;
        const position = positions[Number(v) - 1];
        const uv = vt ? uvs[Number(vt) - 1] : [0, 0];
        if (!position) return -1;
        const index = outPositions.length / 3;
        outPositions.push(position[0], position[1], position[2]);
        outUvs.push(uv?.[0] ?? 0, uv?.[1] ?? 0);
        weld.set(key, index);
        return index;
      });
      for (let i = 1; i < ids.length - 1; i++) {
        if (ids[0] < 0 || ids[i] < 0 || ids[i + 1] < 0) continue;
        faces.push(ids[0], ids[i], ids[i + 1]);
      }
    }
  }
  return { positions: outPositions, uvs: outUvs, faces };
}

export type MeshPart = { positions: Float32Array; uvs: Float32Array; indices: Uint16Array };

/** Split so every draw uses 16-bit indices. */
export function splitMesh(mesh: ObjMesh, maxVertices = MAX_VERTICES): MeshPart[] {
  const parts: MeshPart[] = [];
  let map = new Map<number, number>();
  let positions: number[] = [];
  let uvs: number[] = [];
  let indices: number[] = [];
  const flush = () => {
    if (!indices.length) return;
    parts.push({
      positions: Float32Array.from(positions),
      uvs: Float32Array.from(uvs),
      indices: Uint16Array.from(indices),
    });
    map = new Map();
    positions = [];
    uvs = [];
    indices = [];
  };
  for (let i = 0; i < mesh.faces.length; i += 3) {
    const tri = [mesh.faces[i], mesh.faces[i + 1], mesh.faces[i + 2]];
    const extra = tri.filter((index) => !map.has(index)).length;
    if (map.size + extra > maxVertices) flush();
    for (const index of tri) {
      let local = map.get(index);
      if (local == null) {
        local = map.size;
        map.set(index, local);
        positions.push(mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]);
        uvs.push(mesh.uvs[index * 2] ?? 0, mesh.uvs[index * 2 + 1] ?? 0);
      }
      indices.push(local);
    }
  }
  flush();
  return parts;
}

export function meshToGlb(parts: MeshPart[], jpeg: Uint8Array | null): Uint8Array {
  const bins: Uint8Array[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const accessors: Record<string, unknown>[] = [];
  const primitives: Record<string, unknown>[] = [];
  let cursor = 0;
  const push = (bytes: Uint8Array) => {
    const offset = cursor;
    bins.push(bytes);
    const pad = (4 - (bytes.length % 4)) % 4;
    if (pad) bins.push(new Uint8Array(pad));
    cursor += bytes.length + pad;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    return views.length - 1;
  };
  for (const part of parts) {
    const count = part.positions.length / 3;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = part.positions[i * 3 + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
    const positionView = push(new Uint8Array(part.positions.buffer));
    const uvView = push(new Uint8Array(part.uvs.buffer));
    const indexView = push(new Uint8Array(part.indices.buffer));
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count, type: "VEC3", min, max });
    accessors.push({ bufferView: uvView, componentType: 5126, count, type: "VEC2" });
    accessors.push({ bufferView: indexView, componentType: 5123, count: part.indices.length, type: "SCALAR" });
    primitives.push({
      attributes: { POSITION: positionAccessor, TEXCOORD_0: positionAccessor + 1 },
      indices: positionAccessor + 2,
      material: 0,
    });
  }
  let imageView = -1;
  if (jpeg && jpeg.length) imageView = push(jpeg);
  const bin = new Uint8Array(cursor);
  let at = 0;
  for (const chunk of bins) {
    bin.set(chunk, at);
    at += chunk.length;
  }
  const json = {
    asset: { version: "2.0", generator: "mountain-chicken-gateway" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    materials: [jpeg ? {
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
    } : { pbrMetallicRoughness: { baseColorFactor: [0.72, 0.62, 0.45, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    textures: jpeg ? [{ source: 0 }] : [],
    images: jpeg && imageView >= 0 ? [{ mimeType: "image/jpeg", bufferView: imageView }] : [],
    buffers: [{ byteLength: bin.length }],
    bufferViews: views,
    accessors,
  };
  const jsonText = JSON.stringify(json);
  const jsonBytes = align4(Buffer.byteLength(jsonText));
  const jsonChunk = Buffer.alloc(jsonBytes, 0x20);
  jsonChunk.write(jsonText);
  const total = 12 + 8 + jsonBytes + 8 + bin.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonBytes, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binStart = 20 + jsonBytes;
  glb.writeUInt32LE(bin.length, binStart);
  glb.writeUInt32LE(0x004e4942, binStart + 4);
  Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength).copy(glb, binStart + 8);
  return Uint8Array.from(glb);
}

export function objToGlb(objText: string, jpeg: Uint8Array | null, maxVertices = MAX_VERTICES): Uint8Array {
  return meshToGlb(splitMesh(parseObj(objText), maxVertices), jpeg);
}

function align4(value: number): number {
  return (value + 3) & ~3;
}
