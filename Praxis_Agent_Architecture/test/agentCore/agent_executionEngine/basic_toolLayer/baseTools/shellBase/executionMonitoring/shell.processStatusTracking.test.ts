import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  shellProcessStatusTrackingDescriptor,
  trackShellProcessStatus,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.processStatusTracking.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.processStatusTracking.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.processStatusTracking.md",
  testFileUrl: import.meta.url,
});

test("trackShellProcessStatus normalizes a running process snapshot without probing the OS", () => {
  const result = trackShellProcessStatus({
    executionId: "exec-1",
    command: "npm test",
    snapshot: {
      pid: 1234,
      status: "running",
      startedAt: "2026-04-22T23:00:00.000Z",
      observedAt: "2026-04-22T23:01:00.000Z",
    },
    expectedStatuses: ["running"],
    context: { invocationId: "process-1", grantedPermissions: ["shell:observe"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellProcessStatusTrackingDescriptor.defaultDryRun, true);
  assert.equal(result.output.status, "running");
  assert.equal(result.output.matchesExpectedStatus, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.observationOnly, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.processStatusTracking.running"]);
});

test("trackShellProcessStatus reports expectation mismatches and terminal snapshots", () => {
  const mismatch = trackShellProcessStatus({
    executionId: "exec-mismatch",
    snapshot: { status: "completed", exitCode: 0 },
    expectedStatuses: ["running"],
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(mismatch.ok, true);
  assert.equal(mismatch.output.status, "completed");
  assert.equal(mismatch.output.matchesExpectedStatus, false);

  const terminated = trackShellProcessStatus({
    executionId: "exec-term",
    snapshot: { status: "terminated", signal: "SIGTERM" },
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(terminated.ok, true);
  assert.equal(terminated.output.status, "terminated");
  assert.equal(terminated.output.signal, "SIGTERM");
});

test("trackShellProcessStatus rejects missing snapshot, invalid pid, invalid timestamps, permission gaps, and real execution", () => {
  const missing = trackShellProcessStatus();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_EXECUTION_ID");

  const noSnapshot = trackShellProcessStatus({ executionId: "exec-empty" });
  assert.equal(noSnapshot.ok, false);
  assert.equal(noSnapshot.error.code, "MISSING_PROCESS_SNAPSHOT");

  const invalidPid = trackShellProcessStatus({ executionId: "exec-pid", snapshot: { pid: -1 } });
  assert.equal(invalidPid.ok, false);
  assert.equal(invalidPid.error.code, "INVALID_PID");

  const invalidTime = trackShellProcessStatus({
    executionId: "exec-time",
    snapshot: { status: "running", observedAt: "not-a-date" },
  });
  assert.equal(invalidTime.ok, false);
  assert.equal(invalidTime.error.code, "INVALID_TIMESTAMP");

  const permission = trackShellProcessStatus({
    executionId: "exec-permission",
    snapshot: { status: "running" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");

  const real = trackShellProcessStatus({
    executionId: "exec-real",
    snapshot: { status: "running" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
});
