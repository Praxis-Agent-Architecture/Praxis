import assert from "node:assert/strict";
import test from "node:test";

import {
  createDebugRuntime,
  debugRuntimeDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.debug/debugRuntime.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.debug/debugRuntime.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.debug/debugRuntime.md",
  testFileUrl: import.meta.url,
});

test("createDebugRuntime opens a governed dry-run debug surface with optional attachments", () => {
  const result = createDebugRuntime({
    runtimeId: " runtime-1 ",
    debugSessionId: " debug-session-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    requestedCapabilities: ["trace", "snapshot", "state-diff"],
    allowedCapabilities: ["trace", "snapshot", "state-diff"],
    traceEvents: [{ kind: "invocation.started", source: "invocationMethod", payload: { hidden: true } }],
    snapshotSections: [{ kind: "runtime-state", label: "phase", status: "ready", value: { phase: "ready" } }],
    beforeState: { phase: "running" },
    afterState: { phase: "ready" },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(debugRuntimeDescriptor.unsafeSideEffects, false);
  assert.equal(result.session.runtimeId, "runtime-1");
  assert.equal(result.session.route, "runtime.debug.debugRuntime");
  assert.deepEqual(result.session.capabilities, ["trace", "snapshot", "state-diff"]);
  assert.equal(result.session.attachmentStatus.traceRecorded, true);
  assert.equal(result.session.attachmentStatus.snapshotCollected, true);
  assert.equal(result.session.attachmentStatus.stateDiffComputed, true);
  assert.equal(result.session.attachments.trace?.audit.rawPayloadStored, false);
  assert.equal(result.session.attachments.snapshot?.audit.rawRuntimeStateExposed, false);
  assert.equal(result.session.attachments.stateDiff?.audit.rawStateValuesExposed, false);
  assert.match(result.events.join("\n"), /runtime\.debug\.traceRecorder\.recorded/);
});

test("createDebugRuntime rejects empty input and out-of-scope debug capabilities", () => {
  const missing = createDebugRuntime();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty debug runtime input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const denied = createDebugRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    requestedCapabilities: ["trace", "raw-provider-dump"],
    allowedCapabilities: ["trace"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("debug capability scope violation must be rejected");
  }

  assert.equal(denied.error.code, "CAPABILITY_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.internalDetailExposed, false);
});
