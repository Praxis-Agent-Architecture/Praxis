import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeInterruptEvent } from "../../../../../src/executionEngine/coreLogic/eventExposurePlane/interruptEvent.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/interruptEvent.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/interruptEvent.md",
  testFileUrl: import.meta.url,
});

test("exposeInterruptEvent exposes an execution interrupt event without delivering it", () => {
  const result = exposeInterruptEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    interruptId: "interrupt-1",
    reason: "user requested pause",
    mode: "pause",
    targetLoopId: "main-loop",
    requestedScopes: ["runtime.interrupt"],
    allowedScopes: ["runtime.interrupt"],
    trace: { correlationId: "corr-interrupt" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.event.kind, "execution.interrupt");
  assert.equal(result.event.mode, "pause");
  assert.equal(result.event.targetLoopId, "main-loop");
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.interruptDelivered, false);
  assert.equal(result.event.unsafeSideEffects, false);
});

test("exposeInterruptEvent requires a reason and blocks real interrupt delivery", () => {
  const missingReason = exposeInterruptEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    interruptId: "interrupt-1",
    reason: "",
  });

  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.error.code, "MISSING_REASON");
  assert.equal(missingReason.error.boundary, "input");

  const realInterrupt = exposeInterruptEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    interruptId: "interrupt-2",
    reason: "cancel running loop",
    dryRun: false,
  });

  assert.equal(realInterrupt.ok, false);
  assert.equal(realInterrupt.error.code, "REAL_INTERRUPT_BLOCKED");
  assert.equal(realInterrupt.error.boundary, "contract");
});
