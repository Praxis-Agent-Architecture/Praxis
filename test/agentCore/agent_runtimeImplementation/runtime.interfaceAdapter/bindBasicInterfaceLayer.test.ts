import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { bindBasicInterfaceLayer } from "../../../../src/agentCore_runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.md",
  testFileUrl: import.meta.url,
});

test("bindBasicInterfaceLayer binds official interface refs without executing module strategy", () => {
  const result = bindBasicInterfaceLayer({
    runtimeId: " runtime-1 ",
    caller: { kind: "official-module", id: " cmp-main ", moduleId: " cmp-main " },
    basicInterfaceLayer: {
      id: " basic-layer-1 ",
      interfaces: [
        { kind: "CMP", interfaceId: " cmp-interface ", ruleRef: " governance-rule-1 " },
        { kind: "TAP", interfaceId: " tap-interface " },
      ],
      metadata: { owner: "runtime.interfaceAdapter" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.binding.bindingId, "runtime-1:basicInterfaceLayer:basic-layer-1");
  assert.equal(result.binding.route, "runtime.interfaceAdapter.basicInterfaceLayer");
  assert.deepEqual(result.binding.interfaceKinds, ["CMP", "TAP"]);
  assert.equal(result.binding.interfaces[0]?.ruleRef, "governance-rule-1");
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindBasicInterfaceLayer rejects missing input and governance failures with stable errors", () => {
  assert.deepEqual(bindBasicInterfaceLayer(), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "basicInterfaceLayer binding requires a runtimeId",
      boundary: "input",
      publicSafe: true,
    },
    events: ["runtime.interfaceAdapter.basicInterfaceLayer.rejected"],
  });

  const rejected = bindBasicInterfaceLayer({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap-main" },
    basicInterfaceLayer: {
      id: "basic-layer-1",
      interfaces: [{ kind: "TAP", interfaceId: "tap-interface" }],
    },
    governance: { accepted: false, reason: "interface outside runtime governance scope" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.message, "interface outside runtime governance scope");
});
