import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { receiveExternalCommand } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalCommandReceiver.js";
import { guardExternalControl } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlGuard.js";
import {
  externalControlAuditDescriptor,
  recordExternalControlAudit,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlAudit.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlAudit.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.externalControl/externalControlAudit.md",
  testFileUrl: import.meta.url,
});

function allowedCommandAndDecision() {
  const received = receiveExternalCommand({
    runtimeId: "runtime-1",
    commandKind: "read",
    commandName: "runtime.status",
    caller: { kind: "operator", id: "ops" },
    target: { surface: "inspection", operation: "runtime.status" },
    requestedEffects: ["read-runtime"],
  });
  if (!received.ok) {
    assert.fail(received.error.message);
  }
  assert.equal(received.ok, true);

  const guarded = guardExternalControl({
    command: received.command,
    grantedScopes: ["runtime.read"],
  });
  if (!guarded.ok) {
    assert.fail(guarded.error.message);
  }
  assert.equal(guarded.ok, true);

  return { command: received.command, decision: guarded.decision };
}

test("recordExternalControlAudit records replayable dry-run external control evidence", () => {
  const { command, decision } = allowedCommandAndDecision();
  const result = recordExternalControlAudit({
    command,
    guardDecision: decision,
    evidenceRefs: [" runtime.read ", "runtime.read"],
    occurredAt: "2026-04-23T00:49:24.010Z",
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }
  assert.equal(result.ok, true);

  assert.equal(externalControlAuditDescriptor.unsafeSideEffects, false);
  assert.equal(result.entry.runtimeId, "runtime-1");
  assert.equal(result.entry.actor.id, "ops");
  assert.equal(result.entry.outcome, "allowed");
  assert.equal(result.entry.subject, "runtime.status");
  assert.equal(result.entry.decisionStatus, "allow");
  assert.deepEqual(result.entry.evidenceRefs, ["runtime.read"]);
  assert.equal(result.entry.replayable, true);
  assert.equal(result.entry.safeForInspection, true);
  assert.equal(result.entry.unsafeSideEffects, false);
  assert.deepEqual(result.replay.entries, result.trail);
});

test("recordExternalControlAudit appends and rejects invalid audit input", () => {
  const first = recordExternalControlAudit({
    runtimeId: "runtime-1",
    actor: { kind: "runtime-surface", id: "runtime.externalControl" },
    subject: "runtime.status",
    outcome: "received",
  });
  if (!first.ok) {
    assert.fail(first.error.message);
  }
  assert.equal(first.ok, true);

  const second = recordExternalControlAudit({
    runtimeId: "runtime-1",
    actor: { kind: "runtime-surface", id: "runtime.externalControl" },
    subject: "runtime.status",
    outcome: "blocked",
    previousEntries: first.trail,
  });
  if (!second.ok) {
    assert.fail(second.error.message);
  }
  assert.equal(second.ok, true);

  assert.equal(second.trail.length, 2);
  assert.equal(second.entry.auditId, "runtime-1:external-control:runtime.status:2");

  const missing = recordExternalControlAudit();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty audit input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.internalDetailExposed, false);
});
