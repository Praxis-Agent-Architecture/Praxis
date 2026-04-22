import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { mountAgentApplication } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentApplicationMount.md",
  testFileUrl: import.meta.url,
});

test("mountAgentApplication accepts a minimal ready runtime mount", () => {
  const result = mountAgentApplication({
    applicationId: "app.main",
    runtimeId: "spec:agent",
    requestedCapabilities: ["invoke", "invoke", " observe "],
    eventSubscriptions: ["output", " output "],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.record, {
    mountId: "spec:agent:app.main",
    applicationId: "app.main",
    runtimeId: "spec:agent",
    lifecycleState: "mounted",
    acceptedCapabilities: ["invoke", "observe"],
    eventSubscriptions: ["output"],
    governanceState: "accepted",
  });
  assert.deepEqual(result.events, ["application.mount.accepted"]);
});

test("mountAgentApplication returns classified input and governance failures", () => {
  assert.deepEqual(mountAgentApplication({ applicationId: "", runtimeId: "runtime" }), {
    ok: false,
    error: {
      code: "MISSING_APPLICATION_ID",
      message: "applicationId is required before mounting an application",
      boundary: "input",
    },
    events: ["application.mount.rejected"],
  });

  assert.deepEqual(
    mountAgentApplication({
      applicationId: "app.main",
      runtimeId: "runtime",
      governance: { accepted: false, reason: "scope denied" },
    }),
    {
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: "scope denied",
        boundary: "governance",
      },
      events: ["application.mount.rejected"],
    },
  );
});
