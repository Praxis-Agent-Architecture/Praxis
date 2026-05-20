import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createAgentCoreReuseInvocation } from "../../../../src/agentCore_executionEngine/coreLogic/reuseInvoker.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/coreLogic/reuseInvoker.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/reuseInvoker.md",
  testFileUrl: import.meta.url,
});

test("createAgentCoreReuseInvocation plans reuse of an existing agentCore object", () => {
  const result = createAgentCoreReuseInvocation({
    reuseId: " core-1 ",
    targetKind: "agent-core-instance",
    caller: "tap",
    requestedCapabilities: [" invoke ", "event", "invoke"],
    allowedCapabilities: ["invoke", "event"],
    invocationPayload: { input: "hello" },
    trace: { correlationId: "corr-1", sessionId: "session-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.reuseId, "core-1");
  assert.equal(result.plan.targetKind, "agent-core-instance");
  assert.equal(result.plan.caller, "tap");
  assert.deepEqual(result.plan.grantedCapabilities, ["invoke", "event"]);
  assert.equal(result.plan.reuseMode, "existing-object");
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("createAgentCoreReuseInvocation returns classified input, scope, and contract failures", () => {
  const missingId = createAgentCoreReuseInvocation({
    targetKind: "runtime-object",
    caller: "application",
  });
  assert.equal(missingId.ok, false);
  assert.equal(missingId.error.code, "MISSING_REUSE_ID");
  assert.equal(missingId.error.boundary, "input");

  const deniedScope = createAgentCoreReuseInvocation({
    reuseId: "core-1",
    targetKind: "capability-set",
    caller: "cmp",
    requestedCapabilities: ["invoke", "internal-state"],
    allowedCapabilities: ["invoke"],
  });
  assert.equal(deniedScope.ok, false);
  assert.equal(deniedScope.error.code, "CAPABILITY_SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");

  const rejected = createAgentCoreReuseInvocation({
    reuseId: "core-1",
    targetKind: "runtime-object",
    caller: "runtime",
    contract: { accepted: false, reason: "not in runtime contract" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "CONTRACT_REJECTED");
  assert.equal(rejected.error.boundary, "contract");
});
