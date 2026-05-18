import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { guardTAPReuseTransferFromBase } from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_guard_fromBase.js";
import { createTAPReusableInvocationFromBase } from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_invoker_fromBase.js";
import { migrateBaseToolCapabilityToTAP } from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_migrator_fromBase.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_invoker_fromBase.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_invoker_fromBase.md",
  testFileUrl: import.meta.url,
});

function createMigratedShellCapability() {
  const capability = {
    capabilityId: "shell.exec",
    baseToolName: "shellBase",
    requestedScopes: ["tool.shell.invoke"],
  };
  const guard = guardTAPReuseTransferFromBase({
    transferId: "transfer-invoke",
    capability,
    allowedScopes: ["tool.shell.invoke"],
  });
  const migration = migrateBaseToolCapabilityToTAP({
    transferId: "transfer-invoke",
    capability,
    guard,
  });

  assert.equal(guard.ok, true);
  assert.equal(migration.ok, true);
  if (!migration.ok) {
    throw new Error("expected migrated shell capability");
  }

  return { guard, migratedCapability: migration.migrated };
}

test("createTAPReusableInvocationFromBase creates a mockable dry-run invocation envelope", () => {
  const { guard, migratedCapability } = createMigratedShellCapability();
  const result = createTAPReusableInvocationFromBase({
    invocationId: " invoke-1 ",
    migratedCapability,
    guard,
    input: { command: "npm test" },
    requestedScopes: ["tool.shell.invoke"],
    allowedScopes: ["tool.shell.invoke"],
    trace: { correlationId: "corr-invoke" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.invocation.kind, "tap.reuseTransfer.baseInvocation");
  assert.equal(result.invocation.invocationId, "invoke-1");
  assert.equal(result.invocation.tapCapabilityId, "tap.reuseTransfer.shellBase.shell.exec");
  assert.deepEqual(result.invocation.grantedScopes, ["tool.shell.invoke"]);
  assert.equal(result.invocation.dryRun, true);
  assert.equal(result.invocation.baseToolExecutionPlanned, false);
  assert.equal(result.invocation.unsafeSideEffects, false);
});

test("createTAPReusableInvocationFromBase classifies missing input, scope denial, and real invocation attempts", () => {
  const missing = createTAPReusableInvocationFromBase();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_INVOCATION_ID");
  assert.equal(missing.error.boundary, "input");

  const { migratedCapability } = createMigratedShellCapability();
  const deniedScope = createTAPReusableInvocationFromBase({
    invocationId: "invoke-denied",
    migratedCapability,
    requestedScopes: ["host.fs.write"],
    allowedScopes: ["tool.shell.invoke"],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    return;
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");

  const realInvocation = createTAPReusableInvocationFromBase({
    invocationId: "invoke-real",
    migratedCapability,
    dryRun: false,
  });
  assert.equal(realInvocation.ok, false);
  if (realInvocation.ok) {
    return;
  }
  assert.equal(realInvocation.error.code, "REAL_INVOCATION_BLOCKED");
  assert.equal(realInvocation.error.boundary, "contract");
});
