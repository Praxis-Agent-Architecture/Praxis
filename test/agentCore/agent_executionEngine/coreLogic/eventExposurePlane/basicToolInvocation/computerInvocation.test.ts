import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  computerInvocationDescriptor,
  exposeComputerInvocationEvent,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/computerInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/computerInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/computerInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposeComputerInvocationEvent exposes a guarded computer event", () => {
  const result = exposeComputerInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    action: "click",
    eventSource: "basicToolLayer",
    surfaceHint: "desktop",
    payload: { target: "settings-button" },
    requestedScopes: ["tool:computer"],
    allowedScopes: ["tool:computer"],
    subscribers: ["inspection"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(computerInvocationDescriptor.unsafeSideEffects, false);
  assert.equal(result.invocation.toolKind, "computer");
  assert.equal(result.invocation.action, "click");
  assert.equal(result.invocation.surfaceHint, "desktop");
  assert.deepEqual(result.invocation.payload, { target: "settings-button" });
  assert.deepEqual(result.invocation.acceptedScopes, ["tool:computer"]);
  assert.equal(result.invocation.execution.dryRun, true);
  assert.equal(result.invocation.execution.invoked, false);
  assert.equal(result.invocation.execution.unsafeSideEffects, false);
});

test("exposeComputerInvocationEvent rejects missing action", () => {
  const result = exposeComputerInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventSource: "basicToolLayer",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("missing action must be rejected");
  }

  assert.equal(result.error.code, "MISSING_ACTION");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("exposeComputerInvocationEvent rejects real desktop side effects", () => {
  const result = exposeComputerInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    action: "click",
    eventSource: "basicToolLayer",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real side effects must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["eventExposure.basicTool.computer.rejected"]);
});
