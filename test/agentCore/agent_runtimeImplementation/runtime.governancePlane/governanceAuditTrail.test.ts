import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { recordGovernanceAuditTrail } from "../../../../src/agentCore_runtimeImplementation/runtime.governancePlane/governanceAuditTrail.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.governancePlane/governanceAuditTrail.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/governanceAuditTrail.md",
  testFileUrl: import.meta.url,
});

test("governanceAuditTrail records replayable governance evidence without side effects", () => {
  const result = recordGovernanceAuditTrail({
    runtimeId: " runtime-1 ",
    actor: { kind: "official-module", id: " tap " },
    action: "approval",
    subject: " tool.shell.write ",
    summary: " TAP approved dry-run shell envelope ",
    evidenceRefs: [" policy:tool-write ", "policy:tool-write"],
    occurredAt: "2026-04-22T13:46:56.379Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.entry.runtimeId, "runtime-1");
  assert.equal(result.entry.actor.id, "tap");
  assert.equal(result.entry.subject, "tool.shell.write");
  assert.deepEqual(result.entry.evidenceRefs, ["policy:tool-write"]);
  assert.equal(result.entry.replayable, true);
  assert.equal(result.entry.internalDetailExposed, false);
  assert.equal(result.trail.length, 1);
  assert.deepEqual(result.replay.entries, result.trail);
  assert.deepEqual(result.events, ["runtime.governance.auditTrail.recorded"]);
});

test("governanceAuditTrail appends to an existing in-memory trail", () => {
  const first = recordGovernanceAuditTrail({
    runtimeId: "runtime-1",
    actor: { kind: "application", id: "app-1" },
    action: "pass",
    subject: "agent.invoke",
  });
  assert.equal(first.ok, true);

  const second = recordGovernanceAuditTrail({
    runtimeId: "runtime-1",
    actor: { kind: "runtime-surface", id: "governancePlane" },
    action: "reject",
    subject: "internal.state.write",
    previousEntries: first.trail,
  });

  assert.equal(second.ok, true);
  assert.equal(second.trail.length, 2);
  assert.equal(second.entry.summary, "governance reject recorded for internal.state.write");
  assert.equal(second.entry.auditId, "runtime-1:reject:internal.state.write:2");
});

test("governanceAuditTrail returns classified failures for invalid audit input", () => {
  const missing = recordGovernanceAuditTrail();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const noSubject = recordGovernanceAuditTrail({
    runtimeId: "runtime-1",
    actor: { kind: "operator", id: "ops" },
    action: "exception",
    subject: "",
  });
  assert.equal(noSubject.ok, false);
  assert.equal(noSubject.error.code, "MISSING_SUBJECT");
  assert.equal(noSubject.error.safeForInspection, true);
});
