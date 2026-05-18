import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createToolInvocationEntrypoint } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/toolInvocationEntrypoint.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/toolInvocationEntrypoint.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/toolInvocationEntrypoint.md",
  testFileUrl: import.meta.url,
});

test("createToolInvocationEntrypoint plans a guarded dry-run tool invocation", () => {
  const result = createToolInvocationEntrypoint({
    runtimeId: "runtime-1",
    toolId: "shellBase.run",
    source: "official-module",
    operation: " execute ",
    input: { command: "npm test" },
    requestedScopes: ["tool.invoke"],
    allowedScopes: ["tool.invoke"],
    trace: { correlationId: "corr-tool" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.invocationType, "tool");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.toolId, "shellBase.run");
  assert.equal(result.plan.operation, "execute");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.touchesToolLayer, false);
  assert.equal(result.plan.toolExecutionPlanned, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.envelope.invocationKind, "tool");
});

test("createToolInvocationEntrypoint preserves envelope input and governance failures", () => {
  const missingTool = createToolInvocationEntrypoint({
    runtimeId: "runtime-1",
    toolId: "",
    source: "application",
  });

  assert.equal(missingTool.ok, false);
  assert.equal(missingTool.error.code, "MISSING_TARGET_ID");
  assert.equal(missingTool.error.boundary, "input");

  const rejected = createToolInvocationEntrypoint({
    runtimeId: "runtime-1",
    toolId: "codeBase.edit",
    source: "application",
    governance: { accepted: false, reason: "tool invocation blocked by runtime governance" },
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
