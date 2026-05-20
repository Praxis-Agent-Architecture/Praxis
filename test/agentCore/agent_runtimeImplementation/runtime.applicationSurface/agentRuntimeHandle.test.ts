import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createAgentRuntimeHandle } from "../../../../src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeHandle.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeHandle.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeHandle.md",
  testFileUrl: import.meta.url,
});

test("createAgentRuntimeHandle exposes dry-run calls and status without internal objects", () => {
  const result = createAgentRuntimeHandle({
    runtimeId: "spec:agent",
    applicationId: "app.main",
    enabledOperations: ["invoke", "inspect"],
    visibleSessions: ["session.1", " session.1 ", "session.2"],
    visibleEventTypes: ["output"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.handle.getStatus(), {
    runtimeId: "spec:agent",
    applicationId: "app.main",
    status: "ready",
    enabledOperations: ["invoke", "inspect"],
    visibleSessions: ["session.1", "session.2"],
    visibleEventTypes: ["output"],
  });
  assert.deepEqual(result.handle.call({ operation: "invoke", payload: { input: "hello" } }), {
    ok: true,
    operation: "invoke",
    runtimeId: "spec:agent",
    applicationId: "app.main",
    accepted: true,
    dryRun: true,
  });
});

test("createAgentRuntimeHandle rejects missing runtime and disabled operations", () => {
  assert.deepEqual(createAgentRuntimeHandle({ runtimeId: "" }), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "runtimeId is required before creating a runtime handle",
      boundary: "input",
    },
    events: ["runtime.handle.rejected"],
  });

  const result = createAgentRuntimeHandle({
    runtimeId: "spec:agent",
    enabledOperations: ["inspect"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.handle.call({ operation: "invoke" }), {
    ok: false,
    error: {
      code: "UNSUPPORTED_OPERATION",
      message: "operation invoke is not enabled for this runtime handle",
      boundary: "input",
    },
  });
});

test("createAgentRuntimeHandle closes the handle boundary before later calls", () => {
  const result = createAgentRuntimeHandle({ runtimeId: "spec:agent" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.handle.close(), {
    ok: true,
    runtimeId: "spec:agent",
    status: "closed",
    events: ["runtime.handle.closed"],
  });
  assert.equal(result.handle.getStatus().status, "closed");
  assert.deepEqual(result.handle.call({ operation: "inspect" }), {
    ok: false,
    error: {
      code: "HANDLE_CLOSED",
      message: "runtime handle is already closed",
      boundary: "runtime-state",
    },
  });
});
