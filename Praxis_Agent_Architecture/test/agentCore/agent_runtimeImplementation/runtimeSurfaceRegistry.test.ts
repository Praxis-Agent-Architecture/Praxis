import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeSurfaceRegistry,
  runtimeSurfaceRegistryCapability,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeSurfaceRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtimeSurfaceRegistry.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtimeSurfaceRegistry.md",
  testFileUrl: import.meta.url,
});

test("runtimeSurfaceRegistry registers and resolves ready runtime surfaces", () => {
  const result = createRuntimeSurfaceRegistry({
    runtimeId: " runtime-1 ",
    surfaces: [
      {
        surfaceId: " runtime.applicationSurface ",
        kind: "applicationSurface",
        owner: "runtime.applicationSurface",
        capabilities: ["agent.create", "agent.invoke", "agent.invoke"],
        scopes: ["agent:invoke", "agent:observe"],
        callers: ["application"],
      },
      {
        surfaceId: "runtime.governancePlane",
        kind: "governancePlane",
        ready: true,
        required: true,
        callers: ["runtime", "official-module"],
      },
    ],
  });

  assert.equal(runtimeSurfaceRegistryCapability.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected runtime surface registry to build");
  }

  assert.equal(result.registry.runtimeId, "runtime-1");
  assert.equal(result.registry.registrySurface, "runtimeSurfaceRegistry");
  assert.equal(result.registry.dryRun, true);
  assert.equal(result.registry.unsafeSideEffects, false);
  assert.deepEqual(result.registry.requiredSurfaceIds, [
    "runtime.applicationSurface",
    "runtime.governancePlane",
  ]);
  assert.deepEqual(result.registry.readySurfaceIds, [
    "runtime.applicationSurface",
    "runtime.governancePlane",
  ]);
  assert.equal(result.registry.has(" runtime.applicationSurface "), true);

  const resolved = result.registry.resolve({
    surfaceId: "runtime.applicationSurface",
    caller: "application",
    requestedScopes: ["agent:invoke"],
  });

  assert.equal(resolved.ok, true);
  if (!resolved.ok) {
    assert.fail("expected runtime surface to resolve");
  }

  assert.equal(resolved.surface.surfaceId, "runtime.applicationSurface");
  assert.deepEqual(resolved.surface.capabilities, ["agent.create", "agent.invoke"]);
  assert.deepEqual(resolved.grantedScopes, ["agent:invoke"]);
});

test("runtimeSurfaceRegistry keeps missing and degraded surfaces inspectable", () => {
  const result = createRuntimeSurfaceRegistry({
    runtimeId: "runtime-1",
    surfaces: [
      { surfaceId: "runtime.officialModuleSurface", kind: "officialModuleSurface", mounted: false, required: true },
      { surfaceId: "runtime.debug", kind: "debug", mounted: true, ready: false, required: false },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected registry snapshot to include unavailable surfaces");
  }

  assert.deepEqual(result.registry.missingRequiredSurfaceIds, ["runtime.officialModuleSurface"]);
  assert.deepEqual(result.registry.degradedSurfaceIds, ["runtime.debug"]);

  const missing = result.registry.resolve({ surfaceId: "runtime.officialModuleSurface", caller: "official-module" });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("unmounted surface should not resolve");
  }
  assert.equal(missing.error.code, "SURFACE_NOT_MOUNTED");
  assert.equal(missing.error.boundary, "runtime-state");
});

test("runtimeSurfaceRegistry rejects invalid registry input and gated surfaces", () => {
  const missingRuntime = createRuntimeSurfaceRegistry({
    surfaces: [{ surfaceId: "runtime.applicationSurface" }],
  });
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    assert.fail("missing runtime id should be rejected");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const duplicate = createRuntimeSurfaceRegistry({
    runtimeId: "runtime-1",
    surfaces: [{ surfaceId: "runtime.debug" }, { surfaceId: " runtime.debug " }],
  });
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    assert.fail("duplicate surface id should be rejected");
  }
  assert.equal(duplicate.error.code, "DUPLICATE_SURFACE_ID");
  assert.equal(duplicate.error.boundary, "registry");

  const gated = createRuntimeSurfaceRegistry({
    runtimeId: "runtime-1",
    surfaces: [
      {
        surfaceId: "runtime.externalControl",
        governance: { accepted: false, reason: "external control disabled" },
      },
    ],
  });
  assert.equal(gated.ok, false);
  if (gated.ok) {
    assert.fail("governance rejected surface should be rejected");
  }
  assert.equal(gated.error.code, "GOVERNANCE_REJECTED");
  assert.equal(gated.error.message, "external control disabled");
  assert.equal(gated.error.internalDetailExposed, false);
});

test("runtimeSurfaceRegistry resolve enforces caller and scope boundaries", () => {
  const result = createRuntimeSurfaceRegistry({
    runtimeId: "runtime-1",
    surfaces: [
      {
        surfaceId: "runtime.managementPlane",
        kind: "managementPlane",
        callers: ["management"],
        scopes: ["management:read"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected registry to build");
  }

  const wrongCaller = result.registry.resolve({ surfaceId: "runtime.managementPlane", caller: "application" });
  assert.equal(wrongCaller.ok, false);
  if (wrongCaller.ok) {
    assert.fail("caller outside surface exposure should be rejected");
  }
  assert.equal(wrongCaller.error.code, "CALLER_NOT_ALLOWED");
  assert.equal(wrongCaller.error.boundary, "scope");

  const deniedScope = result.registry.resolve({
    surfaceId: "runtime.managementPlane",
    caller: "management",
    requestedScopes: ["management:write"],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    assert.fail("unregistered scope should be rejected");
  }
  assert.equal(deniedScope.error.code, "SURFACE_SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");
});
