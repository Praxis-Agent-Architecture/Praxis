import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  mouseEmulationDescriptor,
  planMouseEmulation,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseEmulation.md",
  testFileUrl: import.meta.url,
});

test("planMouseEmulation creates a dry-run sequence for mouse primitives", () => {
  const result = planMouseEmulation({
    toolCallId: "mouse-seq-1",
    steps: [
      { kind: "locate" },
      { kind: "move", target: { x: 20, y: 30 }, durationMs: 50 },
      { kind: "click", button: "left", clickCount: 1 },
    ],
    requestedScopes: ["computeruse.mouse.emulate"],
    allowedScopes: ["computeruse.mouse.emulate"],
  });

  assert.equal(mouseEmulationDescriptor.defaultDispatch, "dry-run");
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mouse emulation dry-run plan");
  }

  assert.equal(result.plan.operation, "simulate-mouse-operations");
  assert.equal(result.plan.steps.length, 3);
  assert.equal(result.plan.steps[1]?.dispatch, "dry-run");
  assert.equal(result.plan.wouldEmulateMouse, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planMouseEmulation rejects empty sequences, invalid steps, and real side effects", () => {
  const missing = planMouseEmulation();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_STEPS");
  }

  const invalidMove = planMouseEmulation({
    steps: [{ kind: "move", target: { x: -1, y: 0 } }],
  });
  assert.equal(invalidMove.ok, false);
  if (!invalidMove.ok) {
    assert.equal(invalidMove.error.code, "INVALID_TARGET");
  }

  const invalidCoordinateSpace = planMouseEmulation({
    steps: [{ kind: "locate", coordinateSpace: "viewport" as never }],
  });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) {
    assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");
    assert.equal(invalidCoordinateSpace.error.boundary, "input");
  }

  const realSequence = planMouseEmulation({
    steps: [{ kind: "click" }],
    dryRun: false,
  });
  assert.equal(realSequence.ok, false);
  if (!realSequence.ok) {
    assert.equal(realSequence.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSequence.error.boundary, "governance");
  }
});

test("planMouseEmulation enforces scope and step limits", () => {
  const denied = planMouseEmulation({
    steps: [{ kind: "locate" }],
    requestedScopes: ["computeruse.mouse.emulate"],
    allowedScopes: ["computeruse.cursor.read"],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const tooMany = planMouseEmulation({
    maxSteps: 1,
    steps: [{ kind: "locate" }, { kind: "click" }],
  });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) {
    assert.equal(tooMany.error.code, "STEP_LIMIT_EXCEEDED");
  }
});
