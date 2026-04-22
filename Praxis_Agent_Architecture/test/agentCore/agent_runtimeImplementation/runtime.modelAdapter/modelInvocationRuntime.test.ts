import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { planModelInvocation } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.md",
  testFileUrl: import.meta.url,
});

test("modelInvocationRuntime builds a mockable dry-run invocation envelope", () => {
  const result = planModelInvocation({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    loweredPrompt: {
      loweringId: " lowering-1 ",
      promptPackId: " prompt-pack-1 ",
      materialRefs: [" system:base ", "user:turn:1"],
    },
    capability: { capabilityId: " capability:text ", kind: " text-generation " },
    carrier: { carrierId: " openai-carrier ", provider: " openai " },
    mode: " stream ",
    metadata: { requestedBy: "invocationMethod" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.invocationId, "runtime-1:modelInvocation:lowering-1");
  assert.equal(result.plan.route, "runtime.modelAdapter.modelInvocationRuntime");
  assert.equal(result.plan.transport, "mockable-envelope");
  assert.equal(result.plan.providerCallPermitted, false);
  assert.equal(result.plan.envelope.loweringId, "lowering-1");
  assert.equal(result.plan.envelope.promptPackId, "prompt-pack-1");
  assert.equal(result.plan.envelope.capabilityId, "capability:text");
  assert.equal(result.plan.envelope.carrierId, "openai-carrier");
  assert.equal(result.plan.envelope.mode, "stream");
  assert.deepEqual(result.plan.envelope.materialRefs, ["system:base", "user:turn:1"]);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("modelInvocationRuntime rejects missing envelopes and real provider calls in first pass", () => {
  const missing = planModelInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    capability: { capabilityId: "capability:text" },
    carrier: { carrierId: "carrier-1" },
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_LOWERED_PROMPT");
  assert.equal(missing.error.boundary, "prompt");

  const unsafe = planModelInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-1" },
    capability: { capabilityId: "capability:text" },
    carrier: { carrierId: "carrier-1" },
    allowProviderCall: true,
  });

  assert.equal(unsafe.ok, false);
  if (unsafe.ok) {
    return;
  }

  assert.equal(unsafe.error.code, "UNSAFE_INVOCATION_DISABLED");
  assert.equal(unsafe.error.boundary, "side-effect");
});
