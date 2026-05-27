import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeMediaInvocationEvent,
  mediaInvocationDescriptor,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/mediaInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/mediaInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/mediaInvocation.md",
  testFileUrl: import.meta.url,
});

test("mediaInvocation exposes a dry-run media invocation event", () => {
  const result = exposeMediaInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    modality: "image",
    targetId: " frame-1 ",
    requestedScopes: ["tool:media", "tool:media", " "],
    allowedScopes: ["tool:media"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { correlationId: " corr-a " },
    metadata: { mimeType: "image/png" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.media");
  assert.equal(result.event.media.modality, "image");
  assert.equal(result.event.media.targetId, "frame-1");
  assert.deepEqual(result.event.requestedScopes, ["tool:media"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:media"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(mediaInvocationDescriptor.unsafeSideEffects, false);
});

test("mediaInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeMediaInvocationEvent();

  if (result.ok) {
    throw new Error("empty Media invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("mediaInvocation rejects runtime-state failures", () => {
  const result = exposeMediaInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    modality: "audio",
    targetId: "clip-a",
    runtimeReady: false,
  });

  if (result.ok) {
    throw new Error("Media invocation should not expose events when runtime is not ready");
  }

  assert.equal(result.error.code, "RUNTIME_NOT_READY");
  assert.equal(result.error.boundary, "runtime-state");
  assert.deepEqual(result.events, ["basicToolInvocation.media.rejected"]);
});
