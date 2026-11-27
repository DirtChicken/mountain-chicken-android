export type HitLike = {
  type: string;
  transform: { position: [number, number, number] };
};

export function bestHit<T extends HitLike>(results: T[] | null | undefined): T | null {
  if (!results?.length) return null;
  return results.find((hit) => hit.type === "DepthPoint")
    ?? results.find((hit) => hit.type === "FeaturePoint")
    ?? results[0];
}

export function hitPosition(hit: HitLike): { x: number; y: number; z: number } {
  const [x, y, z] = hit.transform.position;
  return { x, y, z };
}

export function sampleKind(type: string): "depth" | "feature" | "plane" {
  if (type === "DepthPoint") return "depth";
  if (type === "FeaturePoint") return "feature";
  return "plane";
}
