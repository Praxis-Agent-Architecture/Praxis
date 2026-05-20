import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateInterfaceRuleRuntime,
  interfaceRuleRuntimeDescriptor,
} from "../../../../src/runtimeImplementation/runtime.interfaceAdapter/interfaceRuleRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.interfaceAdapter/interfaceRuleRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/interfaceRuleRuntime.md",
  testFileUrl: import.meta.url,
});

test("interfaceRuleRuntime evaluates runtime mediated interface rules without side effects", () => {
  const result = evaluateInterfaceRuleRuntime({
    runtimeId: " runtime-1 ",
    caller: { kind: "official-module", id: " cmp-main ", moduleId: " cmp-main " },
    interfaceId: " cmp-interface ",
    phase: " invocation ",
    operation: " read-context ",
    requestedScopes: [" interface.read ", "interface.inspect"],
    allowedScopes: ["interface.read", "interface.inspect", "interface.bind"],
    rules: [
      {
        ruleId: " rule-cmp-read ",
        interfaceId: " cmp-interface ",
        allowedOperations: ["read-context", "inspect-context"],
        allowedScopes: ["interface.read", "interface.inspect"],
      },
      {
        ruleId: " rule-runtime-governed ",
        deniedOperations: ["mutate-runtime-state"],
      },
    ],
    traceId: " trace-1 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision.runtimeId, "runtime-1");
  assert.equal(result.decision.interfaceId, "cmp-interface");
  assert.equal(result.decision.route, "runtime.interfaceAdapter.interfaceRuleRuntime");
  assert.equal(result.decision.phase, "invocation");
  assert.equal(result.decision.operation, "read-context");
  assert.deepEqual(result.decision.appliedRuleIds, ["rule-cmp-read", "rule-runtime-governed"]);
  assert.deepEqual(result.decision.acceptedScopes, ["interface.read", "interface.inspect"]);
  assert.equal(result.decision.dispatch, "dry-run");
  assert.equal(result.decision.unsafeSideEffects, false);
  assert.equal(interfaceRuleRuntimeDescriptor.unsafeSideEffects, false);
});

test("interfaceRuleRuntime rejects empty input, governance failures, and denied operations", () => {
  assert.deepEqual(evaluateInterfaceRuleRuntime(), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "interfaceRuleRuntime requires a runtimeId",
      boundary: "input",
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["runtime.interfaceAdapter.interfaceRuleRuntime.rejected"],
  });

  const rejectedByGovernance = evaluateInterfaceRuleRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    interfaceId: "custom-interface",
    rules: [{ ruleId: "rule-1" }],
    governance: { accepted: false, reason: "interface rule is outside runtime governance" },
  });

  assert.equal(rejectedByGovernance.ok, false);
  if (rejectedByGovernance.ok) {
    return;
  }

  assert.equal(rejectedByGovernance.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejectedByGovernance.error.boundary, "governance");
  assert.equal(rejectedByGovernance.error.message, "interface rule is outside runtime governance");

  const deniedOperation = evaluateInterfaceRuleRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap-main" },
    interfaceId: "tap-interface",
    operation: "direct-tool-write",
    rules: [{ ruleId: "rule-readonly", deniedOperations: ["direct-tool-write"] }],
  });

  assert.equal(deniedOperation.ok, false);
  if (deniedOperation.ok) {
    return;
  }

  assert.equal(deniedOperation.error.code, "OPERATION_DENIED");
  assert.equal(deniedOperation.error.boundary, "governance");
});
