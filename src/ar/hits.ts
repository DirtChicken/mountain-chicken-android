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

export function sampleKind(hit: { type: string; hasDepthData?: boolean; depthSource?: string } | string): "depth" | "feature" | "plane" {
  const type = typeof hit === "string" ? hit : hit.type;
  const source = typeof hit === "string" ? "" : hit.depthSource ?? "";
  const measured = typeof hit === "string" ? false : Boolean(hit.hasDepthData);
  if (type === "DepthPoint" || measured || (source !== "" && source !== "none")) return "depth";
  if (type === "FeaturePoint") return "feature";
  return "plane";
}
