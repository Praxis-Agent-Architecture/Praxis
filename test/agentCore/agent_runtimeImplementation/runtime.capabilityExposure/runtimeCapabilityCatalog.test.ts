import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeCapabilityCatalog } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.md",
  testFileUrl: import.meta.url,
});

test("runtimeCapabilityCatalog builds an audience-filtered dry catalog", () => {
  const result = buildRuntimeCapabilityCatalog({
    runtimeId: " runtime:alpha ",
    audience: "application",
    capabilities: [
      {
        capabilityId: " agent.invoke ",
        kind: "agent",
        surfaceId: "runtime.invocationMethod.agentInvocationEntrypoint",
        scopes: [" runtime.invoke ", "runtime.invoke"],
        audiences: ["application"],
        contract: {
          contractId: " contract:agent.invoke ",
          inputBoundary: ["promptPack", " governanceContext "],
          outputBoundary: ["runtimeResult"],
        },
      },
      {
        capabilityId: "tap.approval",
        kind: "tool",
        audiences: ["official-module"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.catalog.runtimeId, "runtime:alpha");
  assert.equal(result.catalog.catalogSurface, "runtime.capabilityExposure");
  assert.equal(result.catalog.unsafeSideEffects, false);
  assert.equal(result.catalog.capabilities.length, 1);
  assert.deepEqual(result.catalog.capabilities[0]?.scopes, ["runtime.invoke"]);
  assert.equal(result.catalog.capabilities[0]?.contract?.contractId, "contract:agent.invoke");
});

test("runtimeCapabilityCatalog classifies missing and duplicate capability input", () => {
  const missingRuntime = buildRuntimeCapabilityCatalog();

  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    return;
  }

  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const duplicate = buildRuntimeCapabilityCatalog({
    runtimeId: "runtime:alpha",
    capabilities: [
      { capabilityId: "model.invoke", kind: "model" },
      { capabilityId: " model.invoke ", kind: "model" },
    ],
  });

  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    return;
  }

  assert.equal(duplicate.error.code, "DUPLICATE_CAPABILITY_ID");
  assert.equal(duplicate.error.boundary, "catalog");
  assert.equal(duplicate.error.internalDetailExposed, false);
});
