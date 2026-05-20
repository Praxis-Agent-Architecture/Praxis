import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createApplicationRuntimeContext } from "../../../../src/agentCore_runtimeImplementation/runtime.applicationSurface/applicationRuntimeContext.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.applicationSurface/applicationRuntimeContext.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationRuntimeContext.md",
  testFileUrl: import.meta.url,
});

test("applicationRuntimeContext exposes only controlled application-visible runtime context", () => {
  const result = createApplicationRuntimeContext({
    runtimeId: " runtime:alpha ",
    applicationId: " app:writer ",
    sessionId: " session:main ",
    capabilities: [
      { capabilityId: "invoke.agent", kind: "agent", visibility: "public" },
      { capabilityId: "provider.raw-state", kind: "model", visibility: "internal" },
    ],
    sessions: [{ sessionId: " session:main ", agentId: " agent:a ", status: "active" }],
    modes: [
      { modeId: "default", label: "Default" },
      { modeId: "safe", active: true },
    ],
    eventSubscriptions: ["runtime.output", "runtime.output", " runtime.error "],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.context.runtimeId, "runtime:alpha");
  assert.equal(result.context.applicationId, "app:writer");
  assert.deepEqual(result.context.capabilities, [{ capabilityId: "invoke.agent", kind: "agent" }]);
  assert.deepEqual(result.context.eventSubscriptions, ["runtime.output", "runtime.error"]);
  assert.equal(result.context.activeModeId, "safe");
  assert.equal(result.context.internalStateExposed, false);
});

test("applicationRuntimeContext rejects unready runtime and governance denial", () => {
  const unready = createApplicationRuntimeContext({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
    runtimeReady: false,
  });

  assert.equal(unready.ok, false);
  if (unready.ok) {
    return;
  }

  assert.equal(unready.error.code, "RUNTIME_NOT_READY");
  assert.equal(unready.error.boundary, "runtime-state");

  const rejected = createApplicationRuntimeContext({
    runtimeId: "runtime:alpha",
    applicationId: "app:writer",
    governance: { accepted: false },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
