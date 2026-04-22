import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  shellCommandValidationDescriptor,
  validateShellCommandSafety,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.commandValidation.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.commandValidation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionGuard/shell.commandValidation.md",
  testFileUrl: import.meta.url,
});

test("validateShellCommandSafety allows a simple audited dry-run command", () => {
  const result = validateShellCommandSafety({
    command: "pwd",
    workingDirectory: "/repo",
    shell: "bash",
    policy: { allowedCommands: ["pwd"] },
    context: { invocationId: "shell-validate-1", grantedPermissions: ["shell:validate"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellCommandValidationDescriptor.defaultDryRun, true);
  assert.equal(result.output.verdict, "allowed");
  assert.equal(result.output.requiresTapApproval, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.commandValidation.allowed"]);
});

test("validateShellCommandSafety distinguishes blocked and approval-required commands", () => {
  const blocked = validateShellCommandSafety({
    command: "rm -rf /",
    context: { grantedPermissions: ["shell:validate"] },
  });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.output.verdict, "blocked");
  assert.equal(blocked.output.requiresTapApproval, true);
  assert.match(blocked.output.reasons.join("\n"), /blocked|denied/);

  const approval = validateShellCommandSafety({
    command: "echo a && echo b",
    context: { grantedPermissions: ["shell:validate"] },
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.output.verdict, "requires-approval");
  assert.equal(approval.output.requiresTapApproval, true);
});

test("validateShellCommandSafety rejects empty command, missing permission, and real execution", () => {
  const empty = validateShellCommandSafety();
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, "MISSING_COMMAND");
  assert.equal(empty.error.boundary, "input");

  const permission = validateShellCommandSafety({
    command: "pwd",
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");
  assert.equal(permission.error.boundary, "permission");

  const real = validateShellCommandSafety({
    command: "pwd",
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
