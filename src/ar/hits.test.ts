import assert from "node:assert/strict";
import test from "node:test";
import { sampleKind } from "./hits";

test("a feature hit that carries a depth image counts as depth", () => {
  assert.equal(sampleKind({ type: "FeaturePoint", hasDepthData: true, depthSource: "monocular" }), "depth");
  assert.equal(sampleKind({ type: "DepthPoint" }), "depth");
  assert.equal(sampleKind({ type: "FeaturePoint", hasDepthData: false, depthSource: "none" }), "feature");
  assert.equal(sampleKind("ExistingPlane"), "plane");
});
