import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeShellRuntimeObservation,
  observeShellRuntime,
  shellRuntimeObservationHandler,
  shellRuntimeObservationDescriptor,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.runtimeObservation.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.runtimeObservation.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.runtimeObservation.md",
  testFileUrl: import.meta.url,
});

test("observeShellRuntime summarizes supplied runtime events in a dry-run envelope", () => {
  const result = observeShellRuntime({
    executionId: "exec-1",
    command: "npm test",
    events: [
      { type: "spawned", observedAt: "2026-04-22T23:00:00.000Z", severity: "info" },
      { type: "stdout", observedAt: "2026-04-22T23:00:01.000Z", severity: "debug" },
    ],
    context: { invocationId: "runtime-1", grantedPermissions: ["shell:observe"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellRuntimeObservationDescriptor.defaultDryRun, true);
  assert.equal(result.output.status, "active");
  assert.equal(result.output.eventCount, 2);
  assert.equal(result.output.latestEventType, "stdout");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.observationOnly, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.runtimeObservation.active"]);
});

test("observeShellRuntime distinguishes warning and errored observations", () => {
  const warning = observeShellRuntime({
    executionId: "exec-warn",
    events: [{ type: "stderr", severity: "warn" }],
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(warning.ok, true);
  assert.equal(warning.output.status, "warning");
  assert.equal(warning.output.severities.warn, 1);

  const errored = observeShellRuntime({
    executionId: "exec-error",
    events: [{ type: "exit", severity: "error" }],
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(errored.ok, true);
  assert.equal(errored.output.status, "errored");
  assert.equal(errored.output.severities.error, 1);
});

test("observeShellRuntime rejects missing events, invalid event data, permission gaps, and real execution", () => {
  const missing = observeShellRuntime();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_EXECUTION_ID");

  const noEvents = observeShellRuntime({ executionId: "exec-empty" });
  assert.equal(noEvents.ok, false);
  assert.equal(noEvents.error.code, "MISSING_EVENTS");

  const invalidEvent = observeShellRuntime({
    executionId: "exec-invalid-event",
    events: [{ type: "" }],
  });
  assert.equal(invalidEvent.ok, false);
  assert.equal(invalidEvent.error.code, "INVALID_EVENT");

  const invalidTime = observeShellRuntime({
    executionId: "exec-invalid-time",
    events: [{ type: "stdout", observedAt: "not-a-date" }],
  });
  assert.equal(invalidTime.ok, false);
  assert.equal(invalidTime.error.code, "INVALID_TIMESTAMP");

  const invalidSeverity = observeShellRuntime({
    executionId: "exec-invalid-severity",
    events: [{ type: "stdout", severity: "notice" as never }],
  });
  assert.equal(invalidSeverity.ok, false);
  assert.equal(invalidSeverity.error.code, "INVALID_SEVERITY");

  const invalidMaxEvents = observeShellRuntime({
    executionId: "exec-invalid-max",
    events: [{ type: "stdout" }],
    maxEvents: "many" as never,
  });
  assert.equal(invalidMaxEvents.ok, false);
  assert.equal(invalidMaxEvents.error.code, "EVENT_LIMIT_EXCEEDED");

  const permission = observeShellRuntime({
    executionId: "exec-permission",
    events: [{ type: "stdout" }],
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");

  const real = observeShellRuntime({
    executionId: "exec-real",
    events: [{ type: "stdout" }],
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
});

test("executeShellRuntimeObservation uses a guarded provider for real runtime events", async () => {
  const result = await executeShellRuntimeObservation({
    executionId: "exec-provider",
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
    provider: () => ({ events: [{ type: "stderr", severity: "warn" }] }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.status, "warning");
  }
});

test("executeShellRuntimeObservation never calls a provider during dry-run", async () => {
  let providerCalled = false;
  const result = await executeShellRuntimeObservation({
    executionId: "exec-dry-provider",
    events: [{ type: "stdout", severity: "debug" }],
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

test("executeShellRuntimeObservation validates caller runtime events before provider dispatch", async () => {
  for (const [name, input, expectedCode] of [
    ["bad-events-shape", { events: {} }, "INVALID_ARGUMENT"],
    ["bad-event-time", { events: [{ type: "stdout", observedAt: {} }] }, "INVALID_TIMESTAMP"],
    ["bad-runtime-observation-error", { runtimeObservationError: { code: "BAD_SHAPE" } }, "INVALID_RUNTIME_OBSERVATION"],
    ["bad-max-events", { maxEvents: {} }, "EVENT_LIMIT_EXCEEDED"],
  ] as const) {
    let providerCalled = false;
    const result = await executeShellRuntimeObservation({
      executionId: `exec-real-${name}`,
      ...input,
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
      provider: () => {
        providerCalled = true;
        return { events: [{ type: "stdout", severity: "info" }] };
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

test("executeShellRuntimeObservation rejects missing provider and denied governance", async () => {
  const denied = await executeShellRuntimeObservation({
    executionId: "exec-denied",
    context: { dryRun: false, guard: { allowed: false } },
    provider: () => ({ events: [{ type: "stdout" }] }),
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeShellRuntimeObservation({
    executionId: "exec-missing-provider",
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeShellRuntimeObservation maps provider failures and malformed runtime material safely", async () => {
  const rejected = await executeShellRuntimeObservation({
    executionId: "exec-provider-fails",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      throw new Error("internal observation stack");
    },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.runtimeObservation provider rejected the request");
  }

  const missingMaterial = await executeShellRuntimeObservation({
    executionId: "exec-provider-empty",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => ({}),
  });
  assert.equal(missingMaterial.ok, false);
  if (!missingMaterial.ok) assert.equal(missingMaterial.error.code, "MISSING_EVENTS");

  for (const [name, observation] of [
    ["bad-state", { state: 1, stdoutBytes: 1 }],
    ["bad-observed-at", { state: "running", observedAtMs: "bad" }],
    ["out-of-range-observed-at", { state: "running", observedAtMs: Number.MAX_VALUE }],
    ["bad-stdout", { state: "running", stdout: 1 }],
    ["bad-stderr", { state: "running", stderr: 1 }],
    ["bad-stdout-bytes", { state: "running", stdoutBytes: "bad" }],
    ["negative-stdout-bytes", { state: "running", stdoutBytes: -1 }],
    ["bad-stderr-bytes", { state: "running", stderrBytes: "bad" }],
    ["negative-stderr-bytes", { state: "running", stderrBytes: -1 }],
    ["bad-exit-code", { state: "exited", exitCode: "bad" }],
    ["out-of-range-exit-code", { state: "exited", exitCode: 999 }],
  ] as const) {
    const malformedObservation = await executeShellRuntimeObservation({
      executionId: `exec-provider-${name}`,
      context: { dryRun: false, guard: { allowed: true } },
      executor: {
        shell: {
          monitorExecution: async () => ({ ok: true, output: { observation } }),
        },
      },
    });
    assert.equal(malformedObservation.ok, false);
    if (!malformedObservation.ok) {
      assert.equal(malformedObservation.error.code, "INVALID_RUNTIME_OBSERVATION");
      assert.equal(malformedObservation.error.message, "shell.runtimeObservation received malformed runtime observation material");
      assert.equal(malformedObservation.error.safeForRuntimeInspection, true);
    }
  }
});

test("shellRuntimeObservationHandler and registry invoke through the runtime monitor provider", async () => {
  const direct = await shellRuntimeObservationHandler.invoke({
    toolCallId: "call-runtime",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { executionId: "exec-handler", context: { dryRun: false, guard: { accepted: true } } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { events: [{ type: "stdout", severity: "info" }] } }),
      },
    },
  });
  assert.equal(direct.ok, true);
  if (direct.ok) assert.equal(direct.output.providerCalled, true);

  const registryHandler = createBaseToolRegistry().lookupHandler("shell.runtimeObservation");
  assert.equal(registryHandler.ok, true);
  if (!registryHandler.ok) return;
  const throughRegistry = await registryHandler.handler.invoke({
    toolCallId: "call-runtime-registry",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { executionId: "exec-registry", context: { dryRun: false, guard: { allowed: true } } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { events: [{ type: "stderr", severity: "error" }] } }),
      },
    },
  });
  assert.equal(throughRegistry.ok, true);
});

test("observeShellRuntime returns public-safe errors for malformed runtime JSON", () => {
  const malformedEvents = observeShellRuntime({ executionId: "exec-malformed", events: {} } as never);
  assert.equal(malformedEvents.ok, false);
  if (!malformedEvents.ok) assert.equal(malformedEvents.error.code, "INVALID_ARGUMENT");

  const malformedContext = observeShellRuntime({ executionId: "exec-context", events: [{ type: "stdout" }], context: { invocationId: 1 } } as never);
  assert.equal(malformedContext.ok, true);

  const malformedTimestampShape = observeShellRuntime({ executionId: "exec-time-shape", events: [{ type: "stdout", observedAt: 1 }] } as never);
  assert.equal(malformedTimestampShape.ok, false);
  if (!malformedTimestampShape.ok) assert.equal(malformedTimestampShape.error.code, "INVALID_TIMESTAMP");

  const malformedObservationError = observeShellRuntime({ executionId: "exec-observation-error", runtimeObservationError: { code: "INVALID_STDOUT_BYTES" } } as never);
  assert.equal(malformedObservationError.ok, false);
  if (!malformedObservationError.ok) assert.equal(malformedObservationError.error.code, "INVALID_RUNTIME_OBSERVATION");
});
