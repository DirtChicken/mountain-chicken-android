import assert from "node:assert/strict";
import test from "node:test";
import { flushCapture, getCaptureSnapshot, noteSample, resetCapture, setCapturePaused } from "./scanCapture";

test("pause keeps this scan's cells and a repeat look does not add a second one", () => {
  resetCapture();
  noteSample({ x: 1, y: 1, z: 1 }, "depth");
  flushCapture();
  const before = getCaptureSnapshot().sampleCount;
  setCapturePaused(true);
  noteSample({ x: 3, y: 0, z: 0 }, "depth");
  flushCapture();
  assert.equal(getCaptureSnapshot().sampleCount, before);
  assert.equal(getCaptureSnapshot().paused, true);
  setCapturePaused(false);
  noteSample({ x: 1.001, y: 1, z: 1 }, "depth");
  flushCapture();
  assert.equal(getCaptureSnapshot().sampleCount, before);
});
