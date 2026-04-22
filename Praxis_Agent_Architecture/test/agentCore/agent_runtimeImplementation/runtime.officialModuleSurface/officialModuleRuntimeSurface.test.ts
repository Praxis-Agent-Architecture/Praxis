import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialModuleRuntimeSurface } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.md",
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
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.surface.entrySurface, "runtime.officialModuleSurface");
  assert.equal(result.surface.dispatch, "dry-run");
  assert.equal(result.surface.unsafeSideEffects, false);
  assert.deepEqual(result.surface.requestedCapabilities, ["tool.invoke"]);
  assert.equal(result.surface.canRequestCapability("tool.invoke"), true);
  assert.equal(result.surface.canRequestCapability("model.invoke"), false);
  assert.equal(result.surface.canSubscribeEvent("runtime.tool.requested"), true);
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
