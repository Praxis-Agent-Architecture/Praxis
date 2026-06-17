import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationApprovalSmoke,
} from "../../examples/scripts/runtime_application_approval_smoke.js";

test("application approval smoke routes runtime approval through the application surface", async () => {
  const result = await runApplicationApprovalSmoke({
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application approval smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.providerCalls, 2);
  assert.equal(result.approval.requested, true);
  assert.equal(result.approval.decided, true);
  assert.equal(result.approval.feature, "shell");
  assert.equal(result.approval.featureKey, "shell.run");
  assert.equal(result.approval.riskLevel, "dangerous");
  assert.equal(result.approval.requestedScopes.includes("tool.shell.run"), true);
  assert.equal(result.approval.finalDecision, "approve");
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-approval-shell-call");
  assert.equal(result.providerRoundTrip.outputIncludesStdout, true);
  assert.equal(result.toolEvent.toolId, "shell.run");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.policyProfile, "standard");
  assert.equal(result.toolEvent.sandboxMode, "workspace-rollback");
  assert.equal(result.toolEvent.commandSandboxApplied, true);
  assert.equal(result.governance.reportStatus, "ok");
  assert.equal(result.governance.applicationCommandKind, "praxis.application.governanceReport");
  assert.equal(result.governance.applicationQueryItems, 1);
  assert.equal(result.governance.pendingApprovals, 0);
  assert.equal(result.governance.approvedApprovals, 1);
  assert.equal(result.governance.policyDecisions, 1);
  assert.equal(result.governance.interfaceApprovalEnvelopes, 1);
  assert.equal(result.governance.shellPolicyDecisions, 1);
  assert.equal(result.governance.approvalQueryItems, 1);
  assert.equal(result.governance.publicSafe, true);
  assert.equal(result.toolCallReport.reportStatus, "ok");
  assert.equal(result.toolCallReport.applicationCommandKind, "praxis.application.toolCallReport");
  assert.equal(result.toolCallReport.applicationQueryToolCalls, 1);
  assert.equal(result.toolCallReport.toolInvocations, 1);
  assert.equal(result.toolCallReport.completed, 1);
  assert.equal(result.toolCallReport.policyDecisions, 1);
  assert.equal(result.toolCallReport.dependencyPreflights, 1);
  assert.equal(result.toolCallReport.approvals, 1);
  assert.equal(result.toolCallReport.shellToolCalls, 1);
  assert.equal(result.toolCallReport.approvedToolCalls, 1);
  assert.equal(result.toolCallReport.workspaceRollbackRequired, 1);
  assert.equal(result.toolCallReport.sandboxMode, "workspace-rollback");
  assert.equal(result.toolCallReport.policyProfile, "standard");
  assert.equal(result.toolCallReport.approvalStatus, "approved");
  assert.equal(result.toolCallReport.publicSafe, true);
  assert.equal(result.events.some((event) => event.includes(":awaiting-approval")), true);
  assert.equal(result.events.some((event) => event.includes(":approve")), true);
  assert.equal(result.events.includes("tool:shell.run:completed"), true);
  assert.equal(result.events.includes("final"), true);
});
