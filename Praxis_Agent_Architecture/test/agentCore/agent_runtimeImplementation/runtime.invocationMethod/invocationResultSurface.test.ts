import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createInvocationResultSurface } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationResultSurface.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationResultSurface.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationResultSurface.md",
  testFileUrl: import.meta.url,
});

test("invocationResultSurface exposes stable successful result views without provider raw shape", () => {
  const result = createInvocationResultSurface({
    invocationId: " invoke:001 ",
    method: "model",
    routeId: "route:001",
    output: { text: "hello" },
    events: ["model.invocation.entrypoint.accepted"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.surface, {
    invocationId: "invoke:001",
    method: "model",
    routeId: "route:001",
    status: "completed",
    output: { text: "hello" },
    events: ["model.invocation.entrypoint.accepted", "invocation.result.presented"],
    providerRawShapeExposed: false,
  });
});

test("invocationResultSurface classifies missing input and downstream failure", () => {
  assert.deepEqual(createInvocationResultSurface({ method: "model" }), {
    ok: false,
    error: {
      code: "MISSING_INVOCATION_ID",
      message: "invocationId is required before exposing invocation results",
      boundary: "input",
    },
    events: ["invocation.result.surface.rejected"],
  });

  const failed = createInvocationResultSurface({
    invocationId: "invoke:bad",
    method: "tool",
    error: {
      code: "TOOL_RUNTIME_FAILED",
      message: "tool runtime failed behind guarded surface",
    },
  });

  assert.equal(failed.ok, true);
  if (!failed.ok) {
    return;
  }

  assert.equal(failed.surface.status, "failed");
  assert.deepEqual(failed.surface.error, {
    code: "TOOL_RUNTIME_FAILED",
    message: "tool runtime failed behind guarded surface",
    boundary: "downstream",
  });
  assert.equal(failed.surface.providerRawShapeExposed, false);
});
