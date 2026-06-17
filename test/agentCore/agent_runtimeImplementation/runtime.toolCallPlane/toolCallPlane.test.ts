import assert from "node:assert/strict";
import test from "node:test";

import { createMainLoopStepRecord } from "../../../../src/executionEngine/coreLogic/mainLoop.js";
import {
  createRuntimeToolCallIndex,
  createRuntimeToolCallReport,
  queryRuntimeToolCalls,
} from "../../../../src/runtimeImplementation/runtime.toolCallPlane/index.js";
import type { RuntimeSessionSnapshot } from "../../../../src/runtimeImplementation/runtimeSessionStateEventStore.js";

function snapshot(): RuntimeSessionSnapshot {
  return {
    session: {
      sessionId: "session.toolcall",
      runtimeId: "runtime.toolcall",
      agentId: "agent.toolcall",
      manifestHash: "manifest.toolcall",
      createdAt: "2026-06-09T00:00:00.000Z",
      status: "completed",
      metadata: { source: "test", accessToken: "secret-session-token" },
    },
    states: [],
    events: [{
      sessionId: "session.toolcall",
      eventId: "event:tool:tool.call.1:policy",
      type: "runtime.baseTool.policy.adjudicated",
      createdAt: "2026-06-09T00:00:01.000Z",
      payload: {
        toolId: "shell.run",
        approvalScope: {
          scopeKey: "shell.run:command:printf",
        },
        policyAdjudication: {
          toolId: "shell.run",
          profile: "standard",
          risk: "dangerous",
          action: "requiresApproval",
          humanApprovalScopeKey: "shell.run:command:printf",
          humanApprovalRequired: true,
          sandboxRequired: true,
          sandboxStrength: "workspace-rollback",
          metadata: { apiKey: "secret-policy-key" },
        },
        sandboxPlan: {
          effectiveMode: "workspace-rollback",
          status: "planned",
          secret: "secret-sandbox-plan",
        },
        workspaceRollback: {
          status: "planned",
        },
      },
    }, {
      sessionId: "session.toolcall",
      eventId: "event:tool:tool.call.1:dependencies",
      type: "runtime.baseTool.dependencies.preflight",
      createdAt: "2026-06-09T00:00:02.000Z",
      payload: {
        toolId: "shell.run",
        dependencyPreflight: {
          status: "available",
          decision: "allow",
          missingDependencies: [],
          installableDependencies: [],
          credential: "secret-dependency-token",
        },
      },
    }, {
      sessionId: "session.toolcall",
      eventId: "event:sandbox:prepared",
      type: "runtime.sandboxPlane.prepared",
      createdAt: "2026-06-09T00:00:03.000Z",
      payload: {
        sandboxMode: "workspace-rollback",
      },
    }],
    invocations: [{
      sessionId: "session.toolcall",
      invocationId: "tool.call.1",
      kind: "tool",
      target: "shell.run",
      ok: true,
      createdAt: "2026-06-09T00:00:04.000Z",
      summary: {
        ok: true,
        decisionId: "decision.tool.1",
        governance: {
          status: "allow",
          policyProfile: "standard",
          policyMatrixId: "toolPolicy.standard",
        },
        sandboxMode: "workspace-rollback",
        sandboxPlanStatus: "planned",
        commandSandboxProviderFamily: "workspace-rollback",
        commandSandboxMode: "workspace-rollback",
        commandSandboxApplied: true,
        dependencyRuntime: {
          status: "available",
          decision: "allow",
        },
        workspaceRollbackDiff: {
          status: "restored",
          restored: true,
          changedFiles: 1,
          token: "secret-rollback-token",
        },
        authorization: "Bearer secret-invocation",
      },
    }],
    mainLoopSteps: [
      createMainLoopStepRecord({
        sessionId: "session.toolcall",
        turnIndex: 1,
        stepIndex: 8,
        actionPrimitive: "invokeBaseTool",
        status: "completed",
        inputRefs: ["decision.tool.1"],
        outputRefs: ["tool.call.1"],
        toolCallId: "tool.call.1",
        observationRefs: ["observation.tool.1"],
        now: "2026-06-09T00:00:05.000Z",
        metadata: {
          toolId: "shell.run",
          providerToolName: "praxis_tool_shell_run",
          credential: "secret-step-credential",
        },
      }),
    ],
    procedures: [],
    approvals: [{
      sessionId: "session.toolcall",
      approvalId: "tool.call.1:approval",
      status: "approved",
      reason: "shell.run requires approval",
      requestedScopes: ["tool.execute", "tool.shell.run", "approvalScope.shell.run:command:printf"],
      riskLevel: "dangerous",
      source: "baseTool",
      interfaceSurface: "application",
      createdAt: "2026-06-09T00:00:02.000Z",
      resolvedAt: "2026-06-09T00:00:03.000Z",
      metadata: {
        toolCallId: "tool.call.1",
        toolId: "shell.run",
        approvalScopeKey: "shell.run:command:printf",
        accessToken: "secret-approval-token",
      },
    }],
    errors: [],
  };
}

