import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCapabilityExposureRuntimeSnapshot } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityExposureRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityExposureRuntime.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityExposureRuntime.md",
  testFileUrl: import.meta.url,
});

test("capabilityExposureRuntime composes catalog, availability, and contracts in a dry snapshot", () => {
  const result = createCapabilityExposureRuntimeSnapshot({
    runtimeId: "runtime:alpha",
    audience: "application",
    requestedScopes: ["runtime.invoke"],
    capabilities: [
      {
        capabilityId: "agent.invoke",
        kind: "agent",
        scopes: ["runtime.invoke"],
        audiences: ["application"],
        contract: {
          contractId: "contract:agent.invoke",
          inputBoundary: ["promptPack"],
          outputBoundary: ["runtimeResult"],
        },
      },
      {
        capabilityId: "tap.approval",
        kind: "tool",
        audiences: ["official-module"],
        contract: { contractId: "contract:tap.approval" },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposure.runtimeSurface, "runtime.capabilityExposure");
  assert.equal(result.exposure.unsafeSideEffects, false);
  assert.equal(result.exposure.catalog.capabilities.length, 1);
  assert.equal(result.exposure.availability.length, 1);
  assert.equal(result.exposure.availability[0]?.status, "available");
  assert.equal(result.exposure.contracts.length, 1);
  assert.equal(result.exposure.contracts[0]?.contractId, "contract:agent.invoke");
  assert.deepEqual(result.exposure.contractErrors, []);
});

test("capabilityExposureRuntime keeps contract errors observable without executing adjacent modules", () => {
  const result = createCapabilityExposureRuntimeSnapshot({
    runtimeId: "runtime:alpha",
    capabilityIds: ["tool.shell", "missing.capability"],
    requestedScopes: ["tool.invoke"],
    capabilities: [
      {
        capabilityId: "tool.shell",
        kind: "tool",
        scopes: ["tool.invoke"],
        mounted: false,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposure.availability.length, 1);
  assert.equal(result.exposure.availability[0]?.status, "unavailable");
  assert.deepEqual(
    result.exposure.contractErrors.map((error) => error.code),
    ["CONTRACT_NOT_DECLARED", "CAPABILITY_NOT_REGISTERED"],
  );
  assert.equal(result.exposure.governanceChecked, true);
  assert.match(result.events.join("\n"), /runtime\.capability\.availability\.rejected/);
});
