import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeShellInvocation,
  planShellInvocationExecution,
  selectShellInvocationExecutionPractice,
  shellInvocationExecutionHandler,
  shellInvocationExecutionDescriptor,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.invocationExecution.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.invocationExecution.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.invocationExecution.md",
  testFileUrl: import.meta.url,
});

test("planShellInvocationExecution creates a mockable dry-run invocation envelope", () => {
  const result = planShellInvocationExecution({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool.shell.execute"],
      allowedScopes: ["tool.shell.execute"],
    },
    invocation: {
      invocationId: "invoke-1",
      executable: "node",
      args: ["--version"],
      cwd: "/workspace",
      env: [{ name: "NODE_ENV", value: "test" }],
      timeoutMs: 2000,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellInvocationExecutionDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "shell.invocationExecution");
  assert.equal(result.plan.invocationId, "invoke-1");
  assert.equal(result.plan.executable, "node");
  assert.deepEqual(result.plan.args, ["--version"]);
  assert.deepEqual(result.plan.env, { NODE_ENV: "test" });
  assert.equal(result.plan.commandPlan.toolId, "shell.commandExecution");
  assert.equal(result.plan.commandPlan.outputEnvelope.started, false);
  assert.equal(result.plan.wouldSpawnProcess, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planShellInvocationExecution classifies missing object, missing id, and invalid env", () => {
  const missingObject = planShellInvocationExecution({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingObject.ok, false);
  if (!missingObject.ok) {
    assert.equal(missingObject.error.code, "MISSING_INVOCATION");
    assert.equal(missingObject.error.boundary, "input");
  }

  const missingId = planShellInvocationExecution({
    context: { runtimeId: "runtime-1" },
    invocation: { executable: "pwd" },
  });
  assert.equal(missingId.ok, false);
  if (!missingId.ok) {
    assert.equal(missingId.error.code, "MISSING_INVOCATION_ID");
    assert.equal(missingId.error.boundary, "input");
  }

  const invalidEnv = planShellInvocationExecution({
    context: { runtimeId: "runtime-1" },
    invocation: {
      invocationId: "invoke-env",
      executable: "pwd",
      env: [{ name: "BAD-NAME", value: "1" }],
    },
  });
  assert.equal(invalidEnv.ok, false);
  if (!invalidEnv.ok) {
    assert.equal(invalidEnv.error.code, "INVALID_ENVIRONMENT");
    assert.equal(invalidEnv.error.boundary, "input");
  }
});

test("planShellInvocationExecution returns public-safe errors for malformed env entries", () => {
  for (const env of [[{}], [null], [{ name: "OK", value: 1 }], [{ name: "OK", value: "bad\0value" }]]) {
    const result = planShellInvocationExecution({
      context: { runtimeId: "runtime-1" },
      invocation: {
        invocationId: "invoke-env-malformed",
        executable: "pwd",
        env: env as never,
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "INVALID_ENVIRONMENT");
      assert.equal(result.error.boundary, "input");
      assert.equal(result.error.safeForRuntimeInspection, true);
      assert.equal(result.error.internalDetailExposed, false);
    }
  }
});

test("planShellInvocationExecution returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedRuntime = planShellInvocationExecution({
    context: { runtimeId: 1 } as never,
    invocation: { invocationId: "invoke-runtime", executable: "pwd" },
  });
  assert.equal(malformedRuntime.ok, false);
  if (!malformedRuntime.ok) {
    assert.equal(malformedRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(malformedRuntime.error.boundary, "input");
  }

  const malformedInvocation = planShellInvocationExecution({
    context: { runtimeId: "runtime-1" },
    invocation: null as never,
  });
  assert.equal(malformedInvocation.ok, false);
  if (!malformedInvocation.ok) {
    assert.equal(malformedInvocation.error.code, "MISSING_INVOCATION");
    assert.equal(malformedInvocation.error.boundary, "input");
  }

  const malformedArgs = planShellInvocationExecution({
    context: { runtimeId: "runtime-1" },
    invocation: {
      invocationId: "invoke-args",
      executable: "pwd",
      args: {} as never,
    },
  });
  assert.equal(malformedArgs.ok, false);
  if (!malformedArgs.ok) {
    assert.equal(malformedArgs.error.code, "COMMAND_PLAN_REJECTED");
    assert.equal(malformedArgs.error.boundary, "input");
  }

  const malformedCwd = planShellInvocationExecution({
    context: { runtimeId: "runtime-1" },
    invocation: {
      invocationId: "invoke-cwd",
      executable: "pwd",
      cwd: 1 as never,
    },
  });
  assert.equal(malformedCwd.ok, false);
  if (!malformedCwd.ok) {
    assert.equal(malformedCwd.error.code, "COMMAND_PLAN_REJECTED");
    assert.equal(malformedCwd.error.boundary, "input");
  }

  const malformedStdin = planShellInvocationExecution({
    context: { runtimeId: "runtime-1" },
    invocation: {
      invocationId: "invoke-stdin",
      executable: "cat",
      stdin: {} as never,
    },
  });
  assert.equal(malformedStdin.ok, false);
  if (!malformedStdin.ok) {
    assert.equal(malformedStdin.error.code, "INVALID_STDIN");
    assert.equal(malformedStdin.error.boundary, "input");
  }
});

test("planShellInvocationExecution preserves command planner guardrails", () => {
  const real = planShellInvocationExecution({
    context: { runtimeId: "runtime-1", dryRun: false },
    invocation: { invocationId: "invoke-real", executable: "pwd" },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "COMMAND_PLAN_REJECTED");
    assert.equal(real.error.boundary, "contract");
  }

  const denied = planShellInvocationExecution({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool.shell.execute", "host.fs.write"],
      allowedScopes: ["tool.shell.execute"],
    },
    invocation: { invocationId: "invoke-denied", executable: "pwd" },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "COMMAND_PLAN_REJECTED");
    assert.equal(denied.error.boundary, "scope");
  }
});

test("executeShellInvocation returns dry-run output without calling the provider", async () => {
  let providerCalled = false;

  const result = await executeShellInvocation({
    context: { runtimeId: "runtime-1", invocationId: "invoke-dry-run" },
    invocation: { invocationId: "invoke-dry-run", executable: "printf", args: ["hello"] },
    provider: () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "hello", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.shell.invocationExecution");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.stdout, "");
});

test("executeShellInvocation calls an injected provider when runtime disables dry-run", async () => {
  const result = await executeShellInvocation({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    invocation: {
      invocationId: "invoke-real",
      executable: "printf",
      args: ["ok"],
      cwd: "/workspace",
      env: [{ name: "PRAXIS_ENV", value: "ok" }],
      timeoutMs: 1000,
    },
    provider: (request) => {
      assert.equal(request.executable, "printf");
      assert.deepEqual(request.args, ["ok"]);
      assert.equal(request.cwd, "/workspace");
      assert.deepEqual(request.env, { PRAXIS_ENV: "ok" });
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

test("executeShellInvocation rejects malformed stdin before provider dispatch", async () => {
  let providerCalled = false;

  const result = await executeShellInvocation({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    invocation: {
      invocationId: "invoke-stdin-malformed",
      executable: "cat",
      stdin: {} as never,
    },
    provider: () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "should-not-run", stderr: "" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_STDIN");
    assert.equal(result.error.boundary, "input");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
});

test("executeShellInvocation requires a runtime provider for real execution", async () => {
  const result = await executeShellInvocation({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    invocation: { invocationId: "invoke-no-provider", executable: "pwd" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.boundary, "provider");
    assert.equal(result.error.safeForRuntimeInspection, true);
  }
});

test("executeShellInvocation honors runtime governance before provider dispatch", async () => {
  let providerCalled = false;

  const result = await executeShellInvocation({
    context: {
      runtimeId: "runtime-1",
      dryRun: false,
      guard: { allowed: false, reason: "runtime denied shell invocation" },
    },
    invocation: { invocationId: "invoke-denied", executable: "pwd" },
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

test("executeShellInvocation requires an allowed runtime guard before provider dispatch", async () => {
  for (const guard of [undefined, {} as never, "malformed" as never]) {
    let providerCalled = false;

    const result = await executeShellInvocation({
      context: {
        runtimeId: "runtime-1",
        dryRun: false,
        guard,
      },
      invocation: { invocationId: "invoke-missing-guard", executable: "pwd" },
      provider: () => {
        providerCalled = true;
        return { exitCode: 0, stdout: "should-not-run", stderr: "" };
      },
    });

    assert.equal(result.ok, false);
    assert.equal(providerCalled, false);
    if (!result.ok) {
      assert.equal(result.error.code, "GOVERNANCE_REJECTED");
      assert.equal(result.error.boundary, "governance");
    }
  }
});

test("executeShellInvocation maps provider failures to public-safe shell errors", async () => {
  const result = await executeShellInvocation({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    invocation: { invocationId: "invoke-fail", executable: "false" },
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

test("shellInvocationExecutionHandler adapts BaseToolInvokeRequest through executor.shell.run", async () => {
  const result = await shellInvocationExecutionHandler.invoke({
    toolCallId: "call-invocation-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      invocation: {
        executable: "echo",
        args: ["handler"],
        timeoutMs: 1000,
      },
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

  assert.equal(result.toolId, "shell.invocationExecution");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.stdout, "echo handler");
  assert.equal(result.metadata?.audit !== undefined, true);
});

test("shellInvocationExecutionHandler reports env override as unavailable on the v1 host executor path", async () => {
  const result = await shellInvocationExecutionHandler.invoke({
    toolCallId: "call-invocation-env",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      invocation: {
        executable: "env",
        env: [{ name: "PRAXIS_ENV", value: "1" }],
      },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: true,
          output: { exitCode: 0, stdout: "", stderr: "" },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("selectShellInvocationExecutionPractice mirrors LSP provider selection shape", async () => {
  const selection = selectShellInvocationExecutionPractice({
    preferredProvider: "openai",
    provider: async () => ({ exitCode: 0, stdout: "selected", stderr: "" }),
  });

  assert.equal(selection.providerName, "openai");
  assert.equal(selection.practice.providerName, "openai");
  assert.equal(selection.practice.directCliSupport, true);
  assert.equal(typeof selection.practice.createProvider, "function");
  assert.equal(selection.provider !== undefined, true);
});

test("baseTool registry can mount and invoke shell.invocationExecution through the unified handler path", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.invocationExecution");

  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "registry-shell-invocation",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      invocation: {
        executable: "printf",
        args: ["registry"],
        timeoutMs: 1000,
      },
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
  assert.equal(result.toolId, "shell.invocationExecution");
  assert.equal(output.dryRun, false);
  assert.equal(output.providerCalled, true);
  assert.equal(output.stdout, "printf:registry");
});
