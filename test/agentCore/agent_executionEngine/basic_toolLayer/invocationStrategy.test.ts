import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  basicToolInvocationStrategyDescriptor,
  selectBasicToolInvocationStrategy,
} from "../../../../src/agentCore_executionEngine/basic_toolLayer/invocationStrategy.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/invocationStrategy.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/invocationStrategy.md",
  testFileUrl: import.meta.url,
});

test("selectBasicToolInvocationStrategy chooses a guarded dry-run strategy for read-only tools", () => {
  const result = selectBasicToolInvocationStrategy({
    context: {
      runtimeId: " runtime-1 ",
      invocationId: " invocation-1 ",
      requestedScopes: ["tool.search.read"],
      allowedScopes: ["tool.search.read"],
      auditMetadata: { caller: "runtime.invocationMethod" },
    },
    toolId: "search.fetch",
    risks: ["read"],
  });

  assert.equal(result.ok, true);
  assert.equal(basicToolInvocationStrategyDescriptor.defaultMode, "dry-run");
  if (!result.ok) {
    assert.fail("strategy selection should succeed");
  }

  assert.equal(result.strategy.toolId, "search.fetch");
  assert.equal(result.strategy.family, "search");
  assert.equal(result.strategy.mode, "dry-run");
  assert.equal(result.strategy.dispatch, "dry-run");
  assert.equal(result.strategy.requiresTapApproval, false);
  assert.deepEqual(result.strategy.acceptedScopes, ["tool.search.read"]);
  assert.equal(result.strategy.dryRun, true);
  assert.equal(result.strategy.unsafeSideEffects, false);
});

test("selectBasicToolInvocationStrategy routes risky tools to TAP handoff without real execution", () => {
  const result = selectBasicToolInvocationStrategy({
    context: { runtimeId: "runtime-1", invocationId: "shell-1" },
    toolId: "shell.commandExecution",
    family: "shell",
    risks: ["process", "write"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("risky strategy selection should succeed");
  }

  assert.equal(result.strategy.mode, "tap-handoff");
  assert.equal(result.strategy.requiresTapApproval, true);
  assert.equal(result.strategy.dryRun, true);
});

test("selectBasicToolInvocationStrategy classifies missing input, scope denial, and real execution", () => {
  const missingRuntime = selectBasicToolInvocationStrategy({ toolId: "shell.commandExecution" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const denied = selectBasicToolInvocationStrategy({
    context: {
      runtimeId: "runtime-1",
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

  const realExecution = selectBasicToolInvocationStrategy({
    context: { runtimeId: "runtime-1", dryRun: false },
    toolId: "shell.commandExecution",
  });
  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
