import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planShellCommandExecution,
  shellCommandExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.commandExecution.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.commandExecution.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.commandExecution.md",
  testFileUrl: import.meta.url,
});

test("planShellCommandExecution creates a guarded dry-run command plan", () => {
  const result = planShellCommandExecution({
    context: {
      runtimeId: "runtime-1",
      invocationId: "command-1",
      requestedScopes: ["tool.shell.execute"],
      allowedScopes: ["tool.shell.execute"],
    },
    command: "echo",
    args: ["hello"],
    cwd: "/workspace",
    shellType: "bash",
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(shellCommandExecutionDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "shell.commandExecution");
  assert.equal(result.plan.command, "echo");
  assert.deepEqual(result.plan.args, ["hello"]);
  assert.equal(result.plan.cwd, "/workspace");
  assert.equal(result.plan.shellType, "bash");
  assert.equal(result.plan.timeoutMs, 1000);
  assert.equal(result.plan.outputEnvelope.started, false);
  assert.equal(result.plan.wouldSpawnProcess, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool.shell.execute"]);
});

test("planShellCommandExecution classifies missing input, scope denial, and real execution attempts", () => {
  const missingRuntime = planShellCommandExecution();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingCommand = planShellCommandExecution({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingCommand.ok, false);
  if (!missingCommand.ok) {
    assert.equal(missingCommand.error.code, "MISSING_COMMAND");
    assert.equal(missingCommand.error.boundary, "input");
  }

  const denied = planShellCommandExecution({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool.shell.execute", "host.fs.write"],
      allowedScopes: ["tool.shell.execute"],
    },
    command: "pwd",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const real = planShellCommandExecution({
    context: { runtimeId: "runtime-1", dryRun: false },
    command: "pwd",
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_COMMAND_EXECUTION_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planShellCommandExecution rejects invalid resource limits and unsafe strings", () => {
  const invalidCommand = planShellCommandExecution({
    context: { runtimeId: "runtime-1" },
    command: "echo\npwd",
  });
  assert.equal(invalidCommand.ok, false);
  if (!invalidCommand.ok) {
    assert.equal(invalidCommand.error.code, "INVALID_COMMAND");
    assert.equal(invalidCommand.error.boundary, "input");
  }

  const invalidTimeout = planShellCommandExecution({
    context: { runtimeId: "runtime-1" },
    command: "pwd",
    timeoutMs: 0,
  });
  assert.equal(invalidTimeout.ok, false);
  if (!invalidTimeout.ok) {
    assert.equal(invalidTimeout.error.code, "INVALID_TIMEOUT");
    assert.equal(invalidTimeout.error.boundary, "resource");
  }
});
