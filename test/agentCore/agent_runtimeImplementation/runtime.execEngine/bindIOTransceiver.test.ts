import assert from "node:assert/strict";
import test from "node:test";

import { bindIOTransceiver } from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/bindIOTransceiver.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.execEngine/bindIOTransceiver.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/bindIOTransceiver.md",
  testFileUrl: import.meta.url,
});

test("bindIOTransceiver exposes input and output channels through runtime", () => {
  const result = bindIOTransceiver({
    runtimeId: "runtime-alpha",
    ioChannels: [" text ", "image", "text"],
    mountedModule: { id: " io-transceiver ", ready: true, version: " v0 " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected IO transceiver binding to be accepted");
  }

  assert.equal(result.binding.bindingKind, "ioTransceiver");
  assert.equal(result.binding.bindingId, "runtime.execEngine.ioTransceiver");
  assert.deepEqual(result.binding.capabilities, ["inputReceiver", "outputExposer", "io.text", "io.image"]);
  assert.deepEqual(result.binding.mountedModule, { id: "io-transceiver", ready: true, version: "v0" });
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
});

test("bindIOTransceiver rejects unready modules and governance denial", () => {
  const unreadyModule = bindIOTransceiver({
    runtimeId: "runtime-alpha",
    mountedModule: { id: "io-transceiver", ready: false },
  });
  assert.equal(unreadyModule.ok, false);
  if (unreadyModule.ok) {
    throw new Error("expected unready module rejection");
  }
  assert.equal(unreadyModule.error.code, "MODULE_NOT_MOUNTED");
  assert.equal(unreadyModule.error.boundary, "runtime-state");

  const governanceRejected = bindIOTransceiver({
    runtimeId: "runtime-alpha",
    governance: { accepted: false, reason: "IO exposure denied" },
  });
  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.message, "IO exposure denied");
  assert.equal(governanceRejected.error.boundary, "governance");
});
