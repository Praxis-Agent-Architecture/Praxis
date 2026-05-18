import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { guardRuntimeScope } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.governancePlane/runtimeScopeGuard.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.governancePlane/runtimeScopeGuard.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/runtimeScopeGuard.md",
  testFileUrl: import.meta.url,
});

test("guardRuntimeScope allows only the requested runtime operation boundary", () => {
  const result = guardRuntimeScope({
    runtimeId: "runtime-alpha",
    caller: { kind: "application", id: "app" },
    operation: "invoke-tool",
    action: "shellBase.run",
    requestedScopes: ["runtime.read"],
    grantedScopes: ["tool.invoke", "runtime.read"],
    allowedOperations: ["read-state", "invoke-tool"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision.operation, "invoke-tool");
  assert.deepEqual(result.decision.requiredScopes, ["tool.invoke"]);
  assert.deepEqual(result.decision.requestedScopes, ["tool.invoke", "runtime.read"]);
  assert.equal(result.decision.canInvokeTool, true);
  assert.equal(result.decision.canInvokeModel, false);
  assert.equal(result.decision.canMutateState, false);
  assert.equal(result.decision.readonly, false);
  assert.equal(result.decision.unsafeSideEffects, false);
});

test("guardRuntimeScope rejects operation and permission boundary violations", () => {
  const notAllowed = guardRuntimeScope({
    runtimeId: "runtime-alpha",
    caller: { kind: "application", id: "app" },
    operation: "control-runtime",
    grantedScopes: ["runtime.control"],
    allowedOperations: ["read-state"],
  });

  assert.equal(notAllowed.ok, false);
  if (notAllowed.ok) {
    return;
  }

  assert.equal(notAllowed.error.code, "OPERATION_NOT_ALLOWED");
  assert.equal(notAllowed.error.boundary, "scope");

  const denied = guardRuntimeScope({
    runtimeId: "runtime-alpha",
    caller: { kind: "application", id: "app" },
    operation: "invoke-model",
    grantedScopes: ["runtime.read"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.publicSafe, true);
});
