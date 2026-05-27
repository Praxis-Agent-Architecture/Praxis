import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalInterfaceEnvelope,
  bindBasicInterfaceLayer,
  createInterfaceEnvelope,
  createInterfaceAdapterRuntime,
  eventInterfaceEnvelope,
  managementInterfaceEnvelope,
  repairInterfaceEnvelope,
  stateInterfaceEnvelope,
} from "../../../src/agentCore/index.js";

test("interface envelope carries approval and runtime events to application surfaces", () => {
  const approval = approvalInterfaceEnvelope({
    approvalId: "approval.1",
    runtimeId: "runtime.interface",
    sessionId: "session.interface",
    payload: {
      reason: "tool requires approval",
      requestedScopes: ["tool.shell.run"],
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

test("interface envelope helpers cover event, state, management, and repair surfaces", () => {
  const event = eventInterfaceEnvelope({
    eventId: "event.1",
    runtimeId: "runtime.interface",
    sessionId: "session.interface",
    payload: { type: "runtime.test" },
  });
  const state = stateInterfaceEnvelope({
    stateId: "state.1",
    runtimeId: "runtime.interface",
    sessionId: "session.interface",
    payload: { phase: "testing" },
  });
  const management = managementInterfaceEnvelope({
    commandId: "command.1",
    runtimeId: "runtime.interface",
    sessionId: "session.interface",
    payload: { command: "inspect" },
  });
  const repair = repairInterfaceEnvelope({
    repairId: "repair.1",
    runtimeId: "runtime.interface",
    sessionId: "session.interface",
    payload: { action: "installDependency" },
  });

  assert.equal(event.ok, true);
  assert.equal(state.ok, true);
  assert.equal(management.ok, true);
  assert.equal(repair.ok, true);
  if (event.ok && state.ok && management.ok && repair.ok) {
    assert.equal(event.envelope.kind, "event");
    assert.equal(state.envelope.kind, "state");
    assert.equal(management.envelope.kind, "management");
    assert.equal(repair.envelope.kind, "repair");
  }
});

test("interface adapter runtime binds governed external surfaces", () => {
  const basic = bindBasicInterfaceLayer({
    runtimeId: "runtime.interface",
    caller: { kind: "application", id: "cli", sessionId: "session.interface" },
    basicInterfaceLayer: {
      id: "basic.interfaces",
      interfaces: [
        { kind: "TAP", interfaceId: "interface.tap.contract" },
        { kind: "CMP", interfaceId: "interface.cmp.contract" },
      ],
    },
    runtimeReady: true,
    contract: { accepted: true },
    governance: { accepted: true },
  });

  assert.equal(basic.ok, true);
  if (!basic.ok) return;

  const runtime = createInterfaceAdapterRuntime({
    runtimeId: "runtime.interface",
    caller: { kind: "application", id: "cli", sessionId: "session.interface" },
    bindings: [{
      surface: basic.binding.surface,
      bindingId: basic.binding.bindingId,
      ready: true,
      capabilities: ["approval.route", "state.observe"],
    }],
    requestedScopes: ["approval.route"],
    allowedScopes: ["approval.route"],
    runtimeReady: true,
    contract: { accepted: true },
    governance: { accepted: true },
  });

  assert.equal(runtime.ok, true);
  if (runtime.ok) {
    assert.equal(runtime.runtime.route, "runtime.interfaceAdapter");
    assert.deepEqual(runtime.runtime.grantedScopes, ["approval.route"]);
  }
});
