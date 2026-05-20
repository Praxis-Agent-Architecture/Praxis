import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createInvocationMethodRegistry } from "../../../../src/runtimeImplementation/runtime.invocationMethod/invocationMethodRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.invocationMethod/invocationMethodRegistry.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationMethodRegistry.md",
  testFileUrl: import.meta.url,
});

test("invocationMethodRegistry registers and resolves enabled invocation methods", () => {
  const result = createInvocationMethodRegistry({
    methods: [
      {
        method: "model",
        surfaceId: " runtime.modelAdapter.promptLoweringRuntime ",
        capability: "model.invoke",
      },
      {
        method: "tool",
        surfaceId: "runtime.execEngine.baseTools",
        enabled: false,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.registry.has("model"), true);
  assert.deepEqual(result.registry.resolve("model"), {
    ok: true,
    method: {
      method: "model",
      surfaceId: "runtime.modelAdapter.promptLoweringRuntime",
      capability: "model.invoke",
      enabled: true,
      metadata: {},
    },
    events: ["invocation.method.resolved"],
  });

  const disabled = result.registry.resolve("tool");
  assert.equal(disabled.ok, false);
  if (disabled.ok) {
    return;
  }

  assert.equal(disabled.error.code, "METHOD_DISABLED");
  assert.equal(disabled.error.boundary, "registry");
});

test("invocationMethodRegistry rejects duplicate and governance-blocked methods", () => {
  assert.deepEqual(
    createInvocationMethodRegistry({
      methods: [
        { method: "model", surfaceId: "runtime.modelAdapter" },
        { method: "model", surfaceId: "runtime.modelAdapter.secondary" },
      ],
    }),
    {
      ok: false,
      error: {
        code: "DUPLICATE_METHOD",
        message: "invocation method model is registered more than once",
        boundary: "registry",
      },
      events: ["invocation.method.registry.rejected"],
    },
  );

  assert.deepEqual(
    createInvocationMethodRegistry({
      methods: [
        {
          method: "batch",
          surfaceId: "runtime.invocationMethod.batch",
          governance: { accepted: false, reason: "batch disabled for this runtime" },
        },
      ],
    }),
    {
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: "batch disabled for this runtime",
        boundary: "governance",
      },
      events: ["invocation.method.registry.rejected"],
    },
  );
});
