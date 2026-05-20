import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS,
  defineOfficialModuleCapabilityContract,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleCapabilityContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleCapabilityContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleCapabilityContract.md",
  testFileUrl: import.meta.url,
});

test("defineOfficialModuleCapabilityContract grants only requested capabilities inside the official module contract", () => {
  const result = defineOfficialModuleCapabilityContract({
    runtimeId: "runtime-1",
    moduleId: "cmp-main",
    moduleKind: "CMP",
    requestedCapabilities: [
      { capabilityId: "runtime.context", channel: "read" },
      { capabilityId: "runtime.invocation", channel: "invoke" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.contract.runtimeId, "runtime-1");
  assert.equal(result.contract.moduleId, "cmp-main");
  assert.equal(result.contract.moduleKind, "CMP");
  assert.equal(result.contract.contractSurface, "runtime.officialModuleSurface");
  assert.equal(result.contract.requiresRuntimeGovernance, true);
  assert.equal(result.contract.moduleStrategyImplemented, false);
  assert.equal(result.contract.unsafeSideEffects, false);
  assert.deepEqual(result.contract.grantedCapabilities, [
    { capabilityId: "runtime.context", channel: "read" },
    { capabilityId: "runtime.invocation", channel: "invoke" },
  ]);
  assert.deepEqual(result.contract.allowedCapabilities, DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS.CMP);
});

test("defineOfficialModuleCapabilityContract rejects missing input, runtime state, and scope violations", () => {
  const missingModule = defineOfficialModuleCapabilityContract({
    runtimeId: "runtime-1",
    moduleKind: "MP",
  });

  assert.equal(missingModule.ok, false);
  assert.equal(missingModule.error.code, "MISSING_MODULE_ID");
  assert.equal(missingModule.error.boundary, "input");

  const notReady = defineOfficialModuleCapabilityContract({
    runtimeId: "runtime-1",
    moduleId: "mp-main",
    moduleKind: "MP",
    runtimeReady: false,
  });

  assert.equal(notReady.ok, false);
  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");

  const denied = defineOfficialModuleCapabilityContract({
    runtimeId: "runtime-1",
    moduleId: "cmp-main",
    moduleKind: "CMP",
    requestedCapabilities: [{ capabilityId: "runtime.memory", channel: "invoke" }],
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "CAPABILITY_NOT_GRANTED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.internalDetailExposed, false);
});

test("defineOfficialModuleCapabilityContract rejects malformed capability requests before scope checks", () => {
  const missingCapabilityId = defineOfficialModuleCapabilityContract({
    runtimeId: "runtime-1",
    moduleId: "cmp-main",
    moduleKind: "CMP",
    requestedCapabilities: [{ capabilityId: " ", channel: "read" }],
  });

  assert.equal(missingCapabilityId.ok, false);
  assert.equal(missingCapabilityId.error.code, "MISSING_CAPABILITY_ID");
  assert.equal(missingCapabilityId.error.boundary, "input");

  const missingCapabilityChannel = defineOfficialModuleCapabilityContract({
    runtimeId: "runtime-1",
    moduleId: "cmp-main",
    moduleKind: "CMP",
    requestedCapabilities: [{ capabilityId: "runtime.context" } as never],
  });

  assert.equal(missingCapabilityChannel.ok, false);
  assert.equal(missingCapabilityChannel.error.code, "MISSING_CAPABILITY_CHANNEL");
  assert.equal(missingCapabilityChannel.error.boundary, "input");
});
