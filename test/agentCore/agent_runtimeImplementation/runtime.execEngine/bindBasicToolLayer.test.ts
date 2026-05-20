import assert from "node:assert/strict";
import test from "node:test";

import { bindBasicToolLayer } from "../../../../src/runtimeImplementation/runtime.execEngine/bindBasicToolLayer.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.execEngine/bindBasicToolLayer.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/bindBasicToolLayer.md",
  testFileUrl: import.meta.url,
});

test("bindBasicToolLayer exposes tool primitives as a dry-run binding", () => {
  const result = bindBasicToolLayer({
    runtimeId: "runtime-alpha",
    toolKinds: [" shell ", "git", "shell"],
    requestedScopes: ["tool.shell.audit"],
    allowedScopes: ["tool.shell.audit"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected basic tool layer binding to be accepted");
  }

  assert.equal(result.binding.bindingKind, "basicToolLayer");
  assert.equal(result.binding.bindingId, "runtime.execEngine.basicToolLayer");
  assert.deepEqual(result.binding.capabilities, ["baseToolEnvelope", "dryRunGuard", "auditTrail", "tool.shell", "tool.git"]);
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.execEngine.basicToolLayer.binding.accepted"]);
});

test("bindBasicToolLayer rejects unsafe runtime and governance states without invoking tools", () => {
  const unmounted = bindBasicToolLayer({
    runtimeId: "runtime-alpha",
    moduleMounted: false,
  });
  assert.equal(unmounted.ok, false);
  if (unmounted.ok) {
    throw new Error("expected unmounted module rejection");
  }
  assert.equal(unmounted.error.code, "MODULE_NOT_MOUNTED");
  assert.equal(unmounted.error.boundary, "runtime-state");

  const contractRejected = bindBasicToolLayer({
    runtimeId: "runtime-alpha",
    contract: { accepted: false, reason: "tool layer contract missing audit port" },
  });
  assert.equal(contractRejected.ok, false);
  if (contractRejected.ok) {
    throw new Error("expected contract rejection");
  }
  assert.equal(contractRejected.error.code, "CONTRACT_REJECTED");
  assert.equal(contractRejected.error.message, "tool layer contract missing audit port");
  assert.equal(contractRejected.error.boundary, "contract");
});
