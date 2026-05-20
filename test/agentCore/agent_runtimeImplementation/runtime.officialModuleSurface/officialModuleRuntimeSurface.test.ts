import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialModuleRuntimeSurface } from "../../../../src/agentCore_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.md",
  testFileUrl: import.meta.url,
});

test("createOfficialModuleRuntimeSurface exposes a governed dry-run entry for official modules", () => {
  const result = createOfficialModuleRuntimeSurface({
    runtimeId: "runtime-1",
    moduleId: "tap.main",
    moduleKind: "tap",
    requestedCapabilities: ["tool.invoke", "tool.invoke", " "],
    requestedEvents: ["runtime.tool.requested"],
    requestedScopes: ["runtime.read", "tool.invoke"],
    grantedRuntimeScopes: ["runtime.read", "tool.invoke"],
    inheritedRuntimePolicyId: "runtime.policy.standard",
    modulePolicyExtensions: ["tap.tool.policy"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.surface.entrySurface, "runtime.officialModuleSurface");
  assert.equal(result.surface.dispatch, "dry-run");
  assert.equal(result.surface.unsafeSideEffects, false);
  assert.deepEqual(result.surface.requestedCapabilities, ["tool.invoke"]);
  assert.deepEqual(result.surface.grantedRuntimeScopes, ["runtime.read", "tool.invoke"]);
  assert.equal(result.surface.policy.inheritsRuntimePolicy, true);
  assert.equal(result.surface.policy.canBypassRuntimePolicy, false);
  assert.equal(result.surface.policy.inheritedRuntimePolicyId, "runtime.policy.standard");
  assert.equal(result.surface.bridgeAccess.events, "runtime.officialModuleSurface.officialModuleEventBus");
  assert.equal(result.surface.bridgeAccess.state, "runtime.officialModuleSurface.officialModuleStateBridge");
  assert.equal(result.surface.bridgeAccess.invocation, "runtime.invocationMethod");
  assert.equal(result.surface.hiddenResourceAccess, false);
  assert.equal(result.surface.canRequestCapability("tool.invoke"), true);
  assert.equal(result.surface.canRequestCapability("model.invoke"), false);
  assert.equal(result.surface.canSubscribeEvent("runtime.tool.requested"), true);
  assert.equal(result.surface.canUseScope("tool.invoke"), true);
  assert.equal(result.surface.canUseScope("internal.secret"), false);
});

test("createOfficialModuleRuntimeSurface classifies invalid and rejected entry requests", () => {
  const missingRuntime = createOfficialModuleRuntimeSurface({
    runtimeId: "",
    moduleId: "cmp.main",
    moduleKind: "cmp",
  });

  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");
  assert.equal(missingRuntime.error.internalDetailExposed, false);

  const scopeDenied = createOfficialModuleRuntimeSurface({
    runtimeId: "runtime-1",
    moduleId: "cmp.main",
    moduleKind: "cmp",
    requestedScopes: ["runtime.state", "internal.secret"],
    grantedRuntimeScopes: ["runtime.state"],
  });

  assert.equal(scopeDenied.ok, false);
  assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
  assert.equal(scopeDenied.error.boundary, "scope");
  assert.equal(scopeDenied.error.internalDetailExposed, false);

  const governanceRejected = createOfficialModuleRuntimeSurface({
    runtimeId: "runtime-1",
    moduleId: "cmp.main",
    moduleKind: "cmp",
    governance: { accepted: false, reason: "scope denied" },
  });

  assert.equal(governanceRejected.ok, false);
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.boundary, "governance");
});
