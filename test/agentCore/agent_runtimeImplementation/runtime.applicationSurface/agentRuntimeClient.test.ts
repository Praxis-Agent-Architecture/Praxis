import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createAgentRuntimeClient } from "../../../../src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeClient.md",
  testFileUrl: import.meta.url,
});

const surface = {
  runtimeId: "spec:agent",
  applicationId: "app.main",
  operation: "invoke" as const,
  status: "ready" as const,
  visibleContext: {
    sourceKind: "spec" as const,
    assembledSurfaces: ["runtime.applicationSurface", "runtime.invocationMethod"],
    mountId: "spec:agent:app.main",
  },
};

test("createAgentRuntimeClient wraps common runtime operations in a dry-run envelope", () => {
  const result = createAgentRuntimeClient({
    surface,
    enabledOperations: ["invoke", "inspect"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.client.runtimeId, "spec:agent");
  assert.deepEqual(result.client.enabledOperations, ["invoke", "inspect"]);
  assert.deepEqual(result.client.call({ operation: "invoke", payload: { input: "hello" } }), {
    ok: true,
    operation: "invoke",
    runtimeId: "spec:agent",
    applicationId: "app.main",
    accepted: true,
    dryRun: true,
  });
});

test("createAgentRuntimeClient rejects missing surfaces and disabled operations", () => {
  assert.deepEqual(createAgentRuntimeClient({}), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_SURFACE",
      message: "runtime client requires an application runtime surface",
      boundary: "input",
    },
    events: ["runtime.client.rejected"],
  });

  const result = createAgentRuntimeClient({
    surface,
    enabledOperations: ["inspect"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.client.call({ operation: "control" }), {
    ok: false,
    error: {
      code: "UNSUPPORTED_OPERATION",
      message: "operation control is not enabled for this runtime client",
      boundary: "input",
    },
  });
});
