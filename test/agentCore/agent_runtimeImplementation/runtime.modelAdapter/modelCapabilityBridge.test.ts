import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bridgeModelCapabilities } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelCapabilityBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelCapabilityBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelCapabilityBridge.md",
  testFileUrl: import.meta.url,
});

test("modelCapabilityBridge exposes bridged model capabilities without provider details", () => {
  const result = bridgeModelCapabilities({
    runtimeId: " runtime-1 ",
    caller: { kind: "official-module", id: " cmp ", moduleId: " cmp " },
    allowedScopes: ["model.invoke", "model.stream"],
    capabilities: [
      {
        capabilityId: " capability:text ",
        kind: "text-generation",
        bridgeRef: " bridgingLayer:text ",
        scopes: ["model.invoke", " model.stream "],
      },
      {
        capabilityId: "capability:tool",
        kind: "tool-call",
        bridgeRef: "bridgingLayer:tool",
        invocationSurface: "modelInvocationRuntime",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.bridge.bridgeId, "runtime-1:modelCapabilityBridge");
  assert.equal(result.bridge.route, "runtime.modelAdapter.modelCapabilityBridge");
  assert.deepEqual(result.bridge.capabilityIds, ["capability:text", "capability:tool"]);
  assert.deepEqual(result.bridge.capabilityKinds, ["text-generation", "tool-call"]);
  assert.deepEqual(result.bridge.grantedScopes, ["model.invoke", "model.stream"]);
  assert.equal(result.bridge.capabilities[0]?.invocationSurface, "modelInvocationRuntime");
  assert.equal(result.bridge.dryRun, true);
  assert.equal(result.bridge.unsafeSideEffects, false);
});

test("modelCapabilityBridge rejects duplicates and scope violations with public errors", () => {
  const duplicate = bridgeModelCapabilities({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    capabilities: [
      { capabilityId: "capability:text", kind: "text-generation", bridgeRef: "bridge:text" },
      { capabilityId: "capability:text", kind: "streaming", bridgeRef: "bridge:stream" },
    ],
  });

  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    return;
  }

  assert.equal(duplicate.error.code, "DUPLICATE_CAPABILITY_ID");
  assert.equal(duplicate.error.boundary, "bridge");

  const denied = bridgeModelCapabilities({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    allowedScopes: ["model.invoke"],
    capabilities: [
      {
        capabilityId: "capability:admin",
        kind: "text-generation",
        bridgeRef: "bridge:admin",
        scopes: ["model.admin"],
      },
    ],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
