import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createInvocationEnvelope } from "../../../../src/runtimeImplementation/runtime.invocationMethod/invocationEnvelope.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.invocationMethod/invocationEnvelope.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.invocationMethod/invocationEnvelope.md",
  testFileUrl: import.meta.url,
});

test("createInvocationEnvelope returns a dry-run envelope with scoped runtime metadata", () => {
  const result = createInvocationEnvelope({
    runtimeId: " runtime-1 ",
    targetId: " agent-1 ",
    invocationKind: "agent",
    source: "application",
    payload: { input: "hello" },
    requestedScopes: [" invoke ", "invoke"],
    allowedScopes: ["invoke"],
    trace: { correlationId: "corr-1", callerId: "app-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.runtimeId, "runtime-1");
  assert.equal(result.envelope.targetId, "agent-1");
  assert.equal(result.envelope.invocationKind, "agent");
  assert.deepEqual(result.envelope.grantedScopes, ["invoke"]);
  assert.equal(result.envelope.dryRun, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.invocation.envelope.accepted"]);
});

test("createInvocationEnvelope returns classified failures for runtime, governance, and scope boundaries", () => {
  const missingRuntime = createInvocationEnvelope({
    runtimeId: "",
    targetId: "agent-1",
    invocationKind: "agent",
    source: "application",
  });
  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const rejected = createInvocationEnvelope({
    runtimeId: "runtime-1",
    targetId: "agent-1",
    invocationKind: "agent",
    source: "official-module",
    governance: { accepted: false, reason: "outside policy" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");

  const deniedScope = createInvocationEnvelope({
    runtimeId: "runtime-1",
    targetId: "agent-1",
    invocationKind: "agent",
    source: "application",
    requestedScopes: ["invoke", "internal-state"],
    allowedScopes: ["invoke"],
  });
  assert.equal(deniedScope.ok, false);
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");
});
