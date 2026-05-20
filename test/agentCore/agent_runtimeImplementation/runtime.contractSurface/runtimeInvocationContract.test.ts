import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeInvocationContract } from "../../../../src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeInvocationContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeInvocationContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeInvocationContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeInvocationContract builds a dry-run invocation envelope", () => {
  const result = defineRuntimeInvocationContract({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    target: "tool",
    requestedCapabilities: [" shellBase ", "codeBase", "shellBase"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.invocation.runtimeId, "runtime-1");
  assert.equal(result.invocation.caller.id, "app-1");
  assert.equal(result.invocation.target, "tool");
  assert.equal(result.invocation.route, "runtime.invocationMethod");
  assert.deepEqual(result.invocation.requestedCapabilities, ["shellBase", "codeBase"]);
  assert.equal(result.invocation.dryRun, true);
  assert.equal(result.invocation.unsafeSideEffects, false);
});

test("runtimeInvocationContract rejects unsupported targets before routing", () => {
  const result = defineRuntimeInvocationContract({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    target: "provider-direct",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNSUPPORTED_TARGET");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.invocationSafe, true);
});

test("runtimeInvocationContract keeps contract rejection classified", () => {
  const result = defineRuntimeInvocationContract({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "invocationMethod" },
    target: "agent",
    contract: { accepted: false, reason: "capability missing" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CONTRACT_REJECTED");
  assert.equal(result.error.boundary, "contract");
  assert.equal(result.error.message, "capability missing");
});
