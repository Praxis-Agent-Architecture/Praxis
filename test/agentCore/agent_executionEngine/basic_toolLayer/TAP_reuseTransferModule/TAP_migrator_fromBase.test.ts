import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { guardTAPReuseTransferFromBase } from "../../../../../src/agentCore_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_guard_fromBase.js";
import { migrateBaseToolCapabilityToTAP } from "../../../../../src/agentCore_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_migrator_fromBase.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_migrator_fromBase.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_migrator_fromBase.md",
  testFileUrl: import.meta.url,
});

test("migrateBaseToolCapabilityToTAP creates a reusable dry-run TAP descriptor", () => {
  const capability = {
    capabilityId: "search.fetch",
    baseToolName: "searchBase",
    capabilityName: "Fetch",
    description: "Fetch remote content",
    requestedScopes: ["tool.search.fetch"],
    requiredPermissions: ["runtime.tool.audit"],
    observableState: "available" as const,
  };
  const guard = guardTAPReuseTransferFromBase({
    transferId: "transfer-migrate",
    capability,
    allowedScopes: ["tool.search.fetch"],
    grantedPermissions: ["runtime.tool.audit"],
  });
  assert.equal(guard.ok, true);

  const result = migrateBaseToolCapabilityToTAP({
    transferId: " transfer-migrate ",
    capability,
    tapNamespace: " tap.tools ",
    guard,
    trace: { correlationId: "corr-migrate" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.migrated.transferId, "transfer-migrate");
  assert.equal(result.migrated.tapCapabilityId, "tap.tools.searchBase.search.fetch");
  assert.equal(result.migrated.sourceBaseToolName, "searchBase");
  assert.equal(result.migrated.guardDecision, "allowed");
  assert.equal(result.migrated.invocationEnvelope.dryRun, true);
  assert.equal(result.migrated.invocationEnvelope.baseToolExecutionPlanned, false);
  assert.equal(result.migrated.invocationEnvelope.unsafeSideEffects, false);
});

test("migrateBaseToolCapabilityToTAP classifies invalid input, guard rejection, and real migration attempts", () => {
  const missing = migrateBaseToolCapabilityToTAP();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_TRANSFER_ID");
  assert.equal(missing.error.boundary, "input");

  const pendingGuard = guardTAPReuseTransferFromBase({
    transferId: "transfer-pending",
    capability: {
      capabilityId: "git.commit",
      baseToolName: "gitBase",
    },
    approval: { required: true },
  });
  const blockedByGuard = migrateBaseToolCapabilityToTAP({
    transferId: "transfer-pending",
    capability: {
      capabilityId: "git.commit",
      baseToolName: "gitBase",
    },
    guard: pendingGuard,
  });
  assert.equal(blockedByGuard.ok, false);
  if (blockedByGuard.ok) {
    return;
  }
  assert.equal(blockedByGuard.error.code, "GUARD_NOT_ALLOWED");
  assert.equal(blockedByGuard.error.boundary, "governance");

  const realMigration = migrateBaseToolCapabilityToTAP({
    transferId: "transfer-real",
    capability: {
      capabilityId: "search.fetch",
      baseToolName: "searchBase",
    },
    dryRun: false,
  });
  assert.equal(realMigration.ok, false);
  if (realMigration.ok) {
    return;
  }
  assert.equal(realMigration.error.code, "REAL_MIGRATION_BLOCKED");
  assert.equal(realMigration.error.boundary, "contract");
});
