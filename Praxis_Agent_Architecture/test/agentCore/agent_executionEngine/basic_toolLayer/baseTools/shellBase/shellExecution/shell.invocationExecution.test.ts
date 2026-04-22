import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  planShellInvocationExecution,
  shellInvocationExecutionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.invocationExecution.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.invocationExecution.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellExecution/shell.invocationExecution.md",
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
