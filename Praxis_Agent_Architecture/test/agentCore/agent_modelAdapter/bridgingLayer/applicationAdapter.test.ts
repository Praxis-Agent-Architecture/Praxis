import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationAdapterDescriptor,
  createApplicationModelAdapter,
} from "../../../../src/agentCore/agent_modelAdapter/bridgingLayer/applicationAdapter.js";
import type { ApplicationBridgeCandidate } from "../../../../src/agentCore/agent_modelAdapter/bridgingLayer/applicationCompatibilityCheck.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/bridgingLayer/applicationAdapter.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/bridgingLayer/applicationAdapter.md",
  testFileUrl: import.meta.url,
});

function compatibleCandidate(): ApplicationBridgeCandidate {
  return {
    runtimeId: "runtime",
    bridgeId: "bridge-1",
    transformationId: "transform-1",
    sourceInterfaceId: "responses-output",
    capabilities: [{ capabilityId: "text-output", providerKey: "output_text", available: true, required: true }],
    formats: [{ formatId: "text", mediaType: "text/plain", streaming: true, available: true }],
    compatible: true,
    bridgeReadiness: "ready",
    providerPayloadCreated: false,
    unsafeSideEffects: false,
  };
}

test("applicationAdapter wraps a compatible bridge candidate as a dry-run agentCore model adapter", async () => {
  const result = createApplicationModelAdapter({
    runtimeId: " runtime ",
    adapterId: " adapter-1 ",
    candidate: compatibleCandidate(),
    requiredCapabilityIds: ["text-output"],
    requiredFormatIds: ["text"],
    requestedScopes: ["model.invoke"],
    allowedScopes: ["model.invoke"],
  });

  assert.equal(applicationAdapterDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected application adapter");
  }

  assert.equal(result.adapter.kind, "agentCore.modelAdapter.applicationAdapter");
  assert.equal(result.adapter.adapterId, "adapter-1");
  assert.equal(result.adapter.readiness, "ready");
  assert.equal(result.adapter.providerPayloadCreated, false);
  assert.equal(result.adapter.unsafeSideEffects, false);

  const invocation = await result.adapter.invoke({ prompt: "hello" });
  assert.equal(invocation.ok, true);
  if (!invocation.ok) {
    throw new Error("expected dry-run invocation");
  }
  assert.equal(invocation.output.dryRun, true);
  assert.equal(invocation.output.providerPayloadCreated, false);
  assert.equal(invocation.output.unsafeSideEffects, false);
});

test("applicationAdapter rejects incompatible candidates and keeps invocation input explicit", async () => {
  const incompatible = createApplicationModelAdapter({
    runtimeId: "runtime",
    adapterId: "adapter-2",
    candidate: {
      ...compatibleCandidate(),
      bridgeReadiness: "blocked-by-compatibility-gap",
      gaps: [{ kind: "capability", id: "tool-call-output", reason: "missing" }],
    },
  });
  assert.equal(incompatible.ok, false);
  if (incompatible.ok) {
    throw new Error("expected incompatible bridge rejection");
  }
  assert.equal(incompatible.error.code, "COMPATIBILITY_REJECTED");

  const adapter = createApplicationModelAdapter({
    runtimeId: "runtime",
    adapterId: "adapter-3",
    candidate: compatibleCandidate(),
  });
  assert.equal(adapter.ok, true);
  if (!adapter.ok) {
    throw new Error("expected compatible adapter");
  }

  const missingInput = await adapter.adapter.invoke();
  assert.equal(missingInput.ok, false);
  if (missingInput.ok) {
    throw new Error("expected explicit invocation input rejection");
  }
  assert.equal(missingInput.error.code, "MISSING_INVOCATION_INPUT");
});

test("applicationAdapter rejects stale compatibility reports for another bridge candidate", () => {
  const candidate = compatibleCandidate();
  const result = createApplicationModelAdapter({
    runtimeId: "runtime",
    adapterId: "adapter-stale-compatibility",
    candidate,
    compatibility: {
      kind: "agentCore.modelAdapter.applicationCompatibility",
      runtimeId: "runtime",
      checkId: "stale-check",
      candidateId: "different-bridge",
      compatible: true,
      agentCoreUsable: true,
      missingCapabilities: [],
      missingFormats: [],
      gaps: [],
      acceptedScopes: [],
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected stale compatibility report rejection");
  }
  assert.equal(result.error.code, "COMPATIBILITY_REJECTED");
  assert.equal(result.error.boundary, "contract");
});

test("applicationAdapter can use an injected mockable invocation envelope", async () => {
  const result = createApplicationModelAdapter({
    runtimeId: "runtime",
    adapterId: "adapter-4",
    candidate: compatibleCandidate(),
    invoker: (input) => ({
      ok: true,
      invocationId: input.invocationId ?? "mock",
      output: {
        kind: "agentCore.modelAdapter.applicationInvocationOutput",
        content: { echoedPrompt: input.prompt },
        dryRun: true,
        providerPayloadCreated: false,
        unsafeSideEffects: false,
      },
      events: ["mock.invoked"],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mockable adapter");
  }

  const invocation = await result.adapter.invoke({ invocationId: "call-1", prompt: "ping" });
  assert.equal(invocation.ok, true);
  if (!invocation.ok) {
    throw new Error("expected injected invocation");
  }
  assert.deepEqual(invocation.output.content, { echoedPrompt: "ping" });
  assert.equal(invocation.output.providerPayloadCreated, false);
});