test("runtime tool-call report summarizes tool execution facts without owning BaseTool semantics", () => {
  const report = createRuntimeToolCallReport({
    sourceKind: "in-memory",
    snapshot: snapshot(),
  });

  assert.equal(report.kind, "praxis.runtime.toolCall.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.sourceKind, "in-memory");
  assert.equal(report.session.sessionId, "session.toolcall");
  assert.deepEqual(report.counts, {
    toolInvocations: 1,
    completed: 1,
    failed: 0,
    waitingApproval: 0,
    policyDecisions: 1,
    dependencyPreflights: 1,
    sandboxPreparedEvents: 1,
    workspaceRollbackRequired: 1,
    workspaceRollbackRestored: 1,
    approvals: 1,
    errors: 0,
  });
  assert.equal(report.coverage.hasToolInvocations, true);
  assert.equal(report.coverage.hasPolicyDecisions, true);
  assert.equal(report.coverage.hasDependencyPreflights, true);
  assert.equal(report.coverage.hasSandboxEvidence, true);
  assert.equal(report.coverage.hasWorkspaceRollbackEvidence, true);
  assert.equal(report.coverage.hasApprovals, true);
  assert.deepEqual(report.toolIds, ["shell.run"]);
  assert.deepEqual(report.policyProfiles, ["standard"]);
  assert.deepEqual(report.sandboxModes, ["workspace-rollback"]);
  assert.deepEqual(report.dependencyStatuses, ["available"]);
  assert.deepEqual(report.approvalIds, ["tool.call.1:approval"]);

  const call = report.toolCalls[0];
  assert.equal(call?.callId, "tool.call.1");
  assert.equal(call?.toolId, "shell.run");
  assert.equal(call?.status, "completed");
  assert.equal(call?.policy.action, "requiresApproval");
  assert.equal(call?.policy.riskLevel, "dangerous");
  assert.equal(call?.policy.policyProfile, "standard");
  assert.equal(call?.policy.approvalScopeKey, "shell.run:command:printf");
  assert.equal(call?.sandbox.effectiveMode, "workspace-rollback");
  assert.equal(call?.sandbox.commandProviderFamily, "workspace-rollback");
  assert.equal(call?.sandbox.commandApplied, true);
  assert.equal(call?.dependency.status, "available");
  assert.equal(call?.workspaceRollback.required, true);
  assert.equal(call?.workspaceRollback.restored, true);
  assert.equal(call?.workspaceRollback.changedFiles, 1);
  assert.equal(call?.approval.status, "approved");
  assert.equal(call?.providerToolName, "praxis_tool_shell_run");
  assert.equal(call?.refs.includes("decision.tool.1"), true);

  const index = createRuntimeToolCallIndex(report);
  assert.equal(index.totalToolCalls, 1);
  assert.equal(index.byToolId["shell.run"], 1);
  assert.equal(index.byStatus.completed, 1);
  assert.equal(index.byPolicyProfile.standard, 1);
  assert.equal(index.bySandboxMode["workspace-rollback"], 1);
  assert.equal(index.byApprovalStatus.approved, 1);
  assert.equal(index.byDependencyStatus.available, 1);

  const query = queryRuntimeToolCalls({
    report,
    query: { toolId: "shell.run", sandboxMode: "workspace-rollback", approvalStatus: "approved" },
  });
  assert.equal(query.returnedToolCalls, 1);
  assert.equal(query.toolCalls[0]?.callId, "tool.call.1");
  assert.equal(queryRuntimeToolCalls({ report, query: { limit: 0 } }).returnedToolCalls, 0);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("secret-session-token"), false);
  assert.equal(serialized.includes("secret-policy-key"), false);
  assert.equal(serialized.includes("secret-sandbox-plan"), false);
  assert.equal(serialized.includes("secret-dependency-token"), false);
  assert.equal(serialized.includes("secret-rollback-token"), false);
  assert.equal(serialized.includes("secret-invocation"), false);
  assert.equal(serialized.includes("secret-step-credential"), false);
  assert.equal(serialized.includes("secret-approval-token"), false);
});
