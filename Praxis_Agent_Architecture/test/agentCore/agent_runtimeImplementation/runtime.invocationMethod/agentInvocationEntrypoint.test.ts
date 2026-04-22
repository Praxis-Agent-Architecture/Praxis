import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createAgentInvocationEntrypoint } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/agentInvocationEntrypoint.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/agentInvocationEntrypoint.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/agentInvocationEntrypoint.md",
  testFileUrl: import.meta.url,
});

test("createAgentInvocationEntrypoint plans an agent dry-run invocation without touching execution internals", () => {
  const result = createAgentInvocationEntrypoint({
    runtimeId: "runtime-1",
    agentId: "agent-1",
    source: "application",
    input: { prompt: "hello" },
    requestedScopes: ["invoke"],
    allowedScopes: ["invoke"],
    trace: { correlationId: "corr-agent" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.invocationType, "agent");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.agentId, "agent-1");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.touchesExecutionEngine, false);
  assert.equal(result.plan.envelope.invocationKind, "agent");
  assert.equal(result.plan.envelope.unsafeSideEffects, false);
});

test("createAgentInvocationEntrypoint preserves envelope error boundaries", () => {
  const result = createAgentInvocationEntrypoint({
    runtimeId: "runtime-1",
    agentId: "",
    source: "official-module",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_TARGET_ID");
  assert.equal(result.error.boundary, "input");
});
