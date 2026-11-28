import type { Route } from "../domain/types";
import type { SurfaceMesh } from "../mesh/types";
import { transformPoint, type Mat4 } from "../viewer/math";

export const scanStage = {
  vertices: null as [number, number, number][] | null,
  normals: null as [number, number, number][] | null,
  triangles: null as [number, number, number][] | null,
  holds: [] as { id: string; position: [number, number, number] }[],
  revision: 0,
};

export function showPlacedMesh(mesh: SurfaceMesh, routes: Route[], matrix: Mat4): void {
  const vertices: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const count = Math.floor(mesh.positions.length / 3);
  for (let index = 0; index < count; index++) {
    const point = transformPoint(matrix, {
      x: mesh.positions[index * 3],
      y: mesh.positions[index * 3 + 1],
      z: mesh.positions[index * 3 + 2],
    });
    vertices.push([point.x, point.y, point.z]);
    const normal = transformPoint(matrix, {
      x: mesh.normals[index * 3] || 0,
      y: mesh.normals[index * 3 + 1] || 0,
      z: mesh.normals[index * 3 + 2] || 0,
    });
    const origin = transformPoint(matrix, { x: 0, y: 0, z: 0 });
    normals.push([normal.x - origin.x, normal.y - origin.y, normal.z - origin.z]);
  }
  scanStage.vertices = vertices;
  scanStage.normals = normals;
  const triangles: [number, number, number][] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    triangles.push([mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]]);
  }
  scanStage.triangles = triangles;
  scanStage.holds = routes.flatMap((route) =>
    route.points.filter((point) => point.type !== "path").map((point) => {
      const placed = transformPoint(matrix, point.position);
      return { id: point.id, position: [placed.x, placed.y, placed.z] as [number, number, number] };
    }),
  );
  scanStage.revision += 1;
}

export function clearPlacedMesh(): void {
  scanStage.vertices = null;
  scanStage.normals = null;
  scanStage.triangles = null;
  scanStage.holds = [];
  scanStage.revision += 1;
}

