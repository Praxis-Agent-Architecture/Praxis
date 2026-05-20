import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { defineCustomInterface } from "../../../../src/interfaceAdapter/custom_interfaceLayer/customInterfaceDefiner.js";
import { planCustomInterfaceReuse } from "../../../../src/interfaceAdapter/custom_interfaceLayer/customInterfaceReuser.js";

defineAgentCoreContractTest({
  sourcePath: "src/interfaceAdapter/custom_interfaceLayer/customInterfaceReuser.ts",
  docPath: "docs/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceReuser.md",
  testFileUrl: import.meta.url,
});

const reusableDefinition = defineCustomInterface({
  interfaceId: "custom.analytics",
  entrypoint: "runtime.interfaceAdapter.custom.analytics",
  requestedScopes: ["interface.invoke"],
  allowedScopes: ["interface.invoke"],
  capabilities: [{ name: "analytics-query", operations: ["query"], scopes: ["interface.invoke"] }],
});

test("planCustomInterfaceReuse creates a dry-run reuse plan from an existing definition", () => {
  assert.equal(reusableDefinition.ok, true);
  if (!reusableDefinition.ok) {
    return;
  }

  const result = planCustomInterfaceReuse({
    interfaceId: " custom.analytics ",
    operation: " query ",
    availableInterfaces: [reusableDefinition.definition],
    requestedScopes: ["interface.invoke"],
    allowedScopes: ["interface.invoke"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.interfaceId, "custom.analytics");
  assert.equal(result.plan.operation, "query");
  assert.equal(result.plan.entrypoint, "runtime.interfaceAdapter.custom.analytics");
  assert.deepEqual(result.plan.capabilityNames, ["analytics-query"]);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.touchesInterfaceImplementation, false);
});

test("planCustomInterfaceReuse rejects missing interfaces and unavailable operations", () => {
  assert.equal(reusableDefinition.ok, true);
  if (!reusableDefinition.ok) {
    return;
  }

  const missing = planCustomInterfaceReuse({
    interfaceId: "custom.missing",
    availableInterfaces: [reusableDefinition.definition],
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "INTERFACE_NOT_AVAILABLE");
    assert.equal(missing.error.boundary, "input");
  }

  const unsupported = planCustomInterfaceReuse({
    interfaceId: "custom.analytics",
    operation: "delete",
    availableInterfaces: [reusableDefinition.definition],
  });

  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.code, "OPERATION_NOT_AVAILABLE");
    assert.equal(unsupported.error.boundary, "contract");
  }
});
