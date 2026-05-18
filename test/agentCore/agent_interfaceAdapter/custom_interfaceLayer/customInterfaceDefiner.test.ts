import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { defineCustomInterface } from "../../../../src/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceDefiner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceDefiner.ts",
  docPath: "docs/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceDefiner.md",
  testFileUrl: import.meta.url,
});

test("defineCustomInterface normalizes a governed dry-run interface definition", () => {
  const result = defineCustomInterface({
    interfaceId: " custom.analytics ",
    entrypoint: "runtime.interfaceAdapter.custom.analytics",
    owner: " analytics-team ",
    requestedScopes: ["interface.invoke", "interface.invoke"],
    allowedScopes: ["interface.invoke", "interface.inspect"],
    capabilities: [
      {
        name: " analytics-query ",
        operations: ["query", "query", "summarize"],
        scopes: ["interface.invoke"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.definition.interfaceId, "custom.analytics");
  assert.equal(result.definition.owner, "analytics-team");
  assert.equal(result.definition.lifecycle, "defined");
  assert.equal(result.definition.dispatch, "dry-run");
  assert.equal(result.definition.runtimeGoverned, true);
  assert.deepEqual(result.definition.capabilities[0], {
    name: "analytics-query",
    operations: ["query", "summarize"],
    scopes: ["interface.invoke"],
  });
  assert.deepEqual(result.definition.scopes, ["interface.invoke"]);
});

test("defineCustomInterface rejects empty input and governance failures with classified errors", () => {
  const missing = defineCustomInterface();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_INTERFACE_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const rejected = defineCustomInterface({
    interfaceId: "custom.analytics",
    entrypoint: "runtime.interfaceAdapter.custom.analytics",
    capabilities: [{ name: "analytics-query" }],
    governance: { accepted: false, reason: "interface onboarding denied" },
  });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(rejected.error.boundary, "governance");
    assert.equal(rejected.error.message, "interface onboarding denied");
  }
});
