import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitSwitchBranch,
  gitSwitchBranchHandler,
  parseGitSwitchBranchResult,
  planGitBranchSwitch,
  type GitSwitchBranchOutput,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.switchBranch.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.switchBranch.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.switchBranch.md",
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

test("planGitBranchSwitch creates a fixed dry-run switch envelope without provider dispatch", () => {
  const result = planGitBranchSwitch({
    target: {
      repositoryPath: "/repo/project",
      branchName: " feature/a ",
      create: true,
      startPoint: "origin/main",
      track: true,
    },
    context: {
      invocationId: "switch-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.switchBranch");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.branchName, "feature/a");
  assert.deepEqual(result.output.gitArgs, ["switch", "--track", "-c", "feature/a", "origin/main"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "switch",
    "--track",
    "-c",
    "feature/a",
    "origin/main",
  ]);
  assert.equal(result.audit[0]?.invocationId, "switch-1");
});

test("git.switchBranch rejects malformed request and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitSwitchBranch(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const unsafeBranch = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "--upload-pack=bad" },
    context: governedContext(),
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) {
    assert.equal(unsafeBranch.error.code, "UNSAFE_BRANCH_REF");
  }

  const unsafeStartPoint = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a", create: true, startPoint: "origin/main --bad" },
    context: governedContext(),
  });
  assert.equal(unsafeStartPoint.ok, false);
  if (!unsafeStartPoint.ok) {
    assert.equal(unsafeStartPoint.error.code, "UNSAFE_BRANCH_REF");
  }
});

test("git.switchBranch enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitSwitchBranch({
    target: { repositoryPath: "/tmp/project", branchName: "feature/a" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a" },
    context: { ...governedContext(), grantedPermissions: ["git:read"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.switchBranch calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "Switched to a new branch 'feature/a'\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a", create: true, startPoint: "origin/main", track: true },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:switch --track -c feature/a origin/main"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.createdBranch, true);
  assert.equal(result.output.resultEnvelope.switchedBranchHint, "Switched to a new branch 'feature/a'");
});

test("git.switchBranch provider failures remain public-safe", async () => {
  const result = await executeGitSwitchBranch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/refs failed with private detail");
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

test("git.switchBranch parser handles dry-run and provider output", () => {
  const dryRun = parseGitSwitchBranchResult(undefined, {
    repositoryPath: "/repo/project",
    branchName: "main",
    create: false,
    track: false,
    discardChanges: false,
  });
  assert.equal(dryRun.stdoutLineCount, 0);
  assert.equal(dryRun.switchedBranchHint, undefined);

  const parsed = parseGitSwitchBranchResult(
    { exitCode: 0, stdout: "", stderr: "Switched to branch 'main'\n" },
    {
      repositoryPath: "/repo/project",
      branchName: "main",
      create: false,
      track: false,
      discardChanges: true,
    },
  );
  assert.equal(parsed.switchedBranchHint, "Switched to branch 'main'");
  assert.equal(parsed.discardedChanges, true);
});

test("git.switchBranch registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.switchBranch");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;
  assert.equal(lookup.handler.definition.toolId, "git.switchBranch");

  const result = await lookup.handler.invoke({
    toolCallId: "switch-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", branchName: "feature/a" },
      context: { allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitSwitchBranchOutput;
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.providerCalled, false);
  }

  assert.equal(gitSwitchBranchHandler.definition.toolId, "git.switchBranch");
});
