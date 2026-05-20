import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeShellScript,
  planShellScriptExecution,
  selectShellScriptExecutionPractice,
  shellScriptExecutionHandler,
  shellScriptExecutionDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.scriptExecution.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.scriptExecution.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.scriptExecution.md",
  testFileUrl: import.meta.url,
});

test("planShellScriptExecution creates a guarded dry-run script plan", () => {
  const result = planShellScriptExecution({
    context: {
      runtimeId: "runtime-1",
      invocationId: "script-1",
      requestedScopes: ["tool.shell.script"],
      allowedScopes: ["tool.shell.script"],
    },
    script: "echo hello\npwd",
    language: "bash",
    cwd: "/workspace",
    timeoutMs: 1500,
  });

  assert.equal(result.ok, true);
  assert.equal(shellScriptExecutionDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "shell.scriptExecution");
  assert.equal(result.plan.language, "bash");
  assert.equal(result.plan.cwd, "/workspace");
  assert.equal(result.plan.timeoutMs, 1500);
  assert.equal(result.plan.scriptPreview, "echo hello pwd");
  assert.equal(result.plan.scriptLineCount, 2);
  assert.equal(result.plan.outputEnvelope.started, false);
  assert.equal(result.plan.wouldSpawnProcess, true);
  assert.equal(result.plan.wouldWriteTempScript, false);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planShellScriptExecution classifies missing input, scope denial, and real script attempts", () => {
  const missingRuntime = planShellScriptExecution();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingScript = planShellScriptExecution({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingScript.ok, false);
  if (!missingScript.ok) {
    assert.equal(missingScript.error.code, "MISSING_SCRIPT");
    assert.equal(missingScript.error.boundary, "input");
  }

  const denied = planShellScriptExecution({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool.shell.script", "host.fs.write"],
      allowedScopes: ["tool.shell.script"],
    },
    script: "echo hello",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const real = planShellScriptExecution({
    context: { runtimeId: "runtime-1", dryRun: false },
    script: "echo hello",
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_SCRIPT_EXECUTION_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planShellScriptExecution rejects unsafe scripts and invalid resource limits", () => {
  const invalidScript = planShellScriptExecution({
    context: { runtimeId: "runtime-1" },
    script: "echo\0hello",
  });
  assert.equal(invalidScript.ok, false);
  if (!invalidScript.ok) {
    assert.equal(invalidScript.error.code, "INVALID_SCRIPT");
    assert.equal(invalidScript.error.boundary, "input");
  }

  const invalidTimeout = planShellScriptExecution({
    context: { runtimeId: "runtime-1" },
    script: "echo hello",
    timeoutMs: 700_000,
  });
  assert.equal(invalidTimeout.ok, false);
  if (!invalidTimeout.ok) {
    assert.equal(invalidTimeout.error.code, "INVALID_TIMEOUT");
    assert.equal(invalidTimeout.error.boundary, "resource");
  }
});

test("planShellScriptExecution returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedRuntime = planShellScriptExecution({
    context: { runtimeId: 1 } as never,
    script: "pwd",
  });
  assert.equal(malformedRuntime.ok, false);
  if (!malformedRuntime.ok) {
    assert.equal(malformedRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(malformedRuntime.error.boundary, "input");
  }

  const malformedCwd = planShellScriptExecution({
    context: { runtimeId: "runtime-1" },
    script: "pwd",
    cwd: 1 as never,
  });
  assert.equal(malformedCwd.ok, false);
  if (!malformedCwd.ok) {
    assert.equal(malformedCwd.error.code, "INVALID_CWD");
    assert.equal(malformedCwd.error.boundary, "input");
  }

  const malformedLanguage = planShellScriptExecution({
    context: { runtimeId: "runtime-1" },
    script: "pwd",
    language: 1 as never,
  });
  assert.equal(malformedLanguage.ok, false);
  if (!malformedLanguage.ok) {
    assert.equal(malformedLanguage.error.code, "INVALID_LANGUAGE");
    assert.equal(malformedLanguage.error.boundary, "input");
  }

  const malformedStdin = planShellScriptExecution({
    context: { runtimeId: "runtime-1" },
    script: "cat",
    stdin: {} as never,
  });
  assert.equal(malformedStdin.ok, false);
  if (!malformedStdin.ok) {
    assert.equal(malformedStdin.error.code, "INVALID_STDIN");
    assert.equal(malformedStdin.error.boundary, "input");
  }
});

test("executeShellScript returns dry-run output without calling the provider", async () => {
  let providerCalled = false;

  const result = await executeShellScript({
    context: { runtimeId: "runtime-1", invocationId: "script-dry-run" },
    script: "printf hello",
    language: "sh",
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

  assert.equal(result.output.kind, "agentCore.basicTool.shell.scriptExecution");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.command, "sh");
  assert.deepEqual(result.output.args, ["-c", "printf hello"]);
});

test("executeShellScript calls an injected provider when runtime disables dry-run", async () => {
  const result = await executeShellScript({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    script: "printf ok",
    language: "bash",
    cwd: "/workspace",
    timeoutMs: 1000,
    provider: (request) => {
      assert.equal(request.command, "bash");
      assert.deepEqual(request.args, ["-c", "printf ok"]);
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

test("executeShellScript rejects malformed stdin before provider dispatch", async () => {
  let providerCalled = false;

  const result = await executeShellScript({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    script: "cat",
    stdin: {} as never,
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

test("executeShellScript requires a runtime provider for real execution", async () => {
  const result = await executeShellScript({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    script: "pwd",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.boundary, "provider");
    assert.equal(result.error.safeForRuntimeInspection, true);
  }
});

test("executeShellScript honors runtime governance before provider dispatch", async () => {
  let providerCalled = false;

  const result = await executeShellScript({
    context: {
      runtimeId: "runtime-1",
      dryRun: false,
      guard: { allowed: false, reason: "runtime denied shell script" },
    },
    script: "pwd",
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

test("executeShellScript requires an allowed runtime guard before provider dispatch", async () => {
  for (const guard of [undefined, {} as never, "malformed" as never]) {
    let providerCalled = false;

    const result = await executeShellScript({
      context: {
        runtimeId: "runtime-1",
        dryRun: false,
        guard,
      },
      script: "pwd",
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

test("executeShellScript maps provider failures to public-safe shell errors", async () => {
  const result = await executeShellScript({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    script: "false",
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

test("shellScriptExecutionHandler adapts BaseToolInvokeRequest through executor.shell.run", async () => {
  const result = await shellScriptExecutionHandler.invoke({
    toolCallId: "call-script-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      script: "printf handler",
      language: "sh",
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

  assert.equal(result.toolId, "shell.scriptExecution");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.command, "sh");
  assert.deepEqual(result.output.args, ["-c", "printf handler"]);
  assert.equal(result.output.stdout, "sh -c printf handler");
  assert.equal(result.metadata?.audit !== undefined, true);
});

test("selectShellScriptExecutionPractice mirrors LSP provider selection shape", async () => {
  const selection = selectShellScriptExecutionPractice({
    preferredProvider: "deepmind",
    provider: async () => ({ exitCode: 0, stdout: "selected", stderr: "" }),
  });

  assert.equal(selection.providerName, "deepmind");
  assert.equal(selection.practice.providerName, "deepmind");
  assert.equal(selection.practice.directCliSupport, true);
  assert.equal(typeof selection.practice.createProvider, "function");
  assert.equal(selection.provider !== undefined, true);
});

test("baseTool registry can mount and invoke shell.scriptExecution through the unified handler path", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("shell.scriptExecution");

  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    return;
  }

  const result = await lookup.handler.invoke({
    toolCallId: "registry-shell-script",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      context: { dryRun: false, guard: { allowed: true } },
      script: "printf registry",
      language: "sh",
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
  assert.equal(result.toolId, "shell.scriptExecution");
  assert.equal(output.dryRun, false);
  assert.equal(output.providerCalled, true);
  assert.equal(output.stdout, "sh:-c,printf registry");
});
