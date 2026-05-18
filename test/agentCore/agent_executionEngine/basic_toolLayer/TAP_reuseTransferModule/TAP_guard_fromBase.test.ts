import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { guardTAPReuseTransferFromBase } from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_guard_fromBase.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_guard_fromBase.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/TAP_reuseTransferModule/TAP_guard_fromBase.md",
  testFileUrl: import.meta.url,
});

test("guardTAPReuseTransferFromBase allows a scoped dry-run base capability handoff", () => {
  const result = guardTAPReuseTransferFromBase({
    transferId: " transfer-1 ",
    tapConsumerId: "tap-runtime",
    capability: {
      capabilityId: " shell.exec ",
      baseToolName: " shellBase ",
      requestedScopes: ["tool.shell.invoke", "tool.shell.invoke"],
      requiredPermissions: ["runtime.tool.audit"],
    },
    allowedScopes: ["tool.shell.invoke"],
    grantedPermissions: ["runtime.tool.audit"],
    trace: { correlationId: "corr-guard" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision, "allowed");
  assert.equal(result.allowed, true);
  assert.equal(result.audit.transferId, "transfer-1");
  assert.equal(result.audit.capabilityId, "shell.exec");
  assert.deepEqual(result.audit.grantedScopes, ["tool.shell.invoke"]);
  assert.equal(result.audit.dryRun, true);
  assert.equal(result.audit.unsafeSideEffects, false);
});

test("guardTAPReuseTransferFromBase returns pending approval without allowing transfer", () => {
  const result = guardTAPReuseTransferFromBase({
    transferId: "transfer-approval",
    capability: {
      capabilityId: "git.commit",
      baseToolName: "gitBase",
    },
    approval: { required: true, reason: "human approval required" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.decision, "pending-approval");
  assert.equal(result.allowed, false);
});

test("guardTAPReuseTransferFromBase classifies missing input, scope denial, and real transfer attempts", () => {
  const missing = guardTAPReuseTransferFromBase();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.error.code, "MISSING_TRANSFER_ID");
  assert.equal(missing.error.boundary, "input");

  const deniedScope = guardTAPReuseTransferFromBase({
    transferId: "transfer-scope",
    capability: {
      capabilityId: "shell.exec",
      baseToolName: "shellBase",
      requestedScopes: ["tool.shell.invoke", "host.fs.write"],
    },
    allowedScopes: ["tool.shell.invoke"],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    return;
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");

  const realTransfer = guardTAPReuseTransferFromBase({
    transferId: "transfer-real",
    capability: {
      capabilityId: "shell.exec",
      baseToolName: "shellBase",
    },
    dryRun: false,
  });
  assert.equal(realTransfer.ok, false);
  if (realTransfer.ok) {
    return;
  }
  assert.equal(realTransfer.error.code, "REAL_TRANSFER_BLOCKED");
  assert.equal(realTransfer.error.boundary, "contract");
});
