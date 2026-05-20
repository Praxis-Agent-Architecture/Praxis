import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitRebaseBranch,
  gitRebaseBranchHandler,
  parseGitRebaseBranchResult,
  planGitBranchRebase,
  type GitRebaseBranchOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.rebaseBranch.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.rebaseBranch.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.rebaseBranch.md",
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

test("planGitBranchRebase creates a fixed dry-run rebase envelope without provider dispatch", () => {
  const result = planGitBranchRebase({
    target: {
      repositoryPath: "/repo/project",
      upstreamRef: " main ",
      branchName: "feature/a",
      ontoRef: "origin/main",
      autosquash: true,
    },
    context: {
      invocationId: "rebase-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.rebaseBranch");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.upstreamRef, "main");
  assert.deepEqual(result.output.gitArgs, ["rebase", "--autosquash", "--onto", "origin/main", "main", "feature/a"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "rebase",
    "--autosquash",
    "--onto",
    "origin/main",
    "main",
    "feature/a",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.risk.rewritesHistory, true);
  assert.equal(result.audit[0]?.invocationId, "rebase-1");
});

test("git.rebaseBranch rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitRebaseBranch(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const missingUpstream = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project" },
    context: governedContext(),
  });
  assert.equal(missingUpstream.ok, false);
  if (!missingUpstream.ok) {
    assert.equal(missingUpstream.error.code, "MISSING_UPSTREAM_REF");
  }

  const unsafeUpstream = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "--upload-pack=bad" },
    context: governedContext(),
  });
  assert.equal(unsafeUpstream.ok, false);
  if (!unsafeUpstream.ok) {
    assert.equal(unsafeUpstream.error.code, "UNSAFE_REF");
  }

  const unsafeBranch = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main", branchName: "bad branch" },
    context: governedContext(),
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) {
    assert.equal(unsafeBranch.error.code, "UNSAFE_REF");
  }

  const unsafeOnto = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main", ontoRef: "refs/heads/main.lock" },
    context: governedContext(),
  });
  assert.equal(unsafeOnto.ok, false);
  if (!unsafeOnto.ok) {
    assert.equal(unsafeOnto.error.code, "UNSAFE_REF");
  }
});

test("git.rebaseBranch enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitRebaseBranch({
    target: { repositoryPath: "/tmp/project", upstreamRef: "main" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.rebaseBranch calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "Successfully rebased and updated refs/heads/feature/a.\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main", branchName: "feature/a", ontoRef: "origin/main", autosquash: true },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:rebase --autosquash --onto origin/main main feature/a"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.rebaseCompleted, true);
  assert.equal(result.output.resultEnvelope.rebaseHint, "Successfully rebased and updated refs/heads/feature/a.");
});

test("git.rebaseBranch provider failures remain public-safe", async () => {
  const result = await executeGitRebaseBranch({
    target: { repositoryPath: "/repo/project", upstreamRef: "main" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/rebase-merge failed with private detail");
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

test("git.rebaseBranch parser handles dry-run, success, and conflicts", () => {
  const dryRun = parseGitRebaseBranchResult(undefined, {
    repositoryPath: "/repo/project",
    upstreamRef: "main",
    keepBase: false,
    autosquash: false,
    interactive: false,
  });
  assert.equal(dryRun.stdoutLineCount, 0);
  assert.equal(dryRun.rebaseHint, undefined);

  const success = parseGitRebaseBranchResult(
    { exitCode: 0, stdout: "Successfully rebased and updated refs/heads/feature/a.\n", stderr: "" },
    {
      repositoryPath: "/repo/project",
      upstreamRef: "main",
      branchName: "feature/a",
      keepBase: false,
      autosquash: false,
      interactive: false,
    },
  );
  assert.equal(success.rebaseCompleted, true);
  assert.equal(success.conflictDetected, false);

  const conflict = parseGitRebaseBranchResult(
    { exitCode: 1, stdout: "", stderr: "CONFLICT (content): Merge conflict in src/index.ts\ncould not apply abc123\n" },
    {
      repositoryPath: "/repo/project",
      upstreamRef: "main",
      keepBase: false,
      autosquash: false,
      interactive: false,
    },
  );
  assert.equal(conflict.conflictDetected, true);
  assert.equal(conflict.rebaseStopped, true);
});

test("git.rebaseBranch registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.rebaseBranch");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;
  assert.equal(lookup.handler.definition.toolId, "git.rebaseBranch");

  const result = await lookup.handler.invoke({
    toolCallId: "rebase-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", upstreamRef: "main" },
      context: { allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitRebaseBranchOutput;
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.providerCalled, false);
  }

  assert.equal(gitRebaseBranchHandler.definition.toolId, "git.rebaseBranch");
});
