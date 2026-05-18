import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfficialPoolRuntimeBridge,
  officialPoolRuntimeBridgeDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/officialPoolRuntimeBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/officialPoolRuntimeBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.interfaceAdapter/officialPoolRuntimeBridge.md",
  testFileUrl: import.meta.url,
});

test("officialPoolRuntimeBridge plans official interface pool access through runtime interface adapter", () => {
  const result = createOfficialPoolRuntimeBridge({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " interface-adapter " },
    bridgeId: " official-bridge-1 ",
    requestedScopes: [" official.interface.bind ", "official.interface.inspect"],
    allowedScopes: ["official.interface.bind", "official.interface.inspect", "official.interface.audit"],
    officialPool: {
      poolId: " official-pool-1 ",
      modules: [
        {
          moduleId: " cmp-main ",
          moduleKind: "CMP",
          interfaceId: " cmp-interface ",
          ruleRef: " cmp-rule-1 ",
          bridgeChannels: [" interface ", "governance", "invocation"],
          requestedScopes: ["official.interface.bind"],
        },
        {
          moduleId: " tap-main ",
          moduleKind: "TAP",
          interfaceId: " tap-interface ",
          bridgeChannels: ["interface", "inspection"],
          requestedScopes: ["official.interface.inspect"],
        },
      ],
      metadata: { owner: "runtime.interfaceAdapter" },
    },
    traceId: " trace-1 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.bridgeId, "official-bridge-1");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.poolId, "official-pool-1");
  assert.equal(result.plan.route, "runtime.interfaceAdapter.officialPoolRuntimeBridge");
  assert.deepEqual(result.plan.moduleIds, ["cmp-main", "tap-main"]);
  assert.deepEqual(result.plan.moduleKinds, ["CMP", "TAP"]);
  assert.deepEqual(result.plan.interfaceIds, ["cmp-interface", "tap-interface"]);
  assert.deepEqual(result.plan.channelNames, ["interface", "governance", "invocation", "inspection"]);
  assert.equal(result.plan.modules[0]?.ruleRef, "cmp-rule-1");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.mockableEnvelope, true);
  assert.equal(result.plan.officialStrategyIncluded, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(officialPoolRuntimeBridgeDescriptor.unsafeSideEffects, false);
});

test("officialPoolRuntimeBridge rejects empty pools, denied module scopes, and unavailable channels", () => {
  const empty = createOfficialPoolRuntimeBridge({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "interface-adapter" },
    bridgeId: "official-bridge-1",
    officialPool: { poolId: "official-pool-1", modules: [] },
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_OFFICIAL_MODULES");
  assert.equal(empty.error.boundary, "bridge");

  const deniedScope = createOfficialPoolRuntimeBridge({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "interface-adapter" },
    bridgeId: "official-bridge-1",
    requestedScopes: ["official.interface.bind"],
    allowedScopes: ["official.interface.bind"],
    officialPool: {
      poolId: "official-pool-1",
      modules: [
        {
          moduleId: "cmp-main",
          moduleKind: "CMP",
          interfaceId: "cmp-interface",
          requestedScopes: ["official.interface.admin"],
        },
      ],
    },
  });

  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    return;
  }

  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
  assert.equal(deniedScope.error.boundary, "scope");

  const unavailable = createOfficialPoolRuntimeBridge({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "interface-adapter" },
    bridgeId: "official-bridge-1",
    officialPool: {
      poolId: "official-pool-1",
      modules: [
        {
          moduleId: "tap-main",
          moduleKind: "TAP",
          interfaceId: "tap-interface",
          bridgeChannels: ["invocation"],
        },
      ],
    },
    channelAvailability: { invocation: false },
  });

  assert.equal(unavailable.ok, false);
  if (unavailable.ok) {
    return;
  }

  assert.equal(unavailable.error.code, "CHANNEL_UNAVAILABLE");
  assert.equal(unavailable.error.boundary, "runtime-state");
});
