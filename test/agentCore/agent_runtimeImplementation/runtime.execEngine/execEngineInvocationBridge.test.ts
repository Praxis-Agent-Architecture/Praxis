import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bridgeExecEngineInvocation } from "../../../../src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.md",
  testFileUrl: import.meta.url,
});

test("execEngineInvocationBridge plans dry-run invocation envelopes", () => {
  const result = bridgeExecEngineInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "invocationMethod" },
    invocation: {
      invocationId: "invoke-1",
      kind: "tool",
      target: "shell.run",
      payload: { commandRef: "cmd:1" },
      auditRef: "audit:1",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.plan, {
    bridgeId: "runtime-1:invocation:invoke-1",
    runtimeId: "runtime-1",
    invocationId: "invoke-1",
    caller: { kind: "runtime-surface", id: "invocationMethod" },
    kind: "tool",
    target: "shell.run",
    payload: { commandRef: "cmd:1" },
    route: "runtime.execEngine.invocationBridge",
    auditRef: "audit:1",
    guard: "dry-run-envelope",
    contractChecked: true,
    governanceChecked: true,
    dryRun: true,
    unsafeSideEffects: false,
  });
});

test("execEngineInvocationBridge rejects unsafe real execution requests", () => {
  const result = bridgeExecEngineInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    invocation: {
      invocationId: "invoke-tool-1",
      kind: "tool",
      target: "patch.apply",
      dryRun: false,
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "UNSAFE_SIDE_EFFECT_REQUESTED");
  assert.equal(result.error.boundary, "bridge");
  assert.equal(result.error.publicSafe, true);
});
