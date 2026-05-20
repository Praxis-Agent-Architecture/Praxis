import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectRuntimeSurfaces,
  runtimeSurfaceInspectorDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeSurfaceInspector.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeSurfaceInspector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeSurfaceInspector.md",
  testFileUrl: import.meta.url,
});

test("inspectRuntimeSurfaces reports ready runtime surfaces with capability summaries", () => {
  const result = inspectRuntimeSurfaces({
    runtimeId: " runtime-1 ",
    surfaces: [
      {
        surfaceId: " applicationSurface ",
        mounted: true,
        ready: true,
        owner: "runtime.applicationSurface",
        exposedCapabilities: ["agent.invoke", "agent.invoke", "agent.observe"],
      },
      {
        surfaceId: "officialModuleSurface",
        mounted: true,
        ready: true,
        owner: "runtime.officialModuleSurface",
      },
    ],
    requestedScopes: ["inspection:read"],
    allowedScopes: ["inspection:read"],
  });

  assert.equal(runtimeSurfaceInspectorDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected surface inspection to succeed");
  }

  assert.equal(result.inspection.runtimeId, "runtime-1");
  assert.equal(result.inspection.status, "ready");
  assert.deepEqual(result.inspection.missingRequiredSurfaceIds, []);
  assert.deepEqual(result.inspection.entries[0]?.exposedCapabilities, ["agent.invoke", "agent.observe"]);
  assert.equal(result.inspection.unsafeSideEffects, false);
});

test("inspectRuntimeSurfaces classifies missing required and degraded optional surfaces", () => {
  const result = inspectRuntimeSurfaces({
    runtimeId: "runtime-1",
    surfaces: [
      { surfaceId: "governancePlane", mounted: false, required: true },
      { surfaceId: "debug", mounted: true, ready: false, required: false },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected missing surface inspection to return a snapshot");
  }

  assert.equal(result.inspection.status, "missing");
  assert.deepEqual(result.inspection.missingRequiredSurfaceIds, ["governancePlane"]);
  assert.deepEqual(result.inspection.degradedSurfaceIds, ["debug"]);
});

test("inspectRuntimeSurfaces rejects missing input, unready runtime, and scope denial", () => {
  const missing = inspectRuntimeSurfaces();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing runtimeId must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");

  const empty = inspectRuntimeSurfaces({ runtimeId: "runtime-1", surfaces: [] });
  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty surface set must be rejected");
  }
  assert.equal(empty.error.code, "EMPTY_SURFACE_SET");

  const unready = inspectRuntimeSurfaces({
    runtimeId: "runtime-1",
    surfaces: [{ surfaceId: "applicationSurface" }],
    runtimeReady: false,
  });
  assert.equal(unready.ok, false);
  if (unready.ok) {
    assert.fail("unready runtime must be rejected");
  }
  assert.equal(unready.error.code, "RUNTIME_NOT_READY");

  const denied = inspectRuntimeSurfaces({
    runtimeId: "runtime-1",
    surfaces: [{ surfaceId: "applicationSurface" }],
    requestedScopes: ["inspection:private"],
    allowedScopes: ["inspection:read"],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
});
