import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { guardTAPReuseTransferFromBase } from "../../../../../src/executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_guard_fromBase.js";
import { createTAPReusableInvocationFromBase } from "../../../../../src/executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_invoker_fromBase.js";
import { migrateBaseToolCapabilityToTAP } from "../../../../../src/executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_migrator_fromBase.js";
import { detectTAPTransferStatus } from "../../../../../src/executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_statusDetector.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_statusDetector.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_statusDetector.md",
  testFileUrl: import.meta.url,
});

test("detectTAPTransferStatus reports ready after guarded migration and invocation envelopes", () => {
  const capability = {
    capabilityId: "search.fetch",
    baseToolName: "searchBase",
    requestedScopes: ["tool.search.fetch"],
    observableState: "available" as const,
  };
  const guard = guardTAPReuseTransferFromBase({
    transferId: "transfer-status",
    capability,
    allowedScopes: ["tool.search.fetch"],
  });
  const migration = migrateBaseToolCapabilityToTAP({
    transferId: "transfer-status",
    capability,
    guard,
  });
  assert.equal(migration.ok, true);
  if (!migration.ok) {
    return;
  }
  const invocation = createTAPReusableInvocationFromBase({
    invocationId: "invoke-status",
    migratedCapability: migration.migrated,
    guard,
    allowedScopes: ["tool.search.fetch"],
  });

  const result = detectTAPTransferStatus({
    transferId: " transfer-status ",
    capability,
    guard,
    migration,
    invocation,
    expectedScopes: ["tool.search.fetch"],
    observedScopes: ["tool.search.fetch"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.transferId, "transfer-status");
  assert.equal(result.report.status, "ready");
  assert.deepEqual(result.report.missingScopes, []);
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.unsafeSideEffects, false);
});

test("detectTAPTransferStatus reports pending, degraded, and missing-input status boundaries", () => {
  const pendingGuard = guardTAPReuseTransferFromBase({
    transferId: "transfer-pending",
    capability: {
      capabilityId: "git.commit",
      baseToolName: "gitBase",
    },
    approval: { required: true },
  });
  const pending = detectTAPTransferStatus({
    transferId: "transfer-pending",
    capability: {
      capabilityId: "git.commit",
      baseToolName: "gitBase",
    },
    guard: pendingGuard,
  });
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }
  assert.equal(pending.report.status, "pending-approval");

  const degraded = detectTAPTransferStatus({
    transferId: "transfer-degraded",
    capability: {
      capabilityId: "search.fetch",
      baseToolName: "searchBase",
      requestedScopes: ["tool.search.fetch", "runtime.audit"],
    },
    expectedScopes: ["tool.search.fetch", "runtime.audit"],
    observedScopes: ["tool.search.fetch"],
  });
  assert.equal(degraded.ok, true);
  if (!degraded.ok) {
    return;
  }
  assert.equal(degraded.report.status, "degraded");
  assert.deepEqual(degraded.report.missingScopes, ["runtime.audit"]);

  const missing = detectTAPTransferStatus();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_TRANSFER_ID");
  assert.equal(missing.error.boundary, "input");
});
