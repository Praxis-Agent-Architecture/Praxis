import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createInvocationMethodRegistry } from "../../../../src/runtimeImplementation/runtime.invocationMethod/invocationMethodRegistry.js";
import { routeInvocation } from "../../../../src/runtimeImplementation/runtime.invocationMethod/invocationRouter.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.invocationMethod/invocationRouter.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationRouter.md",
  testFileUrl: import.meta.url,
});

test("invocationRouter creates dry-run routes through registered runtime surfaces", () => {
  const registryResult = createInvocationMethodRegistry({
    methods: [{ method: "model", surfaceId: "runtime.modelAdapter.promptLoweringRuntime" }],
  });

  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    return;
  }

  const result = routeInvocation({
    registry: registryResult.registry,
    envelope: {
      invocationId: "invoke:model:1",
      method: "model",
      target: "gpt-5.4",
      source: "application",
      payload: { promptPackRef: "prompt-pack:1" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.route, {
    routeId: "invoke:model:1:model:runtime.modelAdapter.promptLoweringRuntime",
    invocationId: "invoke:model:1",
    method: "model",
    surfaceId: "runtime.modelAdapter.promptLoweringRuntime",
    target: "gpt-5.4",
    source: "application",
    payload: { promptPackRef: "prompt-pack:1" },
    dryRun: true,
    governanceChecked: true,
    contractChecked: true,
  });
});

test("invocationRouter rejects unsafe or unroutable envelopes before execution", () => {
  const registryResult = createInvocationMethodRegistry({
    methods: [{ method: "tool", surfaceId: "runtime.execEngine.baseTools", enabled: false }],
  });

  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    return;
  }

  assert.deepEqual(routeInvocation({ registry: registryResult.registry }), {
    ok: false,
    error: {
      code: "MISSING_ENVELOPE",
      message: "invocation router requires an invocation envelope",
      boundary: "input",
    },
    events: ["invocation.route.rejected"],
  });

  const disabled = routeInvocation({
    registry: registryResult.registry,
    envelope: { invocationId: "invoke:tool:1", method: "tool", target: "shellBase" },
  });

  assert.equal(disabled.ok, false);
  if (disabled.ok) {
    return;
  }

  assert.equal(disabled.error.code, "METHOD_DISABLED");
  assert.equal(disabled.error.boundary, "registry");

  assert.deepEqual(
    routeInvocation({
      registry: registryResult.registry,
      envelope: { invocationId: "invoke:tool:2", method: "tool", target: "shellBase" },
      governance: { accepted: false, reason: "tool invocation needs TAP approval" },
    }),
    {
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: "tool invocation needs TAP approval",
        boundary: "governance",
      },
      events: ["invocation.route.rejected"],
    },
  );
});
