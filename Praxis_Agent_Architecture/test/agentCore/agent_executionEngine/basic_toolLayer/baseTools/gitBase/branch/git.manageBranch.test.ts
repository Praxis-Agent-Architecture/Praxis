import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitManageBranch,
  gitManageBranchHandler,
  parseGitManageBranchResult,
  planGitBranchManagement,
  type GitManageBranchOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.md",
  testFileUrl: import.meta.url,
});

function governedContext() {
  return {
    dryRun: false,
    guard: { allowed: true, accepted: true },
    allowedRepositoryRoots: ["/repo"],
    grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
  };
}

test("planGitBranchManagement creates a fixed dry-run branch plan without provider dispatch", () => {
  const result = planGitBranchManagement({
    target: {
      repositoryPath: "/repo/project",
      action: "rename",
      branchName: " feature/a ",
      newBranchName: "feature/b",
      force: true,
    },
    context: {
      invocationId: "branch-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.manageBranch");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.branchName, "feature/a");
  assert.deepEqual(result.output.gitArgs, ["branch", "-M", "feature/a", "feature/b"]);
  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/repo/project", "branch", "-M", "feature/a", "feature/b"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.audit[0]?.invocationId, "branch-1");
});

test("git.manageBranch rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitManageBranch(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const invalidAction = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "push" as never },
    context: governedContext(),
  });
  assert.equal(invalidAction.ok, false);
  if (!invalidAction.ok) {
    assert.equal(invalidAction.error.code, "INVALID_ACTION");
  }

  const missingName = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "delete" },
    context: governedContext(),
  });
  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.equal(missingName.error.code, "MISSING_BRANCH_NAME");
  }

  const missingNewName = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "rename", branchName: "feature/a" },
    context: governedContext(),
  });
  assert.equal(missingNewName.ok, false);
  if (!missingNewName.ok) {
    assert.equal(missingNewName.error.code, "MISSING_REQUIRED_FIELD");
  }

  const missingUpstream = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "set-upstream", branchName: "feature/a" },
    context: governedContext(),
  });
  assert.equal(missingUpstream.ok, false);
  if (!missingUpstream.ok) {
    assert.equal(missingUpstream.error.code, "MISSING_REQUIRED_FIELD");
  }

  const unsafeBranch = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "create", branchName: "--bad" },
    context: governedContext(),
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) {
    assert.equal(unsafeBranch.error.code, "UNSAFE_REF");
  }

  const unsafeStartPoint = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "create", branchName: "feature/a", startPoint: "bad ref" },
    context: governedContext(),
  });
  assert.equal(unsafeStartPoint.ok, false);
  if (!unsafeStartPoint.ok) {
    assert.equal(unsafeStartPoint.error.code, "UNSAFE_REF");
  }
});

test("git.manageBranch enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitManageBranch({
    target: { repositoryPath: "/tmp/project", action: "list" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "create", branchName: "feature/a" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "filesystem:read"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "delete", branchName: "feature/a" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const listWithoutGuard = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(listWithoutGuard.ok, false);
  if (!listWithoutGuard.ok) {
    assert.equal(listWithoutGuard.error.code, "PROVIDER_UNAVAILABLE");
  }

  const missingProvider = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "create", branchName: "feature/a" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.manageBranch calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "* main\n  feature/a\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:branch --list"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.deepEqual(result.output.resultEnvelope.branchNames, ["main", "feature/a"]);
  assert.equal(result.output.resultEnvelope.currentBranch, "main");
});

test("git.manageBranch provider failures remain public-safe", async () => {
  const result = await executeGitManageBranch({
    target: { repositoryPath: "/repo/project", action: "create", branchName: "feature/a" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/refs/heads/feature/a failed with private detail");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /\/repo\/project/u);
    assert.doesNotMatch(result.error.message, /\.git/u);
  }
});

test("git.manageBranch parses mutation envelopes", () => {
  const renamed = parseGitManageBranchResult(
    { exitCode: 0, stdout: "", stderr: "" },
    { repositoryPath: "/repo/project", action: "rename", branchName: "feature/a", newBranchName: "feature/b", force: false },
  );
  assert.equal(renamed.branchRenamed, true);
  assert.equal(renamed.newBranchName, "feature/b");

  const upstream = parseGitManageBranchResult(
    { exitCode: 0, stdout: "branch 'feature/b' set up to track 'origin/feature/b'.\n", stderr: "" },
    { repositoryPath: "/repo/project", action: "set-upstream", branchName: "feature/b", upstream: "origin/feature/b", force: false },
  );
  assert.equal(upstream.upstreamSet, true);
  assert.equal(upstream.upstream, "origin/feature/b");
});

test("git.manageBranch handler is mounted in registry and remains compatible with old planner name", async () => {
  const registryLookup = createBaseToolRegistry().lookupHandler("git.manageBranch");
  assert.equal(registryLookup.ok, true);
  assert.equal(gitManageBranchHandler.definition.toolId, "git.manageBranch");

  if (!registryLookup.ok) return;
  const result = await registryLookup.handler.invoke({
    toolCallId: "branch-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: { target: { repositoryPath: "/repo/project", action: "list" } },
    executor: {},
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitManageBranchOutput;
    assert.equal(output.providerCalled, false);
    assert.deepEqual(output.gitArgs, ["branch", "--list"]);
  }
});
