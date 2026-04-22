import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { generateShellCommand } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.commandGeneration.js";
import { buildShellExecutionGuard } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.executionGuard.js";
import {
  constructShellInvocation,
  shellInvocationConstructionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.invocationConstruction.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.invocationConstruction.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellGeneration/shell.invocationConstruction.md",
  testFileUrl: import.meta.url,
});

test("constructShellInvocation builds a dry-run invocation envelope from command and guard", () => {
  const command = generateShellCommand({
    argv: ["npm", "test"],
    shell: "zsh",
    workingDirectory: "/repo",
    environmentKeys: ["NODE_ENV"],
  });
  assert.equal(command.ok, true);

  const guard = buildShellExecutionGuard({
    generatedCommand: command.output,
    context: { grantedPermissions: ["shell:generate"] },
  });
  assert.equal(guard.ok, true);

  const result = constructShellInvocation({
    generatedCommand: command.output,
    executionGuard: guard.output,
    invocationId: "shell-invocation-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    metadata: { purpose: "test" },
    context: { grantedPermissions: ["shell:generate"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellInvocationConstructionDescriptor.defaultDryRun, true);
  assert.equal(result.invocation.kind, "agentCore.basicTool.shell.invocation");
  assert.equal(result.invocation.commandLine, "npm test");
  assert.equal(result.invocation.status, "planned");
  assert.equal(result.invocation.dryRun, true);
  assert.equal(result.invocation.executionBlocked, true);
  assert.equal(result.invocation.unsafeSideEffects, false);
});

test("constructShellInvocation preserves pending approval without executing shell", () => {
  const command = generateShellCommand({ argv: ["echo", "a", "&&", "echo", "b"] });
  assert.equal(command.ok, true);

  const guard = buildShellExecutionGuard({ generatedCommand: command.output });
  assert.equal(guard.ok, true);
  assert.equal(guard.output.verdict, "requires-approval");

  const result = constructShellInvocation({
    generatedCommand: command.output,
    executionGuard: guard.output,
  });

  assert.equal(result.ok, true);
  assert.equal(result.invocation.status, "pending-approval");
  assert.equal(result.invocation.approvalRequired, true);
  assert.equal(result.invocation.executionBlocked, true);
});

test("constructShellInvocation rejects missing guard, blocked guard, permission denial, and real execution", () => {
  const command = generateShellCommand({ argv: ["pwd"] });
  assert.equal(command.ok, true);

  const missingGuard = constructShellInvocation({ generatedCommand: command.output });
  assert.equal(missingGuard.ok, false);
  assert.equal(missingGuard.error.code, "MISSING_GUARD");
  assert.equal(missingGuard.error.boundary, "input");

  const blockedGuard = buildShellExecutionGuard({
    generatedCommand: command.output,
    policy: { deniedExecutables: ["pwd"] },
  });
  assert.equal(blockedGuard.ok, true);

  const blocked = constructShellInvocation({
    generatedCommand: command.output,
    executionGuard: blockedGuard.output,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, "GUARD_BLOCKED");
  assert.equal(blocked.error.boundary, "governance");

  const permissionGuard = buildShellExecutionGuard({ generatedCommand: command.output });
  assert.equal(permissionGuard.ok, true);
  const permission = constructShellInvocation({
    generatedCommand: command.output,
    executionGuard: permissionGuard.output,
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");
  assert.equal(permission.error.boundary, "permission");

  const realGuard = buildShellExecutionGuard({ generatedCommand: command.output });
  assert.equal(realGuard.ok, true);
  const real = constructShellInvocation({
    generatedCommand: command.output,
    executionGuard: realGuard.output,
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
