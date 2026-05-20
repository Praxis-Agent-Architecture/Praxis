import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeInternalContract } from "../../../../src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeInternalContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.contractSurface/runtimeInternalContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeInternalContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeInternalContract exposes audited internal scopes without mutation", () => {
  const result = defineRuntimeInternalContract({
    runtimeId: " runtime-1 ",
    consumer: { surface: "inspection", id: " inspect-1 " },
    requestedScopes: [" stateSnapshot ", "eventTrail", "stateSnapshot"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.contract.runtimeId, "runtime-1");
  assert.equal(result.contract.consumer.id, "inspect-1");
  assert.deepEqual(result.contract.grantedScopes, ["stateSnapshot", "eventTrail"]);
  assert.equal(result.contract.auditRequired, true);
  assert.equal(result.contract.mutationAllowed, false);
  assert.equal(result.contract.unsafeSideEffects, false);
});

test("runtimeInternalContract rejects direct mutation requests", () => {
  const result = defineRuntimeInternalContract({
    runtimeId: "runtime-1",
    consumer: { surface: "debug", id: "debugger" },
    allowMutation: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "DIRECT_MUTATION_FORBIDDEN");
  assert.equal(result.error.boundary, "contract");
  assert.equal(result.error.internalSafe, true);
});

test("runtimeInternalContract keeps not-ready runtime failures on the runtime-state boundary", () => {
  const result = defineRuntimeInternalContract({
    runtimeId: "runtime-1",
    consumer: { surface: "governancePlane", id: "policy" },
    runtimeReady: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "RUNTIME_NOT_READY");
  assert.equal(result.error.boundary, "runtime-state");
});
