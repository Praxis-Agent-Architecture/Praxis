import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createAgentApplicationRuntime } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationRuntime.md",
  testFileUrl: import.meta.url,
});

const runtime = {
  runtimeId: "spec:agent",
  sourceKind: "spec" as const,
  name: "agent",
  readiness: "ready" as const,
  assembledSurfaces: ["runtime.applicationSurface", "runtime.invocationMethod"],
  unsafeSideEffects: false as const,
};

const mount = {
  mountId: "spec:agent:app.main",
  applicationId: "app.main",
  runtimeId: "spec:agent",
  lifecycleState: "mounted" as const,
  acceptedCapabilities: ["invoke"],
  eventSubscriptions: ["output"],
  governanceState: "accepted" as const,
};

test("createAgentApplicationRuntime exposes only application-visible runtime context", () => {
  const result = createAgentApplicationRuntime({
    runtime,
    mount,
    operation: "invoke",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.surface, {
    runtimeId: "spec:agent",
    applicationId: "app.main",
    operation: "invoke",
    status: "ready",
    visibleContext: {
      sourceKind: "spec",
      assembledSurfaces: ["runtime.applicationSurface", "runtime.invocationMethod"],
      mountId: "spec:agent:app.main",
    },
  });
  assert.deepEqual(result.events, ["application.runtime.ready"]);
});

test("createAgentApplicationRuntime rejects missing and mismatched mounts", () => {
  assert.deepEqual(createAgentApplicationRuntime({ runtime }), {
    ok: false,
    error: {
      code: "APPLICATION_NOT_MOUNTED",
      message: "application must be mounted before using the runtime surface",
      boundary: "input",
    },
    events: ["application.runtime.rejected"],
  });

  assert.deepEqual(
    createAgentApplicationRuntime({
      runtime,
      mount: { ...mount, runtimeId: "spec:other" },
    }),
    {
      ok: false,
      error: {
        code: "APPLICATION_NOT_MOUNTED",
        message: "application mount does not belong to the provided runtime",
        boundary: "input",
      },
      events: ["application.runtime.rejected"],
    },
  );
});

test("createAgentApplicationRuntime rejects non-ready runtime descriptors", () => {
  assert.deepEqual(
    createAgentApplicationRuntime({
      runtime: { ...runtime, readiness: "building" },
      mount,
    }),
    {
      ok: false,
      error: {
        code: "RUNTIME_NOT_READY",
        message: "application runtime can only expose a ready runtime",
        boundary: "runtime-state",
      },
      events: ["application.runtime.rejected"],
    },
  );
});
