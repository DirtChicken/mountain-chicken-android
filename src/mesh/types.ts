import type { Vector3 } from "../domain/types";

export type SurfaceMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  bounds: { min: Vector3; max: Vector3 };
};

export type SampleKind = "depth" | "feature" | "plane";

export type Accum = {
  x: number;
  y: number;
  z: number;
  n: number;
  kind: SampleKind;
};
