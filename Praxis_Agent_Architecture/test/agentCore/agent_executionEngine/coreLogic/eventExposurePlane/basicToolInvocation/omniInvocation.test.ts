import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeOmniInvocationEvent,
  omniInvocationDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/omniInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/omniInvocation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/omniInvocation.md",
  testFileUrl: import.meta.url,
});

test("omniInvocation exposes a dry-run multimodal invocation event", () => {
  const result = exposeOmniInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    modality: "image",
    targetId: " frame-1 ",
    requestedScopes: ["tool:omni", "tool:omni", " "],
    allowedScopes: ["tool:omni"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { correlationId: " corr-a " },
    metadata: { mimeType: "image/png" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.omni");
  assert.equal(result.event.omni.modality, "image");
  assert.equal(result.event.omni.targetId, "frame-1");
  assert.deepEqual(result.event.requestedScopes, ["tool:omni"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:omni"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(omniInvocationDescriptor.unsafeSideEffects, false);
});

test("omniInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeOmniInvocationEvent();

  if (result.ok) {
    throw new Error("empty Omni invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("omniInvocation rejects runtime-state failures", () => {
  const result = exposeOmniInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    modality: "audio",
    targetId: "clip-a",
    runtimeReady: false,
  });

  if (result.ok) {
    throw new Error("Omni invocation should not expose events when runtime is not ready");
  }

  assert.equal(result.error.code, "RUNTIME_NOT_READY");
  assert.equal(result.error.boundary, "runtime-state");
  assert.deepEqual(result.events, ["basicToolInvocation.omni.rejected"]);
});
