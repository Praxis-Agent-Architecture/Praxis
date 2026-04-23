import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createCustomInterfaceRuntimeBridge } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/customInterfaceRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/customInterfaceRuntimeBridge.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/customInterfaceRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("createCustomInterfaceRuntimeBridge plans runtime mediated custom interface channels", () => {
  const result = createCustomInterfaceRuntimeBridge({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    bridgeId: " bridge-1 ",
    customInterfaceId: " crm-interface ",
    channels: [
      { channel: "definition", target: " customInterfaceLayer " },
      { channel: "invocation", target: " invocationMethod " },
      { channel: "inspection", target: " runtime.inspection " },
    ],
    traceId: " trace-1 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.bridgeId, "bridge-1");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.customInterfaceId, "crm-interface");
  assert.equal(result.plan.route, "runtime.interfaceAdapter.customInterfaceRuntimeBridge");
  assert.deepEqual(result.plan.channelNames, ["definition", "invocation", "inspection"]);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.mockableEnvelope, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("createCustomInterfaceRuntimeBridge rejects empty channels and unavailable runtime paths", () => {
  const empty = createCustomInterfaceRuntimeBridge({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bridgeId: "bridge-1",
    customInterfaceId: "crm-interface",
    channels: [{ channel: " ", target: " " }],
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_BRIDGE_CHANNELS");
  assert.equal(empty.error.boundary, "bridge");

  const unavailable = createCustomInterfaceRuntimeBridge({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bridgeId: "bridge-1",
    customInterfaceId: "crm-interface",
    channels: [{ channel: "invocation", target: "invocationMethod" }],
    channelAvailability: { invocation: false },
  });

  assert.equal(unavailable.ok, false);
  if (unavailable.ok) {
    return;
  }

  assert.equal(unavailable.error.code, "CHANNEL_UNAVAILABLE");
  assert.equal(unavailable.error.boundary, "runtime-state");
});
