import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeCapabilityContract } from "../../../../src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeCapabilityContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeCapabilityContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeCapabilityContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeCapabilityContract defines a governed capability surface without executing it", () => {
  const result = defineRuntimeCapabilityContract({
    runtimeId: " runtime:alpha ",
    contractId: " contract:capability ",
    capabilityId: " agent.reply ",
    kind: "agent",
    requestedScope: "application.invoke",
    allowedScopes: [{ name: "application.invoke", source: "applicationSurface" }],
    inputBoundary: [" promptPack ", "promptPack", "governanceContext"],
    outputBoundary: ["runtimeResult", " runtimeEvent "],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.capability.runtimeId, "runtime:alpha");
  assert.equal(result.capability.contractId, "contract:capability");
  assert.equal(result.capability.capabilityId, "agent.reply");
  assert.equal(result.capability.kind, "agent");
  assert.deepEqual(result.capability.scope, { name: "application.invoke", source: "applicationSurface" });
  assert.deepEqual(result.capability.inputBoundary, ["promptPack", "governanceContext"]);
  assert.deepEqual(result.capability.outputBoundary, ["runtimeResult", "runtimeEvent"]);
  assert.equal(result.capability.requiresRuntimeGovernance, true);
  assert.equal(result.capability.unsafeSideEffects, false);
});

test("runtimeCapabilityContract rejects missing kind, denied scope, and governance failures", () => {
  const missingKind = defineRuntimeCapabilityContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:capability",
    capabilityId: "agent.reply",
  });

  assert.equal(missingKind.ok, false);
  if (missingKind.ok) {
    return;
  }

  assert.equal(missingKind.error.code, "MISSING_CAPABILITY_KIND");
  assert.equal(missingKind.error.boundary, "input");

  const deniedScope = defineRuntimeCapabilityContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:capability",
    capabilityId: "agent.reply",
    kind: "agent",
    requestedScope: "debug.raw-provider",
    allowedScopes: [{ name: "application.invoke", source: "applicationSurface" }],
  });

  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    return;
  }

  assert.equal(deniedScope.error.code, "CAPABILITY_SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");

  const rejected = defineRuntimeCapabilityContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:capability",
    capabilityId: "agent.reply",
    kind: "agent",
    governance: { accepted: false, reason: "official module not mounted" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "official module not mounted");
});
