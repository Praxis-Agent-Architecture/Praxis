import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimeManifest,
  runtimeManifestDescriptor,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeManifest.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtimeManifest.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtimeManifest.md",
  testFileUrl: import.meta.url,
});

test("buildRuntimeManifest publishes a readonly runtime manifest envelope", () => {
  const result = buildRuntimeManifest({
    runtimeId: " runtime:alpha ",
    caller: {
      kind: "application",
      id: " app:studio ",
      sessionId: " session:1 ",
    },
    manifestVersion: " draft-1 ",
    generatedAt: "2026-04-23T00:00:00.000Z",
    requestedScopes: [" manifest:read ", "runtime.inspect", "manifest:read"],
    allowedScopes: ["manifest:read", "runtime.inspect"],
    surfaces: [
      {
        surfaceId: "runtime.contractSurface",
        kind: "contract-surface",
        required: true,
        contractId: " contract:runtime ",
        capabilities: [" contract.check ", "contract.check"],
        scopes: ["manifest:read"],
      },
      {
        surfaceId: "runtime.governancePlane",
        kind: "governance-plane",
        required: true,
        capabilities: ["policy.evaluate"],
      },
      {
        surfaceId: "runtime.invocationMethod",
        kind: "invocation-method",
        required: true,
        capabilities: ["agent.invoke"],
      },
      {
        surfaceId: "runtime.inspection",
        kind: "inspection-surface",
        exposesTo: ["inspection", "debug"],
      },
    ],
    modules: [
      {
        moduleId: " cmp ",
        kind: "CMP",
        surfaceId: "runtime.officialModuleSurface",
        contractId: "cmp.contract",
      },
    ],
    capabilities: [
      {
        capabilityId: "agent.invoke",
        surfaceId: "runtime.invocationMethod",
        scopes: ["runtime.invoke", "runtime.invoke"],
      },
    ],
    eventTopics: ["runtime.manifest.ready", "runtime.manifest.ready", "runtime.governance.plane.allow"],
  });

  assert.equal(runtimeManifestDescriptor.unsafeSideEffects, false);
  assert.equal(runtimeManifestDescriptor.schemaFrozen, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected runtime manifest to succeed");
  }

  assert.equal(result.manifest.runtimeId, "runtime:alpha");
  assert.equal(result.manifest.caller.id, "app:studio");
  assert.equal(result.manifest.caller.sessionId, "session:1");
  assert.equal(result.manifest.manifestSurface, "runtime.manifest");
  assert.equal(result.manifest.manifestVersion, "draft-1");
  assert.equal(result.manifest.ready, true);
  assert.deepEqual(result.manifest.surfaceIds, [
    "runtime.contractSurface",
    "runtime.governancePlane",
    "runtime.invocationMethod",
    "runtime.inspection",
  ]);
  assert.deepEqual(result.manifest.requiredSurfaceIds, [
    "runtime.contractSurface",
    "runtime.governancePlane",
    "runtime.invocationMethod",
  ]);
  assert.deepEqual(result.manifest.surfaces[0]?.capabilities, ["contract.check"]);
  assert.deepEqual(result.manifest.acceptedScopes, ["manifest:read", "runtime.inspect"]);
  assert.deepEqual(result.manifest.modules[0], {
    moduleId: "cmp",
    kind: "CMP",
    surfaceId: "runtime.officialModuleSurface",
    mounted: true,
    ready: true,
    contractId: "cmp.contract",
  });
  assert.deepEqual(result.manifest.capabilities[0], {
    capabilityId: "agent.invoke",
    surfaceId: "runtime.invocationMethod",
    contractId: undefined,
    scopes: ["runtime.invoke"],
    ready: true,
  });
  assert.deepEqual(result.manifest.eventTopics, ["runtime.manifest.ready", "runtime.governance.plane.allow"]);
  assert.equal(result.manifest.contractChecked, true);
  assert.equal(result.manifest.governanceChecked, true);
  assert.equal(result.manifest.dryRun, true);
  assert.equal(result.manifest.unsafeSideEffects, false);
  assert.equal(result.manifest.schemaFrozen, false);
  assert.deepEqual(result.events, ["runtime.manifest.ready"]);
});

