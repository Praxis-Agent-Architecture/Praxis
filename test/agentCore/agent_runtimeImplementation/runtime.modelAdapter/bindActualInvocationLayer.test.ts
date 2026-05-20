import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bindActualInvocationLayer } from "../../../../src/agentCore_runtimeImplementation/runtime.modelAdapter/bindActualInvocationLayer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.modelAdapter/bindActualInvocationLayer.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/bindActualInvocationLayer.md",
  testFileUrl: import.meta.url,
});

test("bindActualInvocationLayer records provider carriers without invoking providers", () => {
  const result = bindActualInvocationLayer({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    actualInvocationLayer: {
      id: " invocation-layer-1 ",
      carriers: [
        { provider: "openai", carrierId: " carrier-openai ", endpointShape: " responses " },
        { provider: "customFormat", carrierId: " custom-gateway " },
      ],
      metadata: { owner: "runtime.modelAdapter" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.binding.bindingId, "runtime-1:actualInvocationLayer:invocation-layer-1");
  assert.equal(result.binding.route, "runtime.modelAdapter.actualInvocationLayer");
  assert.deepEqual(result.binding.providers, ["openai", "customFormat"]);
  assert.equal(result.binding.carriers[0]?.endpointShape, "responses");
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindActualInvocationLayer rejects missing input and governance failures with stable errors", () => {
  assert.deepEqual(bindActualInvocationLayer(), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "actualInvocationLayer binding requires a runtimeId",
      boundary: "input",
      publicSafe: true,
    },
    events: ["runtime.modelAdapter.actualInvocationLayer.rejected"],
  });

  const rejected = bindActualInvocationLayer({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    actualInvocationLayer: {
      id: "invocation-layer-1",
      carriers: [{ provider: "anthropic", carrierId: "carrier-1" }],
    },
    governance: { accepted: false, reason: "provider carrier outside runtime scope" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.message, "provider carrier outside runtime scope");
});
