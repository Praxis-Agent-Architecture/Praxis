import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  controlShellExecutionPermission,
  shellPermissionControlDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.permissionControl.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.permissionControl.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.permissionControl.md",
  testFileUrl: import.meta.url,
});

test("controlShellExecutionPermission grants an audited dry-run permission decision", () => {
  const result = controlShellExecutionPermission({
    command: "npm test",
    workingDirectory: "/repo/app",
    requestedPermissions: ["shell:validate", "shell:execute"],
    riskLevel: "medium",
    context: {
      invocationId: "shell-permission-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:validate", "shell:execute"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellPermissionControlDescriptor.defaultDryRun, true);
  assert.equal(result.output.decision, "granted");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.missingPermissions, []);
  assert.deepEqual(result.events, ["basicTool.shell.permissionControl.granted"]);
});

test("controlShellExecutionPermission rejects missing inputs, scope, and missing permissions", () => {
  const missing = controlShellExecutionPermission();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");

  const noPermissions = controlShellExecutionPermission({ command: "pwd" });
  assert.equal(noPermissions.ok, false);
  assert.equal(noPermissions.error.code, "MISSING_REQUESTED_PERMISSIONS");

  const scope = controlShellExecutionPermission({
    command: "pwd",
    workingDirectory: "/outside",
    requestedPermissions: ["shell:validate"],
    context: { allowedWorkingDirectories: ["/repo"], grantedPermissions: ["shell:validate"] },
  });
  assert.equal(scope.ok, false);
  assert.equal(scope.error.code, "SCOPE_REJECTED");
  assert.equal(scope.error.boundary, "scope");

  const denied = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: ["shell:execute"],
    context: { grantedPermissions: ["shell:validate"] },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");
});

test("controlShellExecutionPermission requires approval for high risk and blocks real execution", () => {
  const approval = controlShellExecutionPermission({
    command: "sudo systemctl restart app",
    requestedPermissions: ["shell:execute"],
    riskLevel: "high",
    context: { grantedPermissions: ["shell:execute"] },
  });
  assert.equal(approval.ok, false);
  assert.equal(approval.error.code, "APPROVAL_REQUIRED");
  assert.equal(approval.error.boundary, "approval");

  const approved = controlShellExecutionPermission({
    command: "sudo systemctl restart app",
    requestedPermissions: ["shell:execute"],
    riskLevel: "high",
    context: {
      grantedPermissions: ["shell:execute"],
      approval: { accepted: true, approvalId: "tap-approval-1" },
    },
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.output.approvalId, "tap-approval-1");

  const real = controlShellExecutionPermission({
    command: "pwd",
    requestedPermissions: ["shell:validate"],
    context: { dryRun: false, grantedPermissions: ["shell:validate"] },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
