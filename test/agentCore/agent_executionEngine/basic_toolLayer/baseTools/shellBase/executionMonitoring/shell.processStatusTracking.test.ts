import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeShellProcessStatusTracking,
  shellProcessStatusTrackingHandler,
  shellProcessStatusTrackingDescriptor,
  trackShellProcessStatus,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.processStatusTracking.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.processStatusTracking.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.processStatusTracking.md",
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

  const stale = trackShellProcessStatus({
    executionId: "exec-stale",
    snapshot: { status: "running", observedAt: "2026-04-22T23:00:00.000Z" },
    staleAfterMs: 1,
  });
  assert.equal(stale.ok, true);
  assert.equal(stale.output.stale, true);
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

  const invalidStale = trackShellProcessStatus({
    executionId: "exec-stale-invalid",
    snapshot: { status: "running" },
    staleAfterMs: "soon" as never,
  });
  assert.equal(invalidStale.ok, false);
  assert.equal(invalidStale.error.code, "INVALID_STALE_AFTER_MS");

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

test("executeShellProcessStatusTracking uses a guarded provider for real status snapshots", async () => {
  const result = await executeShellProcessStatusTracking({
    executionId: "exec-provider",
    expectedStatuses: ["completed"],
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
    provider: () => ({ snapshot: { status: "completed", exitCode: 0 } }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.matchesExpectedStatus, true);
  }
});

test("executeShellProcessStatusTracking never calls a provider during dry-run", async () => {
  let providerCalled = false;
  const result = await executeShellProcessStatusTracking({
    executionId: "exec-dry-provider",
    snapshot: { status: "running" },
    context: { guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
    provider: () => {
      providerCalled = true;
      throw new Error("provider must not be called during dry-run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.equal(result.output.dryRun, true);
    assert.equal(result.output.providerCalled, false);
  }
});

test("executeShellProcessStatusTracking normalizes signal-only runtime exits as terminated", async () => {
  const result = await executeShellProcessStatusTracking({
    executionId: "exec-provider-signal",
    expectedStatuses: ["terminated"],
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
    executor: {
      shell: {
        monitorExecution: async () => ({
          ok: true,
          output: { target: { processId: 123 }, observation: { state: "exited", signal: "SIGTERM", observedAtMs: Date.now() } },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.status, "terminated");
    assert.equal(result.output.signal, "SIGTERM");
    assert.equal(result.output.matchesExpectedStatus, true);
  }
});

test("executeShellProcessStatusTracking validates caller status material before provider dispatch", async () => {
  for (const [name, input, expectedCode] of [
    ["bad-pid", { snapshot: { pid: "bad" } }, "INVALID_PID"],
    ["bad-status", { snapshot: { status: "ghost" } }, "INVALID_STATUS"],
    ["bad-timestamp", { snapshot: { observedAt: "not-a-date" } }, "INVALID_TIMESTAMP"],
    ["bad-stale-after", { staleAfterMs: {} }, "INVALID_STALE_AFTER_MS"],
    ["bad-expected-statuses", { expectedStatuses: {} }, "INVALID_STATUS"],
  ] as const) {
    let providerCalled = false;
    const result = await executeShellProcessStatusTracking({
      executionId: `exec-real-${name}`,
      ...input,
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
      provider: () => {
        providerCalled = true;
        return { snapshot: { status: "running", pid: 123 } };
      },
    } as never);

    assert.equal(result.ok, false);
    assert.equal(providerCalled, false);
    if (!result.ok) {
      assert.equal(result.error.code, expectedCode);
      assert.equal(result.error.safeForRuntimeInspection, true);
      assert.equal(result.error.internalDetailExposed, false);
    }
  }
});

test("executeShellProcessStatusTracking rejects missing provider and denied governance", async () => {
  const denied = await executeShellProcessStatusTracking({
    executionId: "exec-denied",
    context: { dryRun: false, guard: { accepted: false } },
    provider: () => ({ snapshot: { status: "running" } }),
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeShellProcessStatusTracking({
    executionId: "exec-missing-provider",
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeShellProcessStatusTracking maps provider failures and malformed runtime material safely", async () => {
  const rejected = await executeShellProcessStatusTracking({
    executionId: "exec-provider-fails",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      throw new Error("internal process stack");
    },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.processStatusTracking provider rejected the request");
  }

  const missingMaterial = await executeShellProcessStatusTracking({
    executionId: "exec-provider-empty",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => ({}),
  });
  assert.equal(missingMaterial.ok, false);
  if (!missingMaterial.ok) assert.equal(missingMaterial.error.code, "MISSING_PROCESS_SNAPSHOT");

  const malformedExitCode = await executeShellProcessStatusTracking({
    executionId: "exec-provider-bad-exit",
    context: { dryRun: false, guard: { allowed: true } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { observation: { state: "exited", exitCode: "bad" } } }),
      },
    },
  });
  assert.equal(malformedExitCode.ok, false);
  if (!malformedExitCode.ok) assert.equal(malformedExitCode.error.code, "INVALID_EXIT_CODE");

  const malformedSignal = await executeShellProcessStatusTracking({
    executionId: "exec-provider-bad-signal",
    context: { dryRun: false, guard: { allowed: true } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { observation: { state: "exited", signal: 9 } } }),
      },
    },
  });
  assert.equal(malformedSignal.ok, false);
  if (!malformedSignal.ok) assert.equal(malformedSignal.error.code, "INVALID_SIGNAL");

  const malformedTimestamp = await executeShellProcessStatusTracking({
    executionId: "exec-provider-bad-time",
    context: { dryRun: false, guard: { allowed: true } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { observation: { state: "running", observedAtMs: "bad" } } }),
      },
    },
  });
  assert.equal(malformedTimestamp.ok, false);
  if (!malformedTimestamp.ok) assert.equal(malformedTimestamp.error.code, "INVALID_TIMESTAMP");

  const outOfRangeTimestamp = await executeShellProcessStatusTracking({
    executionId: "exec-provider-out-of-range-time",
    context: { dryRun: false, guard: { allowed: true } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { observation: { state: "running", observedAtMs: Number.MAX_VALUE } } }),
      },
    },
  });
  assert.equal(outOfRangeTimestamp.ok, false);
  if (!outOfRangeTimestamp.ok) assert.equal(outOfRangeTimestamp.error.code, "INVALID_TIMESTAMP");
});

test("shellProcessStatusTrackingHandler and registry invoke through the runtime monitor provider", async () => {
  const direct = await shellProcessStatusTrackingHandler.invoke({
    toolCallId: "call-process",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { executionId: "exec-handler", context: { dryRun: false, guard: { accepted: true } } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { snapshot: { status: "running", pid: 123 } } }),
      },
    },
  });
  assert.equal(direct.ok, true);
  if (direct.ok) assert.equal(direct.output.providerCalled, true);

  const registryHandler = createBaseToolRegistry().lookupHandler("shell.processStatusTracking");
  assert.equal(registryHandler.ok, true);
  if (!registryHandler.ok) return;
  const throughRegistry = await registryHandler.handler.invoke({
    toolCallId: "call-process-registry",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { executionId: "exec-registry", context: { dryRun: false, guard: { allowed: true } } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { status: "completed", exitCode: 0 } }),
      },
    },
  });
  assert.equal(throughRegistry.ok, true);
});

