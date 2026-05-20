import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitManageWorktree,
  parseGitManageWorktreeResult,
  planGitManageWorktree,
  planGitWorktreeManagement,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageWorktree.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageWorktree.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageWorktree.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
} as const;

test("planGitWorktreeManagement creates a fixed dry-run add plan without provider dispatch", () => {
  let providerCalled = false;
  const result = planGitWorktreeManagement({
    target: {
      repositoryPath: "/repo/project",
      action: "add",
      worktreePath: "/repo/worktrees/feature",
      branchName: "feature/a",
      targetRef: "main",
    },
    context: { ...governedContext, dryRun: true, invocationId: "worktree-1" },
    provider: async () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.equal(result.output.kind, "agentCore.basicTool.git.manageWorktree");
    assert.deepEqual(result.output.gitArgs, ["worktree", "add", "-b", "feature/a", "/repo/worktrees/feature", "main"]);
    assert.deepEqual(result.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "worktree",
      "add",
      "-b",
      "feature/a",
      "/repo/worktrees/feature",
      "main",
    ]);
    assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(result.output.risk.category, "workspace-mutation");
    assert.equal(result.audit[0]?.invocationId, "worktree-1");
  }
});

test("git.manageWorktree validates malformed JSON and unsafe arguments safely", async () => {
  const malformedContext = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/project" },
    context: "bad-context" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const missingPath = planGitManageWorktree({
    target: { repositoryPath: "/repo/project", action: "remove" },
  });
  assert.equal(missingPath.ok, false);
  if (!missingPath.ok) assert.equal(missingPath.error.code, "MISSING_TARGET_PATH");

  const missingRef = planGitWorktreeManagement({
    target: { repositoryPath: "/repo/project", action: "add", worktreePath: "/repo/wt/a" },
  });
  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) assert.equal(missingRef.error.code, "MISSING_TARGET_REF");

  const unsafeBranch = planGitWorktreeManagement({
    target: { repositoryPath: "/repo/project", action: "add", worktreePath: "/repo/wt/a", branchName: "--upload-pack=/tmp/fake" },
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) assert.equal(unsafeBranch.error.code, "INVALID_ARGUMENT");

  const badAction = planGitWorktreeManagement({
    target: { repositoryPath: "/repo/project", action: "repair" as never },
  });
  assert.equal(badAction.ok, false);
  if (!badAction.ok) assert.equal(badAction.error.code, "INVALID_ACTION");
});

test("git.manageWorktree enforces scope, permission, governance, and provider boundaries", async () => {
  const scope = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/project", action: "add", worktreePath: "/outside/worktree", targetRef: "main" },
    context: governedContext,
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) assert.equal(scope.error.code, "SCOPE_REJECTED");

  const permission = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/project", action: "add", worktreePath: "/repo/wt/a", targetRef: "main" },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  const noGuard = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/project", action: "prune" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { dryRun: false, allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "filesystem:read"] },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.manageWorktree calls runtime git executor with fixed argv and parses list output", async () => {
  const calls: string[] = [];
  const result = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { dryRun: false, allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "filesystem:read"] },
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: "worktree /repo/project\nHEAD abcdef123456\nbranch refs/heads/main\n\nworktree /repo/worktrees/feature\nHEAD 111111\nbranch refs/heads/feature/a\n",
        stderr: "",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:worktree list --porcelain"]);
  if (result.ok) {
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.resultEnvelope.worktrees.length, 2);
    assert.equal(result.output.resultEnvelope.worktrees[0]?.path, "/repo/project");
    assert.equal(result.output.resultEnvelope.worktrees[1]?.branch, "refs/heads/feature/a");
  }
});

test("git.manageWorktree provider failures stay public-safe", async () => {
  const result = await executeGitManageWorktree({
    target: { repositoryPath: "/repo/private/project", action: "remove", worktreePath: "/repo/private/wt/a", force: true },
    context: {
      ...governedContext,
      allowedRepositoryRoots: ["/repo/private"],
    },
    provider: async () => {
      throw new Error("fatal: leaked /repo/private/project token");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /private|token/u);
  }
});

test("git.manageWorktree parser keeps safe fallback fields for mutation output", () => {
  const envelope = parseGitManageWorktreeResult(
    {
      exitCode: 0,
      stdout: "Preparing worktree (new branch 'feature/a')\n",
      stderr: "HEAD is now at abc initial\n",
    },
    {
      repositoryPath: "/repo/project",
      action: "add",
      worktreePath: "/repo/wt/a",
      branchName: "feature/a",
      targetRef: "main",
      detach: false,
      force: false,
    },
  );

  assert.equal(envelope.worktreeChanged, true);
  assert.equal(envelope.worktrees.length, 0);
  assert.equal(envelope.stdoutLineCount, 1);
});

test("git.manageWorktree is mounted in the BaseTool registry handler", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.manageWorktree");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const calls: string[] = [];
  const result = await lookup.handler.invoke({
    toolCallId: "worktree-handler-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/repo/project", action: "remove", worktreePath: "/repo/wt/a", force: true },
      context: governedContext,
    },
    executor: {
      git: {
        async runGit(request) {
          calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:worktree remove --force /repo/wt/a"]);
  const output = result.output as { runtimeEntry: { port: string }; resultEnvelope: { worktreeChanged: boolean } };
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(output.resultEnvelope.worktreeChanged, true);
});
