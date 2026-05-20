import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { openModelInvocationEntrypoint } from "../../../../src/agentCore_runtimeImplementation/runtime.invocationMethod/modelInvocationEntrypoint.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.invocationMethod/modelInvocationEntrypoint.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/modelInvocationEntrypoint.md",
  testFileUrl: import.meta.url,
});

test("modelInvocationEntrypoint opens a guarded dry-run model route", () => {
  const result = openModelInvocationEntrypoint({
    runtimeId: "runtime:alpha",
    invocationId: "invoke:model:alpha",
    modelCapabilityId: "gpt-5.4",
    input: { kind: "prompt-pack-ref", value: "prompt-pack:alpha" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.envelope, {
    runtimeId: "runtime:alpha",
    invocationId: "invoke:model:alpha",
    modelCapabilityId: "gpt-5.4",
    inputKind: "prompt-pack-ref",
    routeId: "invoke:model:alpha:model:runtime.modelAdapter.promptLoweringRuntime",
    targetSurfaceId: "runtime.modelAdapter.promptLoweringRuntime",
    dryRun: true,
    providerCallPlanned: false,
    governanceChecked: true,
    contractChecked: true,
  });
});

test("modelInvocationEntrypoint rejects missing inputs and governance-blocked routes", () => {
  assert.deepEqual(
    openModelInvocationEntrypoint({
      runtimeId: "runtime:alpha",
      modelCapabilityId: "gpt-5.4",
    }),
    {
      ok: false,
      error: {
        code: "MISSING_INPUT",
        message: "model invocation requires a prompt-pack reference or model input",
        boundary: "input",
      },
      events: ["model.invocation.entrypoint.rejected"],
    },
  );

  assert.deepEqual(
    openModelInvocationEntrypoint({
      runtimeId: "runtime:alpha",
      modelCapabilityId: "gpt-5.4",
      input: { kind: "message", value: "hello" },
      governance: { accepted: false, reason: "model invocation blocked by runtime governance" },
    }),
    {
      ok: false,
      error: {
        code: "ROUTE_REJECTED",
        message: "model invocation blocked by runtime governance",
        boundary: "governance",
      },
      events: ["model.invocation.entrypoint.rejected"],
    },
  );
});
