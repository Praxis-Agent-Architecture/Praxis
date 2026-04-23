import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planShellResourceManagement } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellResourceManagement.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellResourceManagement.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellResourceManagement.md",
  testFileUrl: import.meta.url,
});

test("planShellResourceManagement creates a guarded dry-run resource plan", () => {
  const result = planShellResourceManagement({
    target: {
      action: "reserve",
      resourceKind: "pty",
      resourceId: "pty:main",
      amount: 2,
    },
    context: {
      invocationId: "resource-1",
      allowedResourceIds: ["pty:main"],
      grantedPermissions: ["shell:resource:reserve"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected shell resource dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.shell.shellResourceManagement");
  assert.equal(result.output.resourceEnvelope.allocationDelta, 2);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "resource-1");
});

test("planShellResourceManagement rejects invalid inputs, scope escapes, and real execution", () => {
  const missingKind = planShellResourceManagement();

  assert.equal(missingKind.ok, false);
  if (!missingKind.ok) {
    assert.equal(missingKind.error.code, "MISSING_RESOURCE_KIND");
  }

  const scoped = planShellResourceManagement({
    target: { action: "release", resourceKind: "process-slot", resourceId: "process:outside" },
    context: { allowedResourceIds: ["process:inside"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "RESOURCE_SCOPE_DENIED");
  }

  const permission = planShellResourceManagement({
    target: { action: "adjust-limit", resourceKind: "io-buffer", limitName: "maxBytes", limitValue: 4096 },
    context: { grantedPermissions: ["shell:resource:inspect"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planShellResourceManagement({
    target: { action: "reserve", resourceKind: "pty", resourceId: "pty:main" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
