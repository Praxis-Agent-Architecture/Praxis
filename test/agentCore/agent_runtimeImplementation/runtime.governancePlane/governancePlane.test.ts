import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeGovernanceIndex,
  createRuntimeGovernanceReport,
  queryRuntimeGovernance,
} from "../../../../src/runtimeImplementation/runtime.governancePlane/index.js";
import type { RuntimeSessionSnapshot } from "../../../../src/runtimeImplementation/runtimeSessionStateEventStore.js";

function snapshot(): RuntimeSessionSnapshot {
  return {
    session: {
      sessionId: "session.governance",
      runtimeId: "runtime.governance",
      agentId: "agent.governance",
      manifestHash: "manifest.hash",
      createdAt: "2026-06-09T00:00:00.000Z",
      status: "waitingApproval",
      metadata: { source: "test", accessToken: "secret-session-token" },
    },
    states: [],
    events: [
      {
        sessionId: "session.governance",
        eventId: "event:tool:approval-call:policy",
        type: "runtime.baseTool.policy.adjudicated",
        createdAt: "2026-06-09T00:00:01.000Z",
        payload: {
          toolId: "shell.run",
          policyMatrixId: "toolPolicy.test.standard",
          approvalScope: {
            scopeKey: "shell.run:command:rm",
            scopeKind: "command",
          },
          policyAdjudication: {
            kind: "runtime.execEngine.baseTool.policyAdjudication",
            toolId: "shell.run",
            profile: "standard",
            risk: "dangerous",
            action: "requiresApproval",
            humanApprovalMode: "always",
            humanApprovalRequired: true,
            humanApprovalScopeKey: "shell.run:command:rm",
            humanApprovalCacheHit: false,
            agentReviewMode: "never",
            agentReviewStatus: "notRequired",
            agentReviewRequired: false,
            sandboxRequired: true,
            sandboxStrength: "workspace-rollback",
            reason: "shell.run requires approval",
            publicSafe: true,
            events: ["runtime.baseTool.policy.requiresApproval"],
            metadata: { apiKey: "secret-policy-key" },
          },
          sandboxPlan: {
            effectiveMode: "workspace-rollback",
            secret: "secret-sandbox-material",
          },
        },
      },
      {
        sessionId: "session.governance",
        eventId: "event:interface:approval:approval.shell.1",
        type: "runtime.interfaceAdapter.approval.envelope",
        createdAt: "2026-06-09T00:00:02.000Z",
        payload: {
          envelope: {
            envelopeId: "interface.approval.shell.1",
            kind: "approval",
            payload: {
              approvalId: "approval.shell.1",
              source: "baseTool",
              requestedScopes: ["tool.execute", "tool.shell.run"],
              riskLevel: "dangerous",
              metadata: {
                toolId: "shell.run",
                approvalScopeKey: "shell.run:command:rm",
                token: "secret-interface-token",
              },
            },
          },
        },
      },
      {
        sessionId: "session.governance",
        eventId: "event:tool:approval-call:dependencies",
        type: "runtime.baseTool.dependencies.preflight",
        createdAt: "2026-06-09T00:00:03.000Z",
        payload: {
          toolId: "shell.run",
          dependencyPreflight: {
            status: "missing",
            decision: "requiresApproval",
            approvalRequiredDependencies: ["dep.shell"],
            installableDependencies: ["dep.shell"],
            credential: "secret-dependency-token",
          },
        },
      },
    ],
    invocations: [],
    mainLoopSteps: [],
    procedures: [],
    approvals: [
      {
        sessionId: "session.governance",
        approvalId: "approval.shell.1",
        status: "pending",
        reason: "shell.run requires approval",
        requestedScopes: ["tool.execute", "tool.shell.run", "approvalScope.shell.run:command:rm"],
        riskLevel: "dangerous",
        source: "baseTool",
        interfaceSurface: "application",
        createdAt: "2026-06-09T00:00:02.000Z",
        metadata: {
          toolId: "shell.run",
          approvalScopeKey: "shell.run:command:rm",
          policyMatrixId: "toolPolicy.test.standard",
          accessToken: "secret-approval-token",
        },
      },
      {
        sessionId: "session.governance",
        approvalId: "approval.model.1",
        status: "approved",
        reason: "model requested approval",
        requestedScopes: ["runtime.continue"],
        riskLevel: "risky",
        source: "model",
        interfaceSurface: "test-harness",
        createdAt: "2026-06-09T00:00:04.000Z",
        resolvedAt: "2026-06-09T00:00:05.000Z",
        resolution: {
          resolvedBy: "unit-test",
          secretToken: "secret-resolution-token",
        },
        metadata: { decisionId: "decision.model.1" },
      },
    ],
    errors: [],
  };
}

