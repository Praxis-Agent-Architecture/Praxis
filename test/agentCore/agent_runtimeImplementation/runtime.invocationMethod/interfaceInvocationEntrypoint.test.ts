import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createInterfaceInvocationEntrypoint } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/interfaceInvocationEntrypoint.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.invocationMethod/interfaceInvocationEntrypoint.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/interfaceInvocationEntrypoint.md",
  testFileUrl: import.meta.url,
});

test("createInterfaceInvocationEntrypoint plans interface calls without entering adapter internals", () => {
  const result = createInterfaceInvocationEntrypoint({
    runtimeId: "runtime-1",
    interfaceId: "tap-interface",
    source: "official-module",
    operation: " invokeTool ",
    input: { tool: "read" },
    requestedScopes: ["interface.invoke"],
    allowedScopes: ["interface.invoke"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.invocationType, "interface");
  assert.equal(result.plan.interfaceId, "tap-interface");
  assert.equal(result.plan.operation, "invokeTool");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.touchesInterfaceAdapter, false);
  assert.equal(result.plan.envelope.invocationKind, "interface");
});

test("createInterfaceInvocationEntrypoint reports governance rejection as a stable error", () => {
  const result = createInterfaceInvocationEntrypoint({
    runtimeId: "runtime-1",
    interfaceId: "tap-interface",
    source: "official-module",
    governance: { accepted: false, reason: "module scope denied" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
});
