import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { defineCustomInterface } from "../../../../src/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceDefiner.js";
import { createCustomInterfaceManager } from "../../../../src/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceManager.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceManager.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceManager.md",
  testFileUrl: import.meta.url,
});

const managerDefinition = defineCustomInterface({
  interfaceId: "custom.analytics",
  entrypoint: "runtime.interfaceAdapter.custom.analytics",
  capabilities: [{ name: "analytics-query", operations: ["query"] }],
});

test("createCustomInterfaceManager registers and resolves custom interfaces without side effects", () => {
  assert.equal(managerDefinition.ok, true);
  if (!managerDefinition.ok) {
    return;
  }

  const result = createCustomInterfaceManager({
    interfaces: [{ definition: managerDefinition.definition }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.manager.has(" custom.analytics "), true);
  assert.equal(result.manager.list().length, 1);
  assert.equal(Object.isFrozen(result.manager.interfaces), true);
  assert.equal(result.manager.interfaces, result.manager.list());

  const resolved = result.manager.resolve("custom.analytics");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) {
    return;
  }

  assert.equal(resolved.interface.status, "registered");
  assert.equal(resolved.interface.dispatch, "dry-run");
});

test("createCustomInterfaceManager rejects duplicates and disabled interface resolution", () => {
  assert.equal(managerDefinition.ok, true);
  if (!managerDefinition.ok) {
    return;
  }

  const duplicate = createCustomInterfaceManager({
    interfaces: [
      { definition: managerDefinition.definition },
      { definition: managerDefinition.definition },
    ],
  });

  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error.code, "DUPLICATE_INTERFACE");
    assert.equal(duplicate.error.boundary, "input");
  }

  const disabled = createCustomInterfaceManager({
    interfaces: [{ definition: managerDefinition.definition, status: "disabled" }],
  });

  assert.equal(disabled.ok, true);
  if (!disabled.ok) {
    return;
  }

  const resolved = disabled.manager.resolve("custom.analytics");
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.equal(resolved.error.code, "INTERFACE_DISABLED");
    assert.equal(resolved.error.boundary, "governance");
  }
});
