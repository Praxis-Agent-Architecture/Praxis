import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  monitorShellExecution,
  shellExecutionMonitoringDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.executionMonitoring.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.executionMonitoring.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.executionMonitoring.md",
  testFileUrl: import.meta.url,
});

test("monitorShellExecution summarizes a supplied running observation", () => {
  const result = monitorShellExecution({
    target: { sessionId: "shell-session-1", processId: 1234 },
    observation: {
      state: "running",
      observedAtMs: 10_000,
      lastActivityAtMs: 9_500,
      stdoutBytes: 128,
      stderrBytes: 0,
    },
    staleAfterMs: 1_000,
    context: {
      invocationId: "monitor-1",
      grantedPermissions: ["shell:execution:monitor"],
      allowedSessionIds: ["shell-session-1"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellExecutionMonitoringDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.health, "healthy");
  assert.equal(result.output.idleMs, 500);
  assert.equal(result.output.realProcessReadBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.executionMonitoring.healthy"]);
});

test("monitorShellExecution classifies stale and exited observations without reading processes", () => {
  const stale = monitorShellExecution({
    target: { sessionId: "shell-session-1" },
    observation: { state: "running", observedAtMs: 10_000, lastActivityAtMs: 1_000 },
    staleAfterMs: 5_000,
  });
  assert.equal(stale.ok, true);
  if (stale.ok) {
    assert.equal(stale.output.health, "stalled");
    assert.equal(stale.output.realProcessReadBlocked, true);
  }

  const exited = monitorShellExecution({
    target: { processId: 1234 },
    observation: { state: "exited", exitCode: 1 },
  });
  assert.equal(exited.ok, true);
  if (exited.ok) {
    assert.equal(exited.output.health, "failed");
  }
});

test("monitorShellExecution rejects missing target, scope, permission, and real monitoring", () => {
  const missing = monitorShellExecution();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_TARGET");
    assert.equal(missing.error.boundary, "input");
  }

  const scope = monitorShellExecution({
    target: { sessionId: "outside" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:execution:monitor"] },
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
    assert.equal(scope.error.boundary, "scope");
  }

  const permission = monitorShellExecution({
    target: { sessionId: "inside" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const real = monitorShellExecution({
    target: { sessionId: "inside" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_MONITORING_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
