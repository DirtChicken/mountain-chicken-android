import { computeNormals, meshBounds } from "./reconstruct";
import type { SurfaceMesh } from "./types";

export function meshToObj(mesh: SurfaceMesh): string {
  const lines: string[] = ["# Mountain Chicken scan, meters, Y up"];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lines.push(
      `v ${fmt(mesh.positions[i])} ${fmt(mesh.positions[i + 1])} ${fmt(mesh.positions[i + 2])}`,
    );
  }
  for (let i = 0; i < mesh.normals.length; i += 3) {
    lines.push(`vn ${fmt(mesh.normals[i])} ${fmt(mesh.normals[i + 1])} ${fmt(mesh.normals[i + 2])}`);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] + 1;
    const b = mesh.indices[i + 1] + 1;
    const c = mesh.indices[i + 2] + 1;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return lines.join("\n") + "\n";
}

export function objToMesh(text: string): SurfaceMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const [, xs, ys, zs] = line.split(/\s+/);
      positions.push(Number(xs), Number(ys), Number(zs));
    } else if (line.startsWith("vn ")) {
      const [, xs, ys, zs] = line.split(/\s+/);
      normals.push(Number(xs), Number(ys), Number(zs));
    } else if (line.startsWith("f ")) {
      const parts = line.split(/\s+/).slice(1);
      if (parts.length < 3) continue;
      const ids = parts.map((part) => Number(part.split("/")[0]) - 1);
      for (let i = 1; i < ids.length - 1; i++) {
        indices.push(ids[0], ids[i], ids[i + 1]);
      }
    }
  }
  if (positions.length < 9 || indices.length < 3) {
    throw new Error("OBJ does not contain a mesh");
  }
  const positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  const normalArray =
    normals.length === positions.length ? Float32Array.from(normals) : computeNormals(positionArray, indexArray);
  return {
    positions: positionArray,
    normals: normalArray,
    indices: indexArray,
    bounds: meshBounds(positionArray),
  };
}

function fmt(value: number): string {
  return value.toFixed(5);
}
