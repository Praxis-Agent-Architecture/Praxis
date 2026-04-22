import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  mouseMoveDescriptor,
  planMouseMove,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseMove.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseMove.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseMove.md",
  testFileUrl: import.meta.url,
});

test("planMouseMove creates a governed dry-run movement plan", () => {
  const result = planMouseMove({
    toolCallId: "move-1",
    target: { x: 120, y: 80 },
    durationMs: 150,
    requestedScopes: ["computeruse.mouse.move"],
    allowedScopes: ["computeruse.mouse.move"],
  });

  assert.equal(mouseMoveDescriptor.defaultDispatch, "dry-run");
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mouse move dry-run plan");
  }

  assert.equal(result.plan.operation, "move-mouse");
  assert.deepEqual(result.plan.target, { x: 120, y: 80 });
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldMoveCursor, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planMouseMove rejects missing target, invalid coordinates, and real movement", () => {
  const missing = planMouseMove();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_TARGET");
  }

  const invalidTarget = planMouseMove({ target: { x: -1, y: 4 } });
  assert.equal(invalidTarget.ok, false);
  if (!invalidTarget.ok) {
    assert.equal(invalidTarget.error.code, "INVALID_TARGET");
    assert.equal(invalidTarget.error.boundary, "input");
  }

  const invalidCoordinateSpace = planMouseMove({ target: { x: 1, y: 2 }, coordinateSpace: "viewport" as never });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) {
    assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");
    assert.equal(invalidCoordinateSpace.error.boundary, "input");
  }

  const realMove = planMouseMove({ target: { x: 1, y: 2 }, dryRun: false });
  assert.equal(realMove.ok, false);
  if (!realMove.ok) {
    assert.equal(realMove.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realMove.error.boundary, "governance");
  }
});

test("planMouseMove classifies runtime scope denial", () => {
  const result = planMouseMove({
    target: { x: 1, y: 2 },
    requestedScopes: ["computeruse.mouse.move"],
    allowedScopes: ["computeruse.cursor.read"],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_DENIED");
    assert.equal(result.error.safeForRuntimeInspection, true);
  }
});
