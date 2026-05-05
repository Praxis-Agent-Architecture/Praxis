import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { probeDebugContract } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.debug/debugContractProbe.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.debug/debugContractProbe.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.debug/debugContractProbe.md",
  testFileUrl: import.meta.url,
});

test("debugContractProbe returns a readonly contract report without side effects", () => {
  const result = probeDebugContract({
    runtimeId: " runtime:alpha ",
    caller: { kind: "application", id: " app-1 " },
    expectations: [
      {
        contractId: " runtime.public ",
        surface: " runtime.applicationSurface ",
        satisfied: true,
      },
    ],
    requestedScopes: ["runtime.debug"],
    grantedScopes: ["runtime.debug"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.runtimeId, "runtime:alpha");
  assert.equal(result.report.caller.id, "app-1");
  assert.equal(result.report.status, "satisfied");
  assert.equal(result.report.checkedContracts[0]?.contractId, "runtime.public");
  assert.equal(result.report.readonly, true);
  assert.equal(result.report.unsafeSideEffects, false);
});

test("debugContractProbe rejects failed required contracts as contract errors", () => {
  const result = probeDebugContract({
    runtimeId: "runtime:alpha",
    caller: { kind: "debug", id: "debugger" },
    expectations: [
      {
        contractId: "runtime.governed",
        surface: "runtime.governancePlane",
        satisfied: false,
        reason: "governance gate was skipped",
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "CONTRACT_VIOLATED");
  assert.equal(result.error.boundary, "contract");
  assert.equal(result.error.publicSafe, true);
});

test("debugContractProbe reports missing debug scopes without mutating runtime state", () => {
  const result = probeDebugContract({
    runtimeId: "runtime:alpha",
    caller: { kind: "inspection", id: "inspector" },
    requestedScopes: ["runtime.debug.contract"],
    grantedScopes: [],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.status, "violated");
  assert.deepEqual(result.report.missingScopes, ["runtime.debug.contract"]);
  assert.deepEqual(result.events, ["runtime.debug.contractProbe.violated"]);
});
