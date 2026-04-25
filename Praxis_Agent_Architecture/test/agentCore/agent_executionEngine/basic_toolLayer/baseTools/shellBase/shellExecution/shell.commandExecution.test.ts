import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeShellCommand,
  planShellCommandExecution,
  selectShellCommandExecutionPractice,
  shellCommandExecutionHandler,
  shellCommandExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.commandExecution.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

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

test("executeShellCommand returns dry-run output without calling the provider", async () => {
  let providerCalled = false;

  const result = await executeShellCommand({
    context: { runtimeId: "runtime-1", invocationId: "command-dry-run" },
    command: "echo",
    args: ["hello"],
    provider: () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "hello\n", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.shell.commandExecution");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.stdout, "");
  assert.equal(result.audit[0]?.invocationId, "command-dry-run");
});

test("executeShellCommand calls an injected provider when runtime disables dry-run", async () => {
  const result = await executeShellCommand({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    command: "printf",
    args: ["ok"],
    cwd: "/workspace",
    provider: (request) => {
      assert.equal(request.command, "printf");
      assert.deepEqual(request.args, ["ok"]);
      assert.equal(request.cwd, "/workspace");
      return { exitCode: 0, stdout: "ok", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.stdout, "ok");
});

test("executeShellCommand requires a runtime provider for real execution", async () => {
  const result = await executeShellCommand({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    command: "pwd",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.boundary, "provider");
    assert.equal(result.error.safeForRuntimeInspection, true);
  }
});

test("executeShellCommand honors runtime governance before provider dispatch", async () => {
  let providerCalled = false;

  const result = await executeShellCommand({
    context: {
      runtimeId: "runtime-1",
      dryRun: false,
      guard: { allowed: false, reason: "runtime denied shell execution" },
    },
    command: "pwd",
    provider: () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "GOVERNANCE_REJECTED");
    assert.equal(result.error.boundary, "governance");
  }
});

test("executeShellCommand maps provider failures to public-safe shell errors", async () => {
  const result = await executeShellCommand({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    command: "false",
    provider: () => {
      throw new Error("executor failed");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.boundary, "provider");
    assert.equal(result.error.message, "executor failed");
  }
});

test("shellCommandExecutionHandler adapts BaseToolInvokeRequest through executor.shell.run", async () => {
  const result = await shellCommandExecutionHandler.invoke({
    toolCallId: "call-shell-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      command: "echo",
      args: ["handler"],
      timeoutMs: 1000,
    },
    executor: {
      shell: {
        run: async (request) => ({
          ok: true,
          output: {
            exitCode: 0,
            stdout: `${request.command} ${request.args?.join(" ")}`,
            stderr: "",
          },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.toolId, "shell.commandExecution");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.stdout, "echo handler");
  assert.equal(result.metadata?.audit !== undefined, true);
});

test("selectShellCommandExecutionPractice mirrors LSP provider selection shape", async () => {
  const selection = selectShellCommandExecutionPractice({
    preferredProvider: "openai",
    provider: async () => ({ exitCode: 0, stdout: "selected", stderr: "" }),
  });

  assert.equal(selection.providerName, "openai");
  assert.equal(selection.practice.providerName, "openai");
  assert.equal(selection.practice.directCliSupport, true);
  assert.equal(typeof selection.practice.createProvider, "function");
  assert.equal(selection.provider !== undefined, true);
});

test("baseTool registry can mount and invoke shell.commandExecution through the unified handler path", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.commandExecution");

  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "registry-shell-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      command: "printf",
      args: ["registry"],
      timeoutMs: 1000,
    },
    executor: {
      shell: {
        run: async (request) => ({
          ok: true,
          output: {
            exitCode: 0,
            stdout: `${request.command}:${request.args?.join(",")}`,
            stderr: "",
          },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const output = result.output as { dryRun: boolean; providerCalled: boolean; stdout: string };
  assert.equal(result.toolId, "shell.commandExecution");
  assert.equal(output.dryRun, false);
  assert.equal(output.providerCalled, true);
  assert.equal(output.stdout, "printf:registry");
});
