import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimePublicContract } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimePublicContract.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimePublicContract.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimePublicContract.md",
  testFileUrl: import.meta.url,
});

test("runtimePublicContract accepts a minimal public caller without side effects", () => {
  const result = defineRuntimePublicContract({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
  });

  assert.equal(result.ok, true);
  assert.equal(result.contract.runtimeId, "runtime-1");
  assert.equal(result.contract.caller.id, "app-1");
  assert.equal(result.contract.exposure, "public");
  assert.equal(result.contract.readonly, true);
  assert.equal(result.contract.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.publicContract.accepted"]);
});

test("runtimePublicContract rejects empty input with a public-safe error", () => {
  const result = defineRuntimePublicContract();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.publicSafe, true);
});

test("runtimePublicContract keeps governance rejection classified", () => {
  const result = defineRuntimePublicContract({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    governance: { accepted: false, reason: "scope denied" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
  assert.equal(result.error.message, "scope denied");
});
