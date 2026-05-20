import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { generateShellCommand } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.js";
import {
  buildShellExecutionGuard,
  shellExecutionGuardDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.executionGuard.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.executionGuard.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.executionGuard.md",
  testFileUrl: import.meta.url,
});

test("buildShellExecutionGuard creates an allowed dry-run guard for generated commands", () => {
  const command = generateShellCommand({
    argv: ["pwd"],
    workingDirectory: "/repo/project",
  });
  assert.equal(command.ok, true);

  const result = buildShellExecutionGuard({
    generatedCommand: command.output,
    policy: { allowedWorkingDirectories: ["/repo"] },
    context: { invocationId: "shell-guard-1", grantedPermissions: ["shell:generate"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellExecutionGuardDescriptor.defaultDryRun, true);
  assert.equal(result.output.verdict, "allowed");
  assert.equal(result.output.requiresTapApproval, false);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
});

test("buildShellExecutionGuard distinguishes approval and blocked guard decisions", () => {
  const approval = buildShellExecutionGuard({
    command: "echo a && echo b",
    argv: ["echo", "a", "&&", "echo", "b"],
    context: { grantedPermissions: ["shell:generate"] },
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.output.verdict, "requires-approval");
  assert.equal(approval.output.requiresTapApproval, true);

  const blocked = buildShellExecutionGuard({
    command: "rm -rf /tmp/example",
    argv: ["rm", "-rf", "/tmp/example"],
    policy: { deniedExecutables: ["rm"] },
    context: { grantedPermissions: ["shell:generate"] },
  });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.output.verdict, "blocked");
  assert.equal(blocked.output.requiresTapApproval, true);
});

test("buildShellExecutionGuard rejects missing command, scope denial, and real execution", () => {
  const missing = buildShellExecutionGuard();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");
  assert.equal(missing.error.boundary, "input");

  const deniedDirectory = buildShellExecutionGuard({
    command: "pwd",
    argv: ["pwd"],
    workingDirectory: "/outside",
    policy: { allowedWorkingDirectories: ["/repo"] },
  });
  assert.equal(deniedDirectory.ok, false);
  assert.equal(deniedDirectory.error.code, "WORKING_DIRECTORY_DENIED");
  assert.equal(deniedDirectory.error.boundary, "scope");

  const real = buildShellExecutionGuard({
    command: "pwd",
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
