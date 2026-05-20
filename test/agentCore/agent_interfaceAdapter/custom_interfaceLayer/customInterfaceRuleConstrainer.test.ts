import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { constrainCustomInterfaceRules } from "../../../../src/interfaceAdapter/custom_interfaceLayer/customInterfaceRuleConstrainer.js";

defineAgentCoreContractTest({
  sourcePath: "src/interfaceAdapter/custom_interfaceLayer/customInterfaceRuleConstrainer.ts",
  docPath: "docs/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceRuleConstrainer.md",
  testFileUrl: import.meta.url,
});

test("constrainCustomInterfaceRules accepts operations inside rule and scope boundaries", () => {
  const result = constrainCustomInterfaceRules({
    interfaceId: " custom.analytics ",
    operation: " query ",
    requestedScopes: ["interface.invoke"],
    allowedScopes: ["interface.invoke"],
    rules: [
      {
        ruleId: "analytics-readonly",
        allowedOperations: ["query", "summarize"],
        allowedScopes: ["interface.invoke"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision.interfaceId, "custom.analytics");
  assert.equal(result.decision.operation, "query");
  assert.equal(result.decision.allowed, true);
  assert.equal(result.decision.dispatch, "dry-run");
  assert.deepEqual(result.decision.appliedRuleIds, ["analytics-readonly"]);
});

test("constrainCustomInterfaceRules rejects missing rules and denied operations", () => {
  const missingRule = constrainCustomInterfaceRules({
    interfaceId: "custom.analytics",
    operation: "query",
  });

  assert.equal(missingRule.ok, false);
  if (!missingRule.ok) {
    assert.equal(missingRule.error.code, "MISSING_RULE");
    assert.equal(missingRule.error.boundary, "input");
  }

  const denied = constrainCustomInterfaceRules({
    interfaceId: "custom.analytics",
    operation: "delete",
    rules: [{ ruleId: "analytics-readonly", deniedOperations: ["delete"] }],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "OPERATION_DENIED");
    assert.equal(denied.error.boundary, "governance");
  }
});
