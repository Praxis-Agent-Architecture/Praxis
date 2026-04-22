import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createStreamInvocationSurface } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/streamInvocationSurface.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/streamInvocationSurface.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/streamInvocationSurface.md",
  testFileUrl: import.meta.url,
});

test("createStreamInvocationSurface exposes stream frames without opening live transport", () => {
  const result = createStreamInvocationSurface({
    runtimeId: "runtime-1",
    streamId: " stream-1 ",
    targetId: "agent-1",
    source: "application",
    channel: "agent",
    frames: [
      { kind: "open", eventId: " evt-open " },
      { kind: "chunk", data: { text: "hello" } },
    ],
    requestedScopes: ["stream.read"],
    allowedScopes: ["stream.read"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.surface.invocationType, "stream");
  assert.equal(result.surface.runtimeId, "runtime-1");
  assert.equal(result.surface.streamId, "stream-1");
  assert.equal(result.surface.targetId, "agent-1");
  assert.equal(result.surface.status, "streaming");
  assert.equal(result.surface.dispatch, "dry-run");
  assert.equal(result.surface.opensLiveTransport, false);
  assert.equal(result.surface.providerRawShapeExposed, false);
  assert.equal(result.surface.unsafeSideEffects, false);
  assert.deepEqual(
    result.surface.frames.map((frame) => ({ kind: frame.kind, sequence: frame.sequence, eventId: frame.eventId })),
    [
      { kind: "open", sequence: 0, eventId: "evt-open" },
      { kind: "chunk", sequence: 1, eventId: undefined },
    ],
  );
});

test("createStreamInvocationSurface returns classified stream and envelope failures", () => {
  const missingStream = createStreamInvocationSurface({
    runtimeId: "runtime-1",
    streamId: "",
    targetId: "agent-1",
    source: "application",
  });

  assert.equal(missingStream.ok, false);
  assert.equal(missingStream.error.code, "MISSING_STREAM_ID");
  assert.equal(missingStream.error.boundary, "input");

  const deniedScope = createStreamInvocationSurface({
    runtimeId: "runtime-1",
    streamId: "stream-2",
    targetId: "agent-1",
    source: "application",
    requestedScopes: ["stream.read", "internal-state"],
    allowedScopes: ["stream.read"],
  });

  assert.equal(deniedScope.ok, false);
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");
});
