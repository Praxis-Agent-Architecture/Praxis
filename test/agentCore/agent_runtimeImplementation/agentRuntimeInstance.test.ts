import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRuntimeInstanceSnapshot } from "../../../src/agentCore/agent_runtimeImplementation/agentRuntimeInstance.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/agentRuntimeInstance.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/agentRuntimeInstance.md",
  testFileUrl: import.meta.url,
});

test("createAgentRuntimeInstanceSnapshot exposes a ready dry-run runtime instance", () => {
  const result = createAgentRuntimeInstanceSnapshot({
    runtimeId: " runtime-1 ",
    agentId: " agent-main ",
    caller: "application",
    mountedSurfaces: [
      "runtime.contractSurface",
      "runtime.governancePlane",
      "runtime.invocationMethod",
      "runtime.invocationMethod",
    ],
    capabilityKeys: [" invoke ", "inspect", "invoke"],
    trace: { correlationId: " corr-1 ", sessionId: " session-1 " },
  });

  assert.equal(result.ok, true);
  assert.equal(result.instance.runtimeId, "runtime-1");
  assert.equal(result.instance.agentId, "agent-main");
  assert.equal(result.instance.caller, "application");
  assert.equal(result.instance.phase, "ready");
  assert.deepEqual(result.instance.requiredSurfaces, [
    "runtime.contractSurface",
    "runtime.governancePlane",
    "runtime.invocationMethod",
  ]);
  assert.deepEqual(result.instance.mountedSurfaces, [
    "runtime.contractSurface",
    "runtime.governancePlane",
    "runtime.invocationMethod",
  ]);
  assert.deepEqual(result.instance.capabilityKeys, ["invoke", "inspect"]);
  assert.deepEqual(result.instance.trace, { correlationId: "corr-1", sessionId: "session-1", callerId: undefined });
  assert.equal(result.instance.dryRun, true);
  assert.equal(result.instance.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["agentCore.runtime.instance.ready"]);
});

test("createAgentRuntimeInstanceSnapshot returns classified input, ready-state, surface, and gate failures", () => {
  const missingRuntime = createAgentRuntimeInstanceSnapshot({
    agentId: "agent-main",
    caller: "application",
  });
  assert.equal(missingRuntime.ok, false);
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const notReady = createAgentRuntimeInstanceSnapshot({
    runtimeId: "runtime-1",
    agentId: "agent-main",
    caller: "inspection",
    phase: "paused",
  });
  assert.equal(notReady.ok, false);
  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");

  const missingSurface = createAgentRuntimeInstanceSnapshot({
    runtimeId: "runtime-1",
    agentId: "agent-main",
    caller: "runtime",
    mountedSurfaces: ["runtime.contractSurface"],
  });
  assert.equal(missingSurface.ok, false);
  assert.equal(missingSurface.error.code, "SURFACE_NOT_MOUNTED");
  assert.equal(missingSurface.error.boundary, "scope");

  const rejected = createAgentRuntimeInstanceSnapshot({
    runtimeId: "runtime-1",
    agentId: "agent-main",
    caller: "official-module",
    mountedSurfaces: ["runtime.contractSurface", "runtime.governancePlane", "runtime.invocationMethod"],
    governance: { accepted: false, reason: "module scope denied" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "module scope denied");
  assert.equal(rejected.error.boundary, "governance");
});
