import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  cursorLocateDescriptor,
  planCursorLocate,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.cursorLocate.md",
  testFileUrl: import.meta.url,
});

test("planCursorLocate creates a dry-run cursor location envelope without reading the desktop", async () => {
  const result = await planCursorLocate({
    toolCallId: "cursor-1",
    coordinateSpace: "screen",
    requestedScopes: ["computeruse.cursor.read"],
    allowedScopes: ["computeruse.cursor.read"],
  });

  assert.equal(cursorLocateDescriptor.defaultDispatch, "dry-run");
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected cursor locate dry-run plan");
  }

  assert.equal(result.plan.operation, "locate-cursor");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.readsCursorDirectly, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.snapshot, undefined);
  assert.equal(result.audit.dryRun, true);
});

test("planCursorLocate can use an injected locator without direct global coupling", async () => {
  const result = await planCursorLocate({
    toolCallId: "cursor-2",
    dryRun: false,
    locator: ({ coordinateSpace }) => ({
      position: { x: 42, y: 24, coordinateSpace },
      capturedAt: "2026-04-22T00:00:00.000Z",
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected cursor locate result");
  }

  assert.equal(result.plan.dispatch, "injected-locator");
  assert.equal(result.plan.readsCursorDirectly, false);
  assert.deepEqual(result.snapshot?.position, { x: 42, y: 24, coordinateSpace: "screen" });
});

test("planCursorLocate rejects denied scope and non-injected real cursor reads", async () => {
  const invalidCoordinateSpace = await planCursorLocate({ coordinateSpace: "viewport" as never });
  assert.equal(invalidCoordinateSpace.ok, false);
  if (!invalidCoordinateSpace.ok) {
    assert.equal(invalidCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");
    assert.equal(invalidCoordinateSpace.error.boundary, "input");
  }

  const denied = await planCursorLocate({
    requestedScopes: ["computeruse.cursor.read"],
    allowedScopes: ["computeruse.mouse.move"],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const noLocator = await planCursorLocate({ dryRun: false });
  assert.equal(noLocator.ok, false);
  if (!noLocator.ok) {
    assert.equal(noLocator.error.code, "LOCATOR_NOT_INJECTED");
    assert.equal(noLocator.error.boundary, "execution");
  }
});

test("planCursorLocate hides injected locator internals from public errors", async () => {
  const result = await planCursorLocate({
    dryRun: false,
    locator: () => {
      throw new Error("secret display server detail");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "LOCATOR_REJECTED");
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /secret display server detail/);
  }
});
