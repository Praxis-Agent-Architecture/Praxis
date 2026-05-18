import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptRuntimeToolInvocation,
  basicToolInvocationAdapterDescriptor,
} from "../../../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.md",
  testFileUrl: import.meta.url,
});

test("adaptRuntimeToolInvocation creates a basic tool dry-run envelope for TAP handoff", () => {
  const result = adaptRuntimeToolInvocation({
    context: {
      runtimeId: " runtime-1 ",
      sessionId: " session-1 ",
      invocationId: " invoke-1 ",
      requestedScopes: ["tool.shell.execute"],
      allowedScopes: ["tool.shell.execute"],
      auditMetadata: { caller: "runtime.invocationMethod" },
    },
    toolId: "shell.commandExecution",
    operation: "execute-command",
    arguments: { command: "pwd" },
    cwd: "/workspace",
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 4096 },
  });

  assert.equal(result.ok, true);
  assert.equal(basicToolInvocationAdapterDescriptor.dispatch, "dry-run");
  if (!result.ok) {
    assert.fail("invocation adaptation should succeed");
  }

  assert.equal(result.invocation.kind, "agentCore.basicTool.executableInvocation");
  assert.equal(result.invocation.runtimeId, "runtime-1");
  assert.equal(result.invocation.sessionId, "session-1");
  assert.equal(result.invocation.invocationId, "invoke-1");
  assert.equal(result.invocation.toolId, "shell.commandExecution");
  assert.equal(result.invocation.family, "shell");
  assert.equal(result.invocation.dispatch, "dry-run");
  assert.equal(result.invocation.tapHandoff.eligible, true);
  assert.equal(result.invocation.dryRun, true);
  assert.equal(result.invocation.unsafeSideEffects, false);
  assert.deepEqual(result.invocation.acceptedScopes, ["tool.shell.execute"]);
});

test("adaptRuntimeToolInvocation rejects missing fields, scope denial, invalid limits, and real execution", () => {
  const missingRuntime = adaptRuntimeToolInvocation({
    context: { invocationId: "invoke-1" },
    toolId: "shell.commandExecution",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const denied = adaptRuntimeToolInvocation({
    context: {
      runtimeId: "runtime-1",
      invocationId: "invoke-1",
      requestedScopes: ["tool.shell.execute", "host.fs.write"],
      allowedScopes: ["tool.shell.execute"],
    },
    toolId: "shell.commandExecution",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const invalidLimit = adaptRuntimeToolInvocation({
    context: { runtimeId: "runtime-1", invocationId: "invoke-1" },
    toolId: "shell.commandExecution",
    resourceLimits: { timeoutMs: 0 },
  });
  assert.equal(invalidLimit.ok, false);
  if (!invalidLimit.ok) {
    assert.equal(invalidLimit.error.code, "INVALID_TIMEOUT");
    assert.equal(invalidLimit.error.boundary, "input");
  }

  const realExecution = adaptRuntimeToolInvocation({
    context: { runtimeId: "runtime-1", invocationId: "invoke-1", dryRun: false },
    toolId: "shell.commandExecution",
  });
  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
