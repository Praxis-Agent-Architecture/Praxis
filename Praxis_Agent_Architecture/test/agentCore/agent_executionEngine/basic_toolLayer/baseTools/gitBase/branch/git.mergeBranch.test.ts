import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitMergeBranch,
  gitMergeBranchHandler,
  parseGitMergeBranchResult,
  planGitBranchMerge,
  type GitMergeBranchOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.mergeBranch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.mergeBranch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.mergeBranch.md",
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

test("planGitBranchMerge creates a fixed dry-run merge envelope without provider dispatch", () => {
  const result = planGitBranchMerge({
    target: {
      repositoryPath: "/repo/project",
      sourceBranch: " feature/a ",
      mode: "no-ff",
      commitMessage: "Merge feature/a",
    },
    context: {
      invocationId: "merge-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.mergeBranch");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.sourceBranch, "feature/a");
  assert.deepEqual(result.output.gitArgs, ["merge", "--no-ff", "-m", "Merge feature/a", "feature/a"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "merge",
    "--no-ff",
    "-m",
    "Merge feature/a",
    "feature/a",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "merge-1");
});

test("git.mergeBranch rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitMergeBranch(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const unsafeBranch = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "--upload-pack=bad" },
    context: governedContext(),
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) {
    assert.equal(unsafeBranch.error.code, "UNSAFE_BRANCH_REF");
  }

  const unsafeMessage = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a", commitMessage: "bad\0message" },
    context: governedContext(),
  });
  assert.equal(unsafeMessage.ok, false);
  if (!unsafeMessage.ok) {
    assert.equal(unsafeMessage.error.code, "INVALID_ARGUMENT");
  }
});

test("git.mergeBranch enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitMergeBranch({
    target: { repositoryPath: "/tmp/project", sourceBranch: "feature/a" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.mergeBranch calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "Merge made by the 'ort' strategy.\n src/index.ts | 1 +\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a", mode: "no-ff", commitMessage: "Merge feature/a" },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:merge --no-ff -m Merge feature/a feature/a"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.mergeCommitCreated, true);
  assert.equal(result.output.resultEnvelope.mergeHint, "Merge made by the 'ort' strategy.");
});

test("git.mergeBranch provider failures remain public-safe", async () => {
  const result = await executeGitMergeBranch({
    target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/MERGE_HEAD failed with private detail");
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

test("git.mergeBranch parser handles dry-run, fast-forward, and conflicts", () => {
  const dryRun = parseGitMergeBranchResult(undefined, {
    repositoryPath: "/repo/project",
    sourceBranch: "feature/a",
    mode: "default",
    noCommit: false,
    allowUnrelatedHistories: false,
  });
  assert.equal(dryRun.stdoutLineCount, 0);
  assert.equal(dryRun.mergeHint, undefined);

  const fastForward = parseGitMergeBranchResult(
    { exitCode: 0, stdout: "Updating abc..def\nFast-forward\n", stderr: "" },
    {
      repositoryPath: "/repo/project",
      sourceBranch: "feature/a",
      mode: "ff-only",
      noCommit: false,
      allowUnrelatedHistories: false,
    },
  );
  assert.equal(fastForward.fastForward, true);
  assert.equal(fastForward.conflictDetected, false);

  const conflict = parseGitMergeBranchResult(
    { exitCode: 1, stdout: "", stderr: "CONFLICT (content): Merge conflict in src/index.ts\n" },
    {
      repositoryPath: "/repo/project",
      sourceBranch: "feature/a",
      mode: "default",
      noCommit: false,
      allowUnrelatedHistories: false,
    },
  );
  assert.equal(conflict.conflictDetected, true);
  assert.equal(conflict.mergeCommitCreated, false);
});

test("git.mergeBranch registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.mergeBranch");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;
  assert.equal(lookup.handler.definition.toolId, "git.mergeBranch");

  const result = await lookup.handler.invoke({
    toolCallId: "merge-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", sourceBranch: "feature/a" },
      context: { allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitMergeBranchOutput;
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.providerCalled, false);
  }

  assert.equal(gitMergeBranchHandler.definition.toolId, "git.mergeBranch");
});
