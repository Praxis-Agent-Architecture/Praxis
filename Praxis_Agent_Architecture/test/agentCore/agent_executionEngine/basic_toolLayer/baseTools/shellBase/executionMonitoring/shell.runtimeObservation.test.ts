import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  observeShellRuntime,
  shellRuntimeObservationDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.runtimeObservation.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.runtimeObservation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.runtimeObservation.md",
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
