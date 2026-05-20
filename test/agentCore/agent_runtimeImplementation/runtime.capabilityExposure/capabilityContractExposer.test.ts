import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeCapabilityContract } from "../../../../src/agentCore_runtimeImplementation/runtime.capabilityExposure/capabilityContractExposer.js";
import { buildRuntimeCapabilityCatalog } from "../../../../src/agentCore_runtimeImplementation/runtime.capabilityExposure/runtimeCapabilityCatalog.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.capabilityExposure/capabilityContractExposer.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.capabilityExposure/capabilityContractExposer.md",
  testFileUrl: import.meta.url,
});

test("capabilityContractExposer returns only public runtime capability contract details", () => {
  const catalogResult = buildRuntimeCapabilityCatalog({
    runtimeId: "runtime:alpha",
    capabilities: [
      {
        capabilityId: "model.invoke",
        kind: "model",
        surfaceId: "runtime.modelAdapter.modelInvocationRuntime",
        scopes: ["model.invoke"],
        audiences: ["application", "official-module"],
        contract: {
          contractId: "contract:model.invoke",
          version: "v0",
          inputBoundary: ["promptPack", "modelCapability"],
          outputBoundary: ["modelResult", "runtimeEvent"],
          errorCodes: ["MODEL_UNAVAILABLE"],
        },
        metadata: { providerRawShape: "not public" },
      },
    ],
  });

  assert.equal(catalogResult.ok, true);
  if (!catalogResult.ok) {
    return;
  }

  const result = exposeCapabilityContract({
    runtimeId: "runtime:alpha",
    capabilityId: "model.invoke",
    catalog: catalogResult.catalog,
    audience: "application",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposedContract.contractId, "contract:model.invoke");
  assert.deepEqual(result.exposedContract.inputBoundary, ["promptPack", "modelCapability"]);
  assert.deepEqual(result.exposedContract.errorCodes, ["MODEL_UNAVAILABLE"]);
  assert.equal(result.exposedContract.rawProviderFieldsExposed, false);
  assert.equal("metadata" in result.exposedContract, false);
});

test("capabilityContractExposer rejects hidden and contractless capabilities", () => {
  const catalogResult = buildRuntimeCapabilityCatalog({
    runtimeId: "runtime:alpha",
    capabilities: [
      {
        capabilityId: "debug.trace",
        kind: "event",
        audiences: ["debug"],
        contract: { contractId: "contract:debug.trace" },
      },
      { capabilityId: "tool.shell", kind: "tool" },
    ],
  });

  assert.equal(catalogResult.ok, true);
  if (!catalogResult.ok) {
    return;
  }

  const hidden = exposeCapabilityContract({
    runtimeId: "runtime:alpha",
    capabilityId: "debug.trace",
    catalog: catalogResult.catalog,
    audience: "application",
  });

  assert.equal(hidden.ok, false);
  if (hidden.ok) {
    return;
  }

  assert.equal(hidden.error.code, "CAPABILITY_NOT_VISIBLE");
  assert.equal(hidden.error.boundary, "scope");

  const contractless = exposeCapabilityContract({
    runtimeId: "runtime:alpha",
    capabilityId: "tool.shell",
    catalog: catalogResult.catalog,
  });

  assert.equal(contractless.ok, false);
  if (contractless.ok) {
    return;
  }

  assert.equal(contractless.error.code, "CONTRACT_NOT_DECLARED");
  assert.equal(contractless.error.boundary, "contract");
});
