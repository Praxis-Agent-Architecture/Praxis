import assert from "node:assert/strict";
import test from "node:test";

import {
  debugTraceRecorderDescriptor,
  recordDebugTrace,
} from "../../../../src/agentCore_runtimeImplementation/runtime.debug/debugTraceRecorder.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.debug/debugTraceRecorder.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.debug/debugTraceRecorder.md",
  testFileUrl: import.meta.url,
});

test("recordDebugTrace records public-safe dry-run trace envelopes", () => {
  const result = recordDebugTrace({
    runtimeId: " runtime-1 ",
    traceId: " trace-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    events: [
      {
        kind: " invocation.started ",
        source: "invocationMethod",
        summary: "model call entered runtime",
        payload: { prompt: "hidden", tokenBudget: 1024 },
        tags: [" invocation ", "debug"],
        metadata: { secretProviderFrame: "not stored" },
      },
    ],
    allowedEventKinds: ["invocation.started"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(debugTraceRecorderDescriptor.unsafeSideEffects, false);
  assert.equal(result.trace.runtimeId, "runtime-1");
  assert.equal(result.trace.route, "runtime.debug.debugTraceRecorder");
  assert.equal(result.trace.records[0]?.kind, "invocation.started");
  assert.deepEqual(result.trace.records[0]?.payloadKeys, ["prompt", "tokenBudget"]);
  assert.deepEqual(result.trace.records[0]?.metadataKeys, ["secretProviderFrame"]);
  assert.equal(Object.prototype.hasOwnProperty.call(result.trace.records[0] ?? {}, "metadata"), false);
  assert.deepEqual(result.trace.records[0]?.tags, ["invocation", "debug"]);
  assert.equal(result.trace.audit.rawPayloadStored, false);
  assert.equal(result.trace.audit.unsafeSideEffects, false);
});

test("recordDebugTrace rejects empty input and scope violations with classified errors", () => {
  const missing = recordDebugTrace();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty trace input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.internalDetailExposed, false);

  const denied = recordDebugTrace({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    events: [{ kind: "raw-provider.payload", source: "modelAdapter" }],
    allowedEventKinds: ["invocation.started"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("event scope violation must be rejected");
  }

  assert.equal(denied.error.code, "EVENT_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
