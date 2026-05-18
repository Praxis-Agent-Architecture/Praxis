import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planOfficialModuleLifecycleTransition } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleLifecyclePort.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleLifecyclePort.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleLifecyclePort.md",
  testFileUrl: import.meta.url,
});

test("planOfficialModuleLifecycleTransition creates reversible dry-run lifecycle plans", () => {
  const join = planOfficialModuleLifecycleTransition({
    runtimeId: "runtime-1",
    moduleId: "cmp.main",
    moduleKind: "cmp",
    action: "join",
    currentPhase: "detached",
  });

  assert.equal(join.ok, true);
  if (!join.ok) {
    return;
  }

  assert.equal(join.plan.from, "detached");
  assert.equal(join.plan.to, "attached");
  assert.equal(join.plan.rollbackPhase, "detached");
  assert.equal(join.plan.dispatch, "dry-run");
  assert.equal(join.plan.unsafeSideEffects, false);

  const pause = planOfficialModuleLifecycleTransition({
    runtimeId: "runtime-1",
    moduleId: "cmp.main",
    moduleKind: "cmp",
    action: "pause",
    currentPhase: "attached",
  });

  assert.equal(pause.ok, true);
  assert.equal(pause.plan.to, "paused");
});

test("planOfficialModuleLifecycleTransition rejects invalid lifecycle boundaries", () => {
  const invalidTransition = planOfficialModuleLifecycleTransition({
    runtimeId: "runtime-1",
    moduleId: "mp.main",
    moduleKind: "mp",
    action: "resume",
    currentPhase: "detached",
  });

  assert.equal(invalidTransition.ok, false);
  assert.equal(invalidTransition.error.code, "INVALID_LIFECYCLE_TRANSITION");
  assert.equal(invalidTransition.error.boundary, "runtime-state");

  const governanceRejected = planOfficialModuleLifecycleTransition({
    runtimeId: "runtime-1",
    moduleId: "mp.main",
    moduleKind: "mp",
    action: "join",
    governance: { accepted: false, reason: "module scope denied" },
  });

  assert.equal(governanceRejected.ok, false);
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.internalDetailExposed, false);
});
