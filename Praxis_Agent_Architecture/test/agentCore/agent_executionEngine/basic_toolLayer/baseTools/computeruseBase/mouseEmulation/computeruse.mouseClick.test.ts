import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  mouseClickDescriptor,
  planMouseClick,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseClick.md",
  testFileUrl: import.meta.url,
});

test("planMouseClick creates a current-cursor dry-run click envelope by default", () => {
  const result = planMouseClick({
    toolCallId: "click-1",
    requestedScopes: ["computeruse.mouse.click"],
    allowedScopes: ["computeruse.mouse.click"],
  });

  assert.equal(mouseClickDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mouse click dry-run plan");
  }

  assert.equal(result.plan.operation, "click-mouse");
  assert.equal(result.plan.button, "left");
  assert.equal(result.plan.clickCount, 1);
  assert.equal(result.plan.usesCurrentCursor, true);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planMouseClick can target a coordinate while remaining dry-run only", () => {
  const result = planMouseClick({
    button: "right",
    clickCount: 2,
    at: { x: 10, y: 20 },
    coordinateSpace: "window",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected targeted click plan");
  }

  assert.equal(result.plan.button, "right");
  assert.equal(result.plan.clickCount, 2);
  assert.deepEqual(result.plan.at, { x: 10, y: 20 });
  assert.equal(result.plan.usesCurrentCursor, false);
});

test("planMouseClick rejects invalid click shape, denied scope, and real clicks", () => {
  const invalidCount = planMouseClick({ clickCount: 4 });
  assert.equal(invalidCount.ok, false);
  if (!invalidCount.ok) {
    assert.equal(invalidCount.error.code, "INVALID_CLICK_COUNT");
  }

  const invalidCoordinateSpace = planMouseClick({ coordinateSpace: "viewport" as never });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) {
    assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");
    assert.equal(invalidCoordinateSpace.error.boundary, "input");
  }

  const invalidTarget = planMouseClick({ at: { x: Number.NaN, y: 1 } });
  assert.equal(invalidTarget.ok, false);
  if (!invalidTarget.ok) {
    assert.equal(invalidTarget.error.code, "INVALID_TARGET");
  }

  const denied = planMouseClick({
    requestedScopes: ["computeruse.mouse.click"],
    allowedScopes: ["computeruse.cursor.read"],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const realClick = planMouseClick({ dryRun: false });
  assert.equal(realClick.ok, false);
  if (!realClick.ok) {
    assert.equal(realClick.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realClick.error.boundary, "governance");
  }
});