test("runtime governance report indexes approval and policy facts without owning approval flow", () => {
  const report = createRuntimeGovernanceReport({
    sourceKind: "in-memory",
    snapshot: snapshot(),
  });

  assert.equal(report.kind, "praxis.runtime.governance.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.session.sessionId, "session.governance");
  assert.equal(report.counts.approvals, 2);
  assert.equal(report.counts.pendingApprovals, 1);
  assert.equal(report.counts.approvedApprovals, 1);
  assert.equal(report.counts.policyDecisions, 1);
  assert.equal(report.counts.interfaceApprovalEnvelopes, 1);
  assert.equal(report.counts.dependencyPreflights, 1);
  assert.equal(report.counts.decisions, 5);
  assert.equal(report.coverage.hasApprovals, true);
  assert.equal(report.coverage.hasPolicyDecisions, true);
  assert.equal(report.coverage.hasInterfaceApprovalEnvelopes, true);

  const index = createRuntimeGovernanceIndex(report);
  assert.equal(index.byKind.approval, 2);
  assert.equal(index.byKind.baseToolPolicy, 1);
  assert.equal(index.byKind.interfaceApproval, 1);
  assert.equal(index.byKind.dependencyPreflight, 1);
  assert.equal(index.byStatus.pending, 2);
  assert.equal(index.byStatus.requiresApproval, 2);
  assert.equal(index.byToolId["shell.run"], 4);
  assert.equal(index.byRiskLevel.dangerous, 3);
  assert.equal(index.byPolicyProfile.standard, 1);
  assert.deepEqual(index.pendingApprovalIds, ["approval.shell.1"]);
  assert.deepEqual(index.approvalScopeKeys, ["shell.run:command:rm"]);

  const shellPolicy = queryRuntimeGovernance({
    report,
    query: { kinds: ["baseToolPolicy"], toolId: "shell.run", riskLevel: "dangerous" },
  });
  assert.equal(shellPolicy.returnedDecisions, 1);
  assert.equal(shellPolicy.decisions[0]?.status, "requiresApproval");
  assert.equal(shellPolicy.decisions[0]?.approvalScopeKey, "shell.run:command:rm");

  const pending = queryRuntimeGovernance({
    report,
    query: { kinds: ["approval"], status: "pending", approvalId: "approval.shell.1" },
  });
  assert.equal(pending.returnedDecisions, 1);
  assert.equal(pending.decisions[0]?.kind, "approval");

  const limited = queryRuntimeGovernance({ report, query: { toolId: "shell.run", limit: 1.8 } });
  assert.equal(limited.matchedDecisions, 4);
  assert.equal(limited.returnedDecisions, 1);
  assert.equal(queryRuntimeGovernance({ report, query: { limit: 0 } }).returnedDecisions, 0);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("secret-session-token"), false);
  assert.equal(serialized.includes("secret-policy-key"), false);
  assert.equal(serialized.includes("secret-interface-token"), false);
  assert.equal(serialized.includes("secret-dependency-token"), false);
  assert.equal(serialized.includes("secret-approval-token"), false);
  assert.equal(serialized.includes("secret-resolution-token"), false);
});
