import assert from "node:assert/strict";
import test from "node:test";
import { emptyTrace, noteLaunchState } from "./trace";

test("the next launch remembers the screen that was open when the app died", () => {
  const open = { ...emptyTrace(), sessionOpen: true, lastScreen: "plot: mounting 3d", lastScreenAt: "t0" };
  const next = noteLaunchState(open, "t1");
  assert.equal(next.lastClosedWhile, "plot: mounting 3d");
  assert.equal(next.history[0]?.message, "App closed without a clean exit");
  assert.equal(next.sessionOpen, true);
  assert.equal(next.lastScreen, "launch");
});

test("a clean first launch does not invent a crash", () => {
  const next = noteLaunchState(emptyTrace(), "t1");
  assert.equal(next.lastClosedWhile, null);
  assert.equal(next.history.length, 0);
});
