import assert from "node:assert/strict";
import test from "node:test";
import { applyDepthFrame, emptyDepthReport } from "./depthReport";

test("one missing depth frame is not treated as a dead sensor", () => {
  const next = applyDepthFrame(emptyDepthReport(), {
    gotPoints: false,
    error: "NotYetAvailableException: depth image not ready",
  });
  assert.equal(next.mode, "waiting");
  assert.match(next.message, /skipped/);
  assert.match(next.message, /NotYetAvailableException/);
  assert.equal(next.lastError, "NotYetAvailableException: depth image not ready");
});

test("depth is unreadable only after repeated failures and no samples", () => {
  let report = emptyDepthReport();
  for (let i = 0; i < 8; i++) {
    report = applyDepthFrame(report, { gotPoints: false, error: "ResourceExhaustedException: max images" });
  }
  assert.equal(report.mode, "unavailable");
  assert.match(report.message, /not readable/);
  assert.match(report.message, /ResourceExhaustedException/);
});

test("camera hits keep depth marked on even if one image read is skipped", () => {
  const flowing = { ...emptyDepthReport(), total: 12, samplesPerSec: 4, mode: "hit-test", source: "hit-test" };
  const next = applyDepthFrame(flowing, { gotPoints: false, error: "NotYetAvailableException: depth image not ready" });
  assert.equal(next.mode, "hit-test");
  assert.match(next.message, /Depth is on/);
  assert.match(next.message, /NotYetAvailableException/);
  assert.equal(next.misses, 0);
});

test("a later good frame clears the skip streak", () => {
  let report = applyDepthFrame(emptyDepthReport(), { gotPoints: false, error: "NotYetAvailableException" });
  report = { ...report, total: 4, samplesPerSec: 3 };
  report = applyDepthFrame(report, { gotPoints: true, mode: "automatic", source: "arcore-raw" });
  assert.equal(report.misses, 0);
  assert.equal(report.lastError, null);
  assert.match(report.message, /Depth is on/);
});
