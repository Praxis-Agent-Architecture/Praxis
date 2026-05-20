import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { bindCustomInterfaceLayer } from "../../../../src/runtimeImplementation/runtime.interfaceAdapter/bindCustomInterfaceLayer.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.interfaceAdapter/bindCustomInterfaceLayer.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/bindCustomInterfaceLayer.md",
  testFileUrl: import.meta.url,
});

test("bindCustomInterfaceLayer records custom interface contracts as a runtime mediated layer", () => {
  const result = bindCustomInterfaceLayer({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    customInterfaceLayer: {
      id: " custom-layer-1 ",
      source: "application",
      definitions: [
        {
          interfaceId: " crm-interface ",
          contractRef: " contract.crm.v1 ",
          lifecycle: " registered ",
          ruleRef: " rule.crm.readonly ",
        },
        { interfaceId: " planner-interface ", contractRef: " contract.planner.v1 " },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.binding.bindingId, "runtime-1:customInterfaceLayer:custom-layer-1");
  assert.equal(result.binding.route, "runtime.interfaceAdapter.customInterfaceLayer");
  assert.deepEqual(result.binding.interfaceIds, ["crm-interface", "planner-interface"]);
  assert.deepEqual(result.binding.contractRefs, ["contract.crm.v1", "contract.planner.v1"]);
  assert.equal(result.binding.definitions[0]?.lifecycle, "registered");
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindCustomInterfaceLayer rejects missing definitions and contract failures", () => {
  const empty = bindCustomInterfaceLayer({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    customInterfaceLayer: {
      id: "custom-layer-1",
      definitions: [{ interfaceId: " ", contractRef: " " }],
    },
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_CUSTOM_INTERFACES");
  assert.equal(empty.error.boundary, "binding");

  const rejected = bindCustomInterfaceLayer({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    customInterfaceLayer: {
      id: "custom-layer-1",
      definitions: [{ interfaceId: "crm-interface", contractRef: "contract.crm.v1" }],
    },
    contract: { accepted: false, reason: "custom interface contract has not been approved" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "CONTRACT_REJECTED");
  assert.equal(rejected.error.boundary, "contract");
  assert.equal(rejected.error.message, "custom interface contract has not been approved");
});
