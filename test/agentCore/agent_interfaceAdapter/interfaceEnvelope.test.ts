import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalInterfaceEnvelope,
  createInterfaceEnvelope,
} from "../../../src/agentCore/index.js";

test("interface envelope carries approval and runtime events to application surfaces", () => {
  const approval = approvalInterfaceEnvelope({
    approvalId: "approval.1",
    runtimeId: "runtime.interface",
    sessionId: "session.interface",
    payload: {
      reason: "tool requires approval",
      requestedScopes: ["tool.shell.commandExecution"],
    },
  });

  assert.equal(approval.ok, true);
  if (!approval.ok) return;
  assert.equal(approval.envelope.kind, "approval");
  assert.equal(approval.envelope.surface, "application");
  assert.equal(approval.envelope.publicSafe, true);
  assert.equal(approval.envelope.sessionId, "session.interface");

  const state = createInterfaceEnvelope({
    envelopeId: "state.1",
    kind: "state",
    surface: "tui",
    runtimeId: "runtime.interface",
    payload: { phase: "waitingApproval" },
  });

  assert.equal(state.ok, true);
  if (state.ok) {
    assert.equal(state.envelope.surface, "tui");
  }
});

test("interface envelope rejects unsafe payloads before leaving agentCore", () => {
  const result = createInterfaceEnvelope({
    envelopeId: "unsafe.1",
    kind: "debug",
    surface: "application",
    runtimeId: "runtime.interface",
    payload: { rawSecret: "should-not-leave" },
    publicSafe: false,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "UNSAFE_PAYLOAD");
    assert.equal(result.error.publicSafe, true);
  }
});
