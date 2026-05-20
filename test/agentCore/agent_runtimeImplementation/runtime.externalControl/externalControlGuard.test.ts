import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { receiveExternalCommand } from "../../../../src/runtimeImplementation/runtime.externalControl/externalCommandReceiver.js";
import {
  externalControlGuardDescriptor,
  guardExternalControl,
} from "../../../../src/runtimeImplementation/runtime.externalControl/externalControlGuard.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.externalControl/externalControlGuard.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlGuard.md",
  testFileUrl: import.meta.url,
});

function receivedCommand() {
  const received = receiveExternalCommand({
    runtimeId: "runtime-1",
    commandKind: "invoke",
    commandName: "tool.shell.preview",
    caller: { kind: "official-module", id: "tap", moduleId: "tap" },
    target: { surface: "invocationMethod", operation: "toolInvocationEntrypoint" },
    requestedEffects: ["invoke-tool"],
  });

  if (!received.ok) {
    assert.fail(received.error.message);
  }
  assert.equal(received.ok, true);

  return received.command;
}

test("guardExternalControl allows scoped dry-run external control effects", () => {
  const result = guardExternalControl({
    command: receivedCommand(),
    grantedScopes: ["tool.invoke", "runtime.read"],
    allowedEffects: ["invoke-tool"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }
  assert.equal(result.ok, true);

  assert.equal(externalControlGuardDescriptor.unsafeSideEffects, false);
  assert.equal(result.decision.status, "allow");
  assert.deepEqual(result.decision.requiredScopes, ["tool.invoke"]);
  assert.deepEqual(result.decision.allowedEffects, ["invoke-tool"]);
  assert.equal(result.decision.canInvokeTool, true);
  assert.equal(result.decision.canInvokeModel, false);
  assert.equal(result.decision.dryRun, true);
  assert.equal(result.decision.unsafeSideEffects, false);
});

test("guardExternalControl rejects missing scope and disallowed effects", () => {
  const denied = guardExternalControl({
    command: receivedCommand(),
    grantedScopes: ["runtime.read"],
    allowedEffects: ["invoke-tool"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("missing tool.invoke scope must be rejected");
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.equal(denied.error.internalDetailExposed, false);

  const effectDenied = guardExternalControl({
    command: receivedCommand(),
    grantedScopes: ["tool.invoke"],
    allowedEffects: ["inspect-runtime"],
  });

  assert.equal(effectDenied.ok, false);
  if (effectDenied.ok) {
    assert.fail("effect outside allowedEffects must be rejected");
  }

  assert.equal(effectDenied.error.code, "EFFECT_NOT_ALLOWED");
  assert.equal(effectDenied.error.boundary, "scope");
});
