import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeGitApplyStashChanges,
  parseGitApplyStashChangesResult,
  planGitApplyStashChanges,
  type GitApplyStashChangesProvider,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  invocationId: "apply-stash-1",
  allowedRepositoryRoots: ["/repo"] as const,
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
} as const;

test("planGitApplyStashChanges creates a runtime-shaped dry-run stash apply envelope", () => {
  const result = planGitApplyStashChanges({
    target: {
      repositoryPath: "/repo/project",
      stashRef: " stash@{2} ",
      reinstateIndex: true,
    },
    context: governedContext,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.applyStashChanges");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.runtimeEntry.argvMode, "fixed-stash-apply-workspace-mutation");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesWorkingTree, true);
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.risk.dropsStashOnSuccess, false);
  assert.equal(result.output.target.stashRef, "stash@{2}");
  assert.deepEqual(result.output.gitArgs, ["stash", "apply", "--index", "stash@{2}"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "stash",
    "apply",
    "--index",
    "stash@{2}",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.dropsStashOnSuccess, false);
  assert.equal(result.audit[0]?.invocationId, "apply-stash-1");
});

test("planGitApplyStashChanges validates malformed JSON without leaking raw TypeError", () => {
  const malformedContext = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: "not-an-object" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const defaultRef = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project" },
  });
  assert.equal(defaultRef.ok, true);
  if (defaultRef.ok) {
    assert.equal(defaultRef.output.target.stashRef, "stash@{0}");
    assert.deepEqual(defaultRef.output.gitArgs, ["stash", "apply", "stash@{0}"]);
  }

  const unsafeRef = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "--help" },
    context: governedContext,
  });
  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) {
    assert.equal(unsafeRef.error.code, "INVALID_STASH_REF");
  }

  const missingPermission = planGitApplyStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "stash@{1}" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("executeGitApplyStashChanges gates real execution on governance and runtime provider availability", async () => {
  const noGuard = await executeGitApplyStashChanges({
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

  const noProvider = await executeGitApplyStashChanges({
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

test("executeGitApplyStashChanges calls runtime provider with fixed argv and parses stdout", async () => {
  const providerCalls: unknown[] = [];
  const provider: GitApplyStashChangesProvider = async (request) => {
    providerCalls.push(request);
    return {
      exitCode: 0,
      stdout: "On branch main\nChanges not staged for commit:\n",
      stderr: "",
    };
  };

  const result = await executeGitApplyStashChanges({
    target: {
      repositoryPath: "/repo/project",
      stashRef: "stash@{0}",
      reinstateIndex: true,
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
      args: ["stash", "apply", "--index", "stash@{0}"],
      timeoutMs: 1000,
    },
  ]);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.executionBlocked, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.resultEnvelope.appliedHint, "On branch main");
  assert.equal(result.output.resultEnvelope.stdoutLineCount, 3);
});

test("executeGitApplyStashChanges maps provider failure to public-safe error", async () => {
  const result = await executeGitApplyStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "stash@{0}" },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { allowed: true },
    },
    provider: async () => {
      throw new Error("fatal: /repo/project leaked raw command git stash apply stash@{0}");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/repo\/project|git stash apply|stash@\{0\}/u);
  }
});

test("parseGitApplyStashChangesResult keeps safe fallback fields for empty provider output", () => {
  const envelope = parseGitApplyStashChangesResult(
    { exitCode: 0, stdout: "", stderr: "" },
    {
      repositoryPath: "/repo/project",
      stashRef: "stash@{0}",
      reinstateIndex: false,
    },
  );

  assert.equal(envelope.parser, "git-stash-apply-exit-v1");
  assert.equal(envelope.appliedHint, undefined);
  assert.equal(envelope.stdoutLineCount, 0);
  assert.equal(envelope.stderrLineCount, 0);
});