test("buildRuntimeManifest reports blocked but safe manifest snapshots", () => {
  const result = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "inspection", id: "inspection:probe" },
    surfaces: [
      { surfaceId: "runtime.contractSurface", kind: "contract-surface", required: true },
      { surfaceId: "runtime.governancePlane", kind: "governance-plane", required: true },
      { surfaceId: "runtime.invocationMethod", kind: "invocation-method", required: true, ready: false },
    ],
    modules: [{ moduleId: "tap", kind: "TAP", mounted: false }],
    capabilities: [{ capabilityId: "agent.invoke", surfaceId: "runtime.invocationMethod", ready: false }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected a blocked manifest snapshot instead of a thrown failure");
  }

  assert.equal(result.manifest.ready, false);
  assert.deepEqual(
    result.manifest.blockingIssues.map((issue) => issue.code),
    ["SURFACE_NOT_READY", "MODULE_NOT_MOUNTED", "CAPABILITY_SURFACE_MISSING"],
  );
  assert.equal(result.manifest.blockingIssues[0]?.boundary, "runtime-state");
  assert.equal(result.manifest.blockingIssues[1]?.boundary, "manifest");
  assert.deepEqual(result.events, ["runtime.manifest.blocked"]);
});

test("buildRuntimeManifest rejects missing input, unsafe runtime, gates, scopes, and malformed manifest entries", () => {
  const missingRuntime = buildRuntimeManifest();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
    assert.equal(missingRuntime.error.internalDetailExposed, false);
  }

  const runtimeNotReady = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "application", id: "app:studio" },
    runtimeReady: false,
    surfaces: [],
  });
  assert.equal(runtimeNotReady.ok, false);
  if (!runtimeNotReady.ok) {
    assert.equal(runtimeNotReady.error.code, "RUNTIME_NOT_READY");
    assert.equal(runtimeNotReady.error.boundary, "runtime-state");
  }

  const governanceRejected = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "official-module", id: "cmp:module", moduleId: "cmp" },
    surfaces: [{ surfaceId: "runtime.contractSurface", kind: "contract-surface" }],
    governance: { accepted: false, reason: "manifest scope denied" },
  });
  assert.equal(governanceRejected.ok, false);
  if (!governanceRejected.ok) {
    assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(governanceRejected.error.message, "manifest scope denied");
  }

  const contractRejected = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "debug", id: "debug:probe" },
    surfaces: [{ surfaceId: "runtime.contractSurface", kind: "contract-surface" }],
    contract: { accepted: false, reason: "manifest contract mismatch" },
  });
  assert.equal(contractRejected.ok, false);
  if (!contractRejected.ok) {
    assert.equal(contractRejected.error.code, "CONTRACT_REJECTED");
    assert.equal(contractRejected.error.boundary, "contract");
  }

  const scopeDenied = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "application", id: "app:studio" },
    requestedScopes: ["manifest:read", "manifest:private"],
    allowedScopes: ["manifest:read"],
    surfaces: [
      { surfaceId: "runtime.contractSurface", kind: "contract-surface" },
      { surfaceId: "runtime.governancePlane", kind: "governance-plane" },
      { surfaceId: "runtime.invocationMethod", kind: "invocation-method" },
    ],
  });
  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
    assert.equal(scopeDenied.error.boundary, "scope");
  }

  const missingRequired = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "application", id: "app:studio" },
    surfaces: [
      { surfaceId: "runtime.contractSurface", kind: "contract-surface" },
      { surfaceId: "runtime.governancePlane", kind: "governance-plane" },
    ],
  });
  assert.equal(missingRequired.ok, false);
  if (!missingRequired.ok) {
    assert.equal(missingRequired.error.code, "REQUIRED_SURFACE_MISSING");
    assert.equal(missingRequired.error.boundary, "manifest");
  }

  const duplicateSurface = buildRuntimeManifest({
    runtimeId: "runtime:alpha",
    caller: { kind: "application", id: "app:studio" },
    requiredSurfaceIds: ["runtime.contractSurface"],
    surfaces: [
      { surfaceId: "runtime.contractSurface", kind: "contract-surface" },
      { surfaceId: "runtime.contractSurface", kind: "contract-surface" },
    ],
  });
  assert.equal(duplicateSurface.ok, false);
  if (!duplicateSurface.ok) {
    assert.equal(duplicateSurface.error.code, "DUPLICATE_SURFACE_ID");
    assert.equal(duplicateSurface.error.boundary, "manifest");
  }
});
