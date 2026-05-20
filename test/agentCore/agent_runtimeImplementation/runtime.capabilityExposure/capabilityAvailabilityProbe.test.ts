import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { probeCapabilityAvailability } from "../../../../src/runtimeImplementation/runtime.capabilityExposure/capabilityAvailabilityProbe.js";
import { buildRuntimeCapabilityCatalog } from "../../../../src/runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.capabilityExposure/capabilityAvailabilityProbe.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityAvailabilityProbe.md",
  testFileUrl: import.meta.url,
});

test("capabilityAvailabilityProbe reports available, unavailable, and denied states without executing capabilities", () => {
  const catalogResult = buildRuntimeCapabilityCatalog({
    runtimeId: "runtime:alpha",
    capabilities: [
      { capabilityId: "agent.invoke", kind: "agent", scopes: ["runtime.invoke"] },
      { capabilityId: "tool.shell", kind: "tool", scopes: ["tool.invoke"], mounted: false },
    ],
  });

  assert.equal(catalogResult.ok, true);
  if (!catalogResult.ok) {
    return;
  }

  const available = probeCapabilityAvailability({
    runtimeId: "runtime:alpha",
    capabilityId: "agent.invoke",
    catalog: catalogResult.catalog,
    requestedScopes: ["runtime.invoke"],
  });

  assert.equal(available.ok, true);
  if (!available.ok) {
    return;
  }

  assert.equal(available.availability.status, "available");
  assert.equal(available.availability.unsafeSideEffects, false);

  const unavailable = probeCapabilityAvailability({
    runtimeId: "runtime:alpha",
    capabilityId: "tool.shell",
    catalog: catalogResult.catalog,
    requestedScopes: ["tool.invoke"],
  });

  assert.equal(unavailable.ok, true);
  if (!unavailable.ok) {
    return;
  }

  assert.equal(unavailable.availability.status, "unavailable");
  assert.match(unavailable.availability.reasons.join("\n"), /not mounted/);

  const denied = probeCapabilityAvailability({
    runtimeId: "runtime:alpha",
    capabilityId: "agent.invoke",
    catalog: catalogResult.catalog,
    requestedScopes: ["debug.raw-provider"],
  });

  assert.equal(denied.ok, true);
  if (!denied.ok) {
    return;
  }

  assert.equal(denied.availability.status, "denied");
  assert.deepEqual(denied.availability.missingScopes, ["debug.raw-provider"]);
});

test("capabilityAvailabilityProbe rejects invalid runtime and catalog boundaries", () => {
  const missing = probeCapabilityAvailability();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const catalogResult = buildRuntimeCapabilityCatalog({
    runtimeId: "runtime:alpha",
    capabilities: [{ capabilityId: "agent.invoke", kind: "agent" }],
  });

  assert.equal(catalogResult.ok, true);
  if (!catalogResult.ok) {
    return;
  }

  const mismatch = probeCapabilityAvailability({
    runtimeId: "runtime:beta",
    capabilityId: "agent.invoke",
    catalog: catalogResult.catalog,
  });

  assert.equal(mismatch.ok, false);
  if (mismatch.ok) {
    return;
  }

  assert.equal(mismatch.error.code, "CATALOG_RUNTIME_MISMATCH");
  assert.equal(mismatch.error.boundary, "catalog");
});
