import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  externalCommandReceiverDescriptor,
  receiveExternalCommand,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalCommandReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalCommandReceiver.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.externalControl/externalCommandReceiver.md",
  testFileUrl: import.meta.url,
});

test("receiveExternalCommand normalizes an external command into a dry-run envelope", () => {
  const result = receiveExternalCommand({
    runtimeId: " runtime-1 ",
    commandId: " command-1 ",
    commandKind: "diagnostic",
    commandName: " inspect.health ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    target: { surface: "inspection", operation: " runtime.health " },
    requestedEffects: ["inspect-runtime", "inspect-runtime"],
    payload: { depth: "shallow" },
    trace: { correlationId: " corr-1 " },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }
  assert.equal(result.ok, true);

  assert.equal(externalCommandReceiverDescriptor.unsafeSideEffects, false);
  assert.equal(result.command.surface, "runtime.externalControl");
  assert.equal(result.command.mode, "dry-run");
  assert.equal(result.command.runtimeId, "runtime-1");
  assert.equal(result.command.commandName, "inspect.health");
  assert.equal(result.command.caller.id, "app-1");
  assert.equal(result.command.target.operation, "runtime.health");
  assert.deepEqual(result.command.requestedEffects, ["inspect-runtime"]);
  assert.deepEqual(result.command.payloadKeys, ["depth"]);
  assert.equal(result.command.audit.unsafeSideEffects, false);
});

test("receiveExternalCommand classifies missing input and governance rejection", () => {
  const missing = receiveExternalCommand();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty external command input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForInspection, true);

  const rejected = receiveExternalCommand({
    runtimeId: "runtime-1",
    commandName: "inspect.health",
    caller: { kind: "operator", id: "ops" },
    target: { surface: "inspection" },
    governance: { accepted: false, reason: "external operator not allowed" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    assert.fail("governance rejection must stop command receive");
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.internalDetailExposed, false);
});
