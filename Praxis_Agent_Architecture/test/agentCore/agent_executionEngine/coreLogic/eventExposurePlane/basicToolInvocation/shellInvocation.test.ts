import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeShellInvocationEvent } from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/shellInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/shellInvocation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/shellInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposeShellInvocationEvent exposes a dry-run shell event without executing shell", () => {
  const result = exposeShellInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "shell-1",
    command: " npm test ",
    cwd: "/workspace",
    requestedScopes: ["tool.shell.invoke"],
    allowedScopes: ["tool.shell.invoke"],
    trace: { correlationId: "corr-shell" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.event.kind, "basicTool.shell.invocation");
  assert.equal(result.event.command, "npm test");
  assert.equal(result.event.phase, "planned");
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.shellExecutionPlanned, false);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.deepEqual(result.event.deniedScopes, []);
});

test("exposeShellInvocationEvent classifies missing input and blocks real execution", () => {
  const missingCommand = exposeShellInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "shell-1",
    command: " ",
  });

  assert.equal(missingCommand.ok, false);
  assert.equal(missingCommand.error.code, "MISSING_COMMAND");
  assert.equal(missingCommand.error.boundary, "input");

  const realExecution = exposeShellInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "shell-2",
    command: "npm test",
    dryRun: false,
  });

  assert.equal(realExecution.ok, false);
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(realExecution.error.boundary, "contract");
});
