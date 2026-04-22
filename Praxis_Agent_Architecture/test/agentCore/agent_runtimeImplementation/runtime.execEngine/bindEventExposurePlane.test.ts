import assert from "node:assert/strict";
import test from "node:test";

import { bindEventExposurePlane } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindEventExposurePlane.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.execEngine/bindEventExposurePlane.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.execEngine/bindEventExposurePlane.md",
  testFileUrl: import.meta.url,
});

test("bindEventExposurePlane exposes observable runtime event channels", () => {
  const result = bindEventExposurePlane({
    runtimeId: "runtime-alpha",
    eventChannels: [" input.received ", "ui", "ui"],
    caller: { kind: "inspection", id: " debug-snapshot " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected event exposure plane binding to be accepted");
  }

  assert.equal(result.binding.bindingKind, "eventExposurePlane");
  assert.equal(result.binding.bindingId, "runtime.execEngine.eventExposurePlane");
  assert.deepEqual(result.binding.capabilities, ["event.input.received", "event.ui"]);
  assert.deepEqual(result.binding.caller, { kind: "inspection", id: "debug-snapshot" });
  assert.equal(result.binding.governanceRequired, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindEventExposurePlane classifies missing runtime and scope failures", () => {
  const missingRuntime = bindEventExposurePlane();
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime id to fail");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const deniedScope = bindEventExposurePlane({
    runtimeId: "runtime-alpha",
    requestedScopes: ["events.subscribe", "events.publish"],
    allowedScopes: ["events.subscribe"],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");
});
