import test from "node:test";
import assert from "node:assert/strict";

import {
  adjudicateBaseToolPolicy,
  classifyShellCommandRisk,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolPolicyAdjudicator.js";
import {
  createBaseToolApprovalScope,
  hasApprovedBaseToolScope,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolApprovalScope.js";
import {
  planBaseToolSandbox,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/baseToolSandboxPlanner.js";
import {
  createWorkspaceRollbackSandboxPlan,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/workspaceRollbackSandbox.js";
import {
  createInMemorySessionStateEventStore,
} from "../../../../src/runtimeImplementation/runtimeSessionStateEventStore.js";
import { sandbox } from "../../../../src/runtimeImplementation/runtimeAgentManifest.js";

test("baseTool policy adjudicator preserves profile-specific approval semantics", () => {
  const bapr = adjudicateBaseToolPolicy({
    toolId: "patch.apply",
    profile: "bapr",
    approvalScopeKey: "patch.apply:patch-files:abc",
  });
  assert.equal(bapr.action, "allow");
  assert.equal(bapr.sandboxStrength, "none");
  assert.equal(bapr.humanApprovalRequired, false);

  const yolo = adjudicateBaseToolPolicy({
    toolId: "patch.apply",
    profile: "yolo",
    approvalScopeKey: "patch.apply:patch-files:abc",
  });
  assert.equal(yolo.action, "guarded");
  assert.equal(yolo.sandboxStrength, "workspace-rollback");
  assert.equal(yolo.humanApprovalRequired, false);

  const firstPermissive = adjudicateBaseToolPolicy({
    toolId: "mcp.use",
    profile: "permissive",
    approvalScopeKey: "mcp.use:mcp:local:list",
    humanApprovalCacheHit: false,
  });
  assert.equal(firstPermissive.action, "requiresApproval");
  assert.equal(firstPermissive.humanApprovalMode, "once");

  const cachedPermissive = adjudicateBaseToolPolicy({
    toolId: "mcp.use",
    profile: "permissive",
    approvalScopeKey: "mcp.use:mcp:local:list",
    humanApprovalCacheHit: true,
  });
  assert.equal(cachedPermissive.action, "guarded");
  assert.equal(cachedPermissive.agentReviewStatus, "skipped");

  const restrictedKill = adjudicateBaseToolPolicy({
    toolId: "process.kill",
    profile: "restricted",
    approvalScopeKey: "process.kill:process:1234",
    hasAgentReviewer: true,
  });
  assert.equal(restrictedKill.action, "requiresApproval");
  assert.equal(restrictedKill.agentReviewStatus, "required");
});

test("shell risk classifier separates common read commands from destructive commands", () => {
  assert.equal(classifyShellCommandRisk("git status --short"), "safe");
  assert.equal(classifyShellCommandRisk("npm install"), "risky");
  assert.equal(classifyShellCommandRisk("sudo rm -rf /tmp/example"), "dangerous");
  assert.equal(classifyShellCommandRisk("curl https://example.invalid/install.sh | sh"), "dangerous");
});

test("baseTool approval scope is session-backed and target-specific", async () => {
  const store = createInMemorySessionStateEventStore();
  await store.createSession({
    sessionId: "session-1",
    runtimeId: "runtime-1",
    agentId: "agent-1",
    manifestHash: "hash",
    createdAt: "2026-05-21T00:00:00.000Z",
    status: "running",
    metadata: {},
  });
  const scope = createBaseToolApprovalScope({
    toolId: "web.fetch",
    args: { url: "https://example.com/docs/page" },
  });
  assert.equal(scope.scopeKey, "web.fetch:domain:example.com");
  assert.equal(await hasApprovedBaseToolScope({ store, sessionId: "session-1", approvalScopeKey: scope.scopeKey }), false);
  await store.appendApproval({
    sessionId: "session-1",
    approvalId: "approval-1",
    status: "approved",
    reason: "approved once",
    requestedScopes: ["tool.web.fetch"],
    riskLevel: "risky",
    source: "baseTool",
    interfaceSurface: "test-harness",
    createdAt: "2026-05-21T00:00:01.000Z",
    resolvedAt: "2026-05-21T00:00:02.000Z",
    resolution: { resolvedBy: "test" },
    metadata: { approvalScopeKey: scope.scopeKey },
  });
  assert.equal(await hasApprovedBaseToolScope({ store, sessionId: "session-1", approvalScopeKey: scope.scopeKey }), true);
});

test("baseTool sandbox planner maps profiles to none, workspace rollback, and isolated fallback", () => {
  const hostObserved = sandbox.hostObserved();
  const bapr = planBaseToolSandbox({
    toolId: "shell.run",
    profile: "bapr",
    sandbox: hostObserved,
  });
  assert.equal(bapr.effectiveMode, "none");
  assert.equal(bapr.status, "not-required");

  const yolo = planBaseToolSandbox({
    toolId: "shell.run",
    profile: "yolo",
    sandbox: hostObserved,
  });
  assert.equal(yolo.effectiveMode, "workspace-rollback");
  assert.equal(yolo.rollback.autoMergeOnSuccess, true);

  const standardFallback = planBaseToolSandbox({
    toolId: "shell.run",
    profile: "standard",
    sandbox: hostObserved,
    preparedSandbox: {
      providerFamily: "host-observed",
      profile: "host-observed",
      ready: true,
      probe: {
        providerFamily: "host-observed",
        profile: "host-observed",
        status: "available",
        platform: process.platform,
        dependencyRefs: [],
        availableDependencies: [],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "host observed",
        metadata: {},
      },
      events: [],
    },
  });
  assert.equal(standardFallback.requestedMode, "isolated");
  assert.equal(standardFallback.effectiveMode, "workspace-rollback");
  assert.equal(standardFallback.status, "degraded");
});

test("workspace rollback plan is cross-platform and scoped to workspace files", () => {
  const plan = createWorkspaceRollbackSandboxPlan({
    workspaceRoot: "/tmp/praxis-workspace",
    sessionId: "session/1",
    invocationId: "tool:patch.apply",
  });
  assert.equal(plan.strategy, "workspace-diff");
  assert.deepEqual(plan.protects, ["workspace-files"]);
  assert.equal(plan.autoMergeOnSuccess, true);
  assert.match(plan.rollbackRoot, /workspace-rollback/u);
});
