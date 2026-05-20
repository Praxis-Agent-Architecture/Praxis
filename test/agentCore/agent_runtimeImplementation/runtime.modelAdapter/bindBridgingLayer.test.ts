import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bindBridgingLayer } from "../../../../src/agentCore_runtimeImplementation/runtime.modelAdapter/bindBridgingLayer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.modelAdapter/bindBridgingLayer.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/bindBridgingLayer.md",
  testFileUrl: import.meta.url,
});

test("bindBridgingLayer exposes internal model capabilities without provider field leakage", () => {
  const result = bindBridgingLayer({
    runtimeId: " runtime-1 ",
    caller: { kind: "official-module", id: " cmp ", moduleId: " cmp " },
    bridgingLayer: {
      id: " bridge-layer-1 ",
      capabilities: [
        { kind: "text-generation", ref: " model-capability:text ", abstractionRef: " capability:responses " },
        { kind: "streaming", ref: " model-capability:stream " },
      ],
      metadata: { visibleTo: "agentCore" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.binding.bindingId, "runtime-1:bridgingLayer:bridge-layer-1");
  assert.equal(result.binding.route, "runtime.modelAdapter.bridgingLayer");
  assert.deepEqual(result.binding.capabilityKinds, ["text-generation", "streaming"]);
  assert.equal(result.binding.capabilities[0]?.abstractionRef, "capability:responses");
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindBridgingLayer rejects missing bridged capabilities and contract failures", () => {
  const empty = bindBridgingLayer({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bridgingLayer: { id: "bridge-layer-1", capabilities: [] },
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_BRIDGED_CAPABILITIES");
  assert.equal(empty.error.boundary, "binding");

  const rejected = bindBridgingLayer({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    bridgingLayer: {
      id: "bridge-layer-1",
      capabilities: [{ kind: "tool-call", ref: "model-capability:tool-call" }],
    },
    contract: { accepted: false, reason: "bridged capability contract is incomplete" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "CONTRACT_REJECTED");
  assert.equal(rejected.error.message, "bridged capability contract is incomplete");
});