test("trackShellProcessStatus returns public-safe errors for malformed runtime JSON", () => {
  const malformedSnapshot = trackShellProcessStatus({ executionId: "exec-malformed", snapshot: null } as never);
  assert.equal(malformedSnapshot.ok, false);
  if (!malformedSnapshot.ok) assert.equal(malformedSnapshot.error.code, "MISSING_PROCESS_SNAPSHOT");

  const malformedExpected = trackShellProcessStatus({ executionId: "exec-expected", snapshot: { status: "running" }, expectedStatuses: {} } as never);
  assert.equal(malformedExpected.ok, false);
  if (!malformedExpected.ok) assert.equal(malformedExpected.error.code, "INVALID_STATUS");

  const malformedPid = trackShellProcessStatus({ executionId: "exec-pid-shape", snapshot: { pid: "bad", status: "running" } } as never);
  assert.equal(malformedPid.ok, false);
  if (!malformedPid.ok) assert.equal(malformedPid.error.code, "INVALID_PID");

  const malformedSignal = trackShellProcessStatus({ executionId: "exec-signal-shape", snapshot: { signal: 9 } } as never);
  assert.equal(malformedSignal.ok, false);
  if (!malformedSignal.ok) assert.equal(malformedSignal.error.code, "INVALID_SIGNAL");
});
