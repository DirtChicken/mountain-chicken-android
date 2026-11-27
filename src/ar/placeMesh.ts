import { rotateY, scanPointToWorld } from "../domain/frame";
import type { Vector3 } from "../domain/types";
import { AR_LIMITS, prepareMeshForDisplay } from "../mesh/prepareMesh";
import type { SurfaceMesh } from "../mesh/types";

export type ViroMeshData = {
  vertices: [number, number, number][];
  normals: [number, number, number][];
  triangles: [number, number, number][];
};

/** Bake the scan into the current AR frame. The node itself stays at the origin. */
export function placeMesh(mesh: SurfaceMesh, origin: Vector3, yaw: number, uniformScale: number): ViroMeshData {
  const compact = prepareMeshForDisplay(mesh, AR_LIMITS);
  const vertices: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  for (let i = 0; i < compact.positions.length; i += 3) {
    const world = scanPointToWorld(
      { x: compact.positions[i], y: compact.positions[i + 1], z: compact.positions[i + 2] },
      origin,
      yaw,
      uniformScale,
    );
    const normal = rotateY(
      { x: compact.normals[i], y: compact.normals[i + 1], z: compact.normals[i + 2] },
      yaw,
    );
    vertices.push([world.x, world.y, world.z]);
    normals.push([normal.x, normal.y, normal.z]);
  }
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < compact.indices.length; i += 3) {
    triangles.push([compact.indices[i], compact.indices[i + 1], compact.indices[i + 2]]);
  }
  return { vertices, normals, triangles };
}
