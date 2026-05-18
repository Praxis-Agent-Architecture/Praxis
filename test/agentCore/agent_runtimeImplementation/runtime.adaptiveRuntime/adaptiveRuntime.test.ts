import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  DEFAULT_ADAPTIVE_RUNTIME_ACTIONS,
  planAdaptiveRuntimeAdjustment,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveRuntime.md",
  testFileUrl: import.meta.url,
});

test("adaptiveRuntime keeps a ready runtime stable when no signal requires adjustment", () => {
  const result = planAdaptiveRuntimeAdjustment({
    runtimeId: " runtime-1 ",
    runtimeReady: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.decision.runtimeId, "runtime-1");
  assert.equal(result.decision.status, "stable");
  assert.equal(result.decision.selectedAction.kind, "keep-current");
  assert.equal(result.decision.selectedAction.dryRun, true);
  assert.equal(result.decision.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.adaptiveRuntime.stable"]);
});

test("adaptiveRuntime plans provider fallback from a critical provider-health signal", () => {
  const result = planAdaptiveRuntimeAdjustment({
    runtimeId: "runtime-1",
    runtimeReady: true,
    signals: [
      {
        kind: "provider-health",
        severity: "critical",
        target: "modelAdapter.primary",
        message: "primary provider is unhealthy",
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.decision.status, "adjustment-planned");
  assert.deepEqual(result.decision.selectedAction, {
    kind: "provider-fallback",
    target: "modelAdapter.primary",
    reason: "primary provider is unhealthy",
    guardedBy: ["runtime.contractSurface", "runtime.governancePlane"],
    dryRun: true,
  });
  assert.deepEqual(result.decision.auditTrail, [
    "runtime.adaptiveRuntime.input.accepted",
    "runtime.adaptiveRuntime.contract.checked",
    "runtime.adaptiveRuntime.governance.checked",
    "runtime.adaptiveRuntime.dryRun.enforced",
  ]);
});

test("adaptiveRuntime rejects governance, contract, and not-ready runtime failures", () => {
  assert.deepEqual(
    planAdaptiveRuntimeAdjustment({
      runtimeId: "runtime-1",
      contract: { accepted: false, reason: "contract probe failed" },
    }),
    {
      ok: false,
      error: {
        code: "CONTRACT_REJECTED",
        message: "contract probe failed",
        boundary: "contract",
        publicSafe: true,
      },
      events: ["runtime.adaptiveRuntime.rejected"],
    },
  );

  assert.deepEqual(
    planAdaptiveRuntimeAdjustment({
      runtimeId: "runtime-1",
      governance: { accepted: false, reason: "fallback requires approval" },
    }),
    {
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: "fallback requires approval",
        boundary: "governance",
        publicSafe: true,
      },
      events: ["runtime.adaptiveRuntime.rejected"],
    },
  );

  assert.deepEqual(
    planAdaptiveRuntimeAdjustment({
      runtimeId: "runtime-1",
      runtimeReady: false,
    }),
    {
      ok: false,
      error: {
        code: "RUNTIME_NOT_READY",
        message: "adaptive runtime can only plan against a ready runtime",
        boundary: "runtime-state",
        publicSafe: true,
      },
      events: ["runtime.adaptiveRuntime.rejected"],
    },
  );
});

test("adaptiveRuntime keeps signal and action boundaries narrow", () => {
  const unsupported = planAdaptiveRuntimeAdjustment({
    runtimeId: "runtime-1",
    signals: [{ kind: "exec-engine-direct-mutation", severity: "critical" }],
  });

  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.code, "UNSUPPORTED_SIGNAL");
  assert.equal(unsupported.error.boundary, "input");

  const scopeRejected = planAdaptiveRuntimeAdjustment({
    runtimeId: "runtime-1",
    signals: [{ kind: "provider-health", severity: "warning" }],
    allowedActions: ["tune-resource"],
  });

  assert.equal(scopeRejected.ok, false);
  assert.equal(scopeRejected.error.code, "ADAPTATION_SCOPE_REJECTED");
  assert.equal(scopeRejected.error.boundary, "scope");
  assert.ok(DEFAULT_ADAPTIVE_RUNTIME_ACTIONS.includes("provider-fallback"));
});
