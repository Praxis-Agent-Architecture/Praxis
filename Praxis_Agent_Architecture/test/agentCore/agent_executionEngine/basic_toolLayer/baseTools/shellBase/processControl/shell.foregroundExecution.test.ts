import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  planShellForegroundExecution,
  shellForegroundExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.foregroundExecution.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.foregroundExecution.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.foregroundExecution.md",
  testFileUrl: import.meta.url,
});

test("planShellForegroundExecution creates a blocking dry-run execution envelope", () => {
  const result = planShellForegroundExecution({
    target: {
      command: "npm test",
      workingDirectory: "/repo/app",
      shell: "bash",
      timeoutMs: 45_000,
      stdin: "confirm\n",
    },
    context: {
      invocationId: "foreground-1",
      allowedWorkingDirectories: ["/repo"],
      grantedPermissions: ["shell:execute"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellForegroundExecutionDescriptor.defaultDryRun, true);
  assert.deepEqual(result.output.commandPreview, ["bash", "-lc", "npm test"]);
  assert.equal(result.output.target.stdinBytes, 8);
  assert.equal(result.output.foregroundContract.blocksCallerUntilExit, true);
  assert.equal(result.output.foregroundContract.exitStatusWillBeCaptured, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.foregroundExecution.dryRun"]);
});

test("planShellForegroundExecution rejects missing input, invalid timeout, and denied scope", () => {
  const missing = planShellForegroundExecution();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_COMMAND");
  assert.equal(missing.error.boundary, "input");

  const timeout = planShellForegroundExecution({
    target: { command: "pwd", timeoutMs: 0 },
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.error.code, "INVALID_TIMEOUT");
  assert.equal(timeout.error.boundary, "resource");

  const scoped = planShellForegroundExecution({
    target: { command: "pwd", workingDirectory: "/outside" },
    context: { allowedWorkingDirectories: ["/repo"] },
  });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.equal(scoped.error.boundary, "scope");
});

test("planShellForegroundExecution treats an explicit root scope as allowing child directories", () => {
  const result = planShellForegroundExecution({
    target: { command: "pwd", workingDirectory: "/tmp/app" },
    context: { allowedWorkingDirectories: ["/"], grantedPermissions: ["shell:execute"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.target.workingDirectory, "/tmp/app");
});

test("planShellForegroundExecution rejects missing permission and real execution", () => {
  const denied = planShellForegroundExecution({
    target: { command: "pwd" },
    context: { grantedPermissions: [] },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(denied.error.boundary, "permission");

  const real = planShellForegroundExecution({
    target: { command: "pwd" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
