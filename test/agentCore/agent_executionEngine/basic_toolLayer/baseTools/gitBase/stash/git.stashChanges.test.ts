import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeGitStashChanges,
  parseGitStashChangesResult,
  planGitStashChanges,
  type GitStashChangesProvider,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.stashChanges.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.stashChanges.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.stashChanges.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  invocationId: "stash-1",
  allowedRepositoryRoots: ["/repo"] as const,
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
} as const;

test("planGitStashChanges creates a guarded dry-run stash push envelope without calling a provider", () => {
  const result = planGitStashChanges({
    target: {
      repositoryPath: "/repo/project",
      message: " checkpoint before refactor ",
      includeUntracked: true,
      keepIndex: true,
      pathspecs: [" src/index.ts ", "src/index.ts", " test/index.test.ts "],
    },
    context: governedContext,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.stashChanges");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.runtimeEntry.argvMode, "fixed-stash-push-workspace-mutation");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesIndex, false);
  assert.equal(result.output.risk.requiresTapApproval, true);
  assert.equal(result.output.target.message, "checkpoint before refactor");
  assert.deepEqual(result.output.target.pathspecs, ["src/index.ts", "test/index.test.ts"]);
  assert.deepEqual(result.output.gitArgs, [
    "stash",
    "push",
    "--include-untracked",
    "--keep-index",
    "-m",
    "checkpoint before refactor",
    "--",
    "src/index.ts",
    "test/index.test.ts",
  ]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "stash",
    "push",
    "--include-untracked",
    "--keep-index",
    "-m",
    "checkpoint before refactor",
    "--",
    "src/index.ts",
    "test/index.test.ts",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.createsStashEntry, true);
  assert.deepEqual(result.output.permissionsRequired, ["git:read", "git:write", "filesystem:read", "filesystem:write"]);
  assert.equal(result.output.resultEnvelope.createdStashHint, undefined);
  assert.equal(result.audit[0]?.invocationId, "stash-1");
});

test("planGitStashChanges validates malformed JSON without leaking raw TypeError", () => {
  const malformedContext = planGitStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: "not-an-object" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.equal(malformedContext.error.publicSafe, true);
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const missingRepository = planGitStashChanges();
  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missingRepository.error.boundary, "input");
  }

  const outsideScope = planGitStashChanges({
    target: { repositoryPath: "/repo/project", pathspecs: ["../secret"] },
    context: governedContext,
  });
  assert.equal(outsideScope.ok, false);
  if (!outsideScope.ok) {
    assert.equal(outsideScope.error.code, "PATHSPEC_OUTSIDE_SCOPE");
    assert.equal(outsideScope.error.boundary, "scope");
  }

  const missingPermission = planGitStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("executeGitStashChanges gates real execution on governance and runtime provider availability", async () => {
  const noGuard = await executeGitStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: {
      ...governedContext,
      dryRun: false,
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) {
    assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");
    assert.equal(noGuard.error.boundary, "governance");
  }

  const noProvider = await executeGitStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { allowed: true },
    },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) {
    assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(noProvider.error.boundary, "provider");
  }
});

test("executeGitStashChanges calls runtime provider with fixed argv and parses stdout", async () => {
  const providerCalls: unknown[] = [];
  const provider: GitStashChangesProvider = async (request) => {
    providerCalls.push(request);
    return {
      exitCode: 0,
      stdout: "Saved working directory and index state WIP on main: abc initial\n",
      stderr: "",
    };
  };

  const result = await executeGitStashChanges({
    target: {
      repositoryPath: "/repo/project",
      message: "checkpoint",
      includeUntracked: true,
      pathspecs: ["src/index.ts"],
    },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { accepted: true },
    },
    timeoutMs: 1000,
    provider,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(providerCalls, [
    {
      repositoryPath: "/repo/project",
      args: ["stash", "push", "--include-untracked", "-m", "checkpoint", "--", "src/index.ts"],
      timeoutMs: 1000,
    },
  ]);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.executionBlocked, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.stdout, "Saved working directory and index state WIP on main: abc initial\n");
  assert.equal(result.output.resultEnvelope.createdStashHint, "Saved working directory and index state WIP on main: abc initial");
  assert.equal(result.output.resultEnvelope.stdoutLineCount, 2);
});

test("executeGitStashChanges maps provider failure to public-safe error", async () => {
  const result = await executeGitStashChanges({
    target: { repositoryPath: "/repo/project", message: "secret checkpoint" },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { allowed: true },
    },
    provider: async () => {
      throw new Error("fatal: /repo/project leaked raw command git stash push");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/repo\/project|secret checkpoint|git stash push/u);
  }
});

test("parseGitStashChangesResult keeps safe fallback fields for empty provider output", () => {
  const envelope = parseGitStashChangesResult(
    { exitCode: 0, stdout: "", stderr: "No local changes to save\n" },
    {
      repositoryPath: "/repo/project",
      message: undefined,
      includeUntracked: false,
      keepIndex: false,
      pathspecs: [],
    },
  );

  assert.equal(envelope.parser, "git-stash-push-exit-v1");
  assert.equal(envelope.createdStashHint, undefined);
  assert.equal(envelope.stdoutLineCount, 0);
  assert.equal(envelope.stderrLineCount, 2);
});
