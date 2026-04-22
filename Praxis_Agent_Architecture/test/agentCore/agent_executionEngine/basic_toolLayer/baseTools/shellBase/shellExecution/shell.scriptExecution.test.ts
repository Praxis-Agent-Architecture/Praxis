import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planShellScriptExecution,
  shellScriptExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.scriptExecution.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.scriptExecution.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.scriptExecution.md",
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
