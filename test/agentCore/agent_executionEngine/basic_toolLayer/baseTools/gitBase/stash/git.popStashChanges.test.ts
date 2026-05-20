import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeGitPopStashChanges,
  parseGitPopStashChangesResult,
  planGitPopStashChanges,
  type GitPopStashChangesProvider,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.popStashChanges.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.popStashChanges.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.popStashChanges.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  invocationId: "pop-stash-1",
  allowedRepositoryRoots: ["/repo"] as const,
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
} as const;

test("planGitPopStashChanges creates a runtime-shaped dry-run stash pop envelope", () => {
  const result = planGitPopStashChanges({
    target: {
      repositoryPath: "/repo/project",
      stashRef: " stash@{3} ",
      reinstateIndex: true,
    },
    context: governedContext,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.popStashChanges");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.runtimeEntry.argvMode, "fixed-stash-pop-workspace-mutation");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesWorkingTree, true);
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.risk.dropsStashOnSuccess, true);
  assert.equal(result.output.target.stashRef, "stash@{3}");
  assert.deepEqual(result.output.gitArgs, ["stash", "pop", "--index", "stash@{3}"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "stash",
    "pop",
    "--index",
    "stash@{3}",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.dropsStashOnSuccess, true);
  assert.equal(result.audit[0]?.invocationId, "pop-stash-1");
});

test("planGitPopStashChanges validates malformed JSON without leaking raw TypeError", () => {
  const malformedContext = planGitPopStashChanges({
    target: { repositoryPath: "/repo/project" },
    context: "not-an-object" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const defaultRef = planGitPopStashChanges({
    target: { repositoryPath: "/repo/project" },
  });
  assert.equal(defaultRef.ok, true);
  if (defaultRef.ok) {
    assert.equal(defaultRef.output.target.stashRef, "stash@{0}");
    assert.deepEqual(defaultRef.output.gitArgs, ["stash", "pop", "stash@{0}"]);
  }

  const unsafeRef = planGitPopStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "--help" },
    context: governedContext,
  });
  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) {
    assert.equal(unsafeRef.error.code, "INVALID_STASH_REF");
  }

  const missingPermission = planGitPopStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "stash@{1}" },
    context: { grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }
});

test("executeGitPopStashChanges gates real execution on governance and runtime provider availability", async () => {
  const noGuard = await executeGitPopStashChanges({
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

  const noProvider = await executeGitPopStashChanges({
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

test("executeGitPopStashChanges calls runtime provider with fixed argv and parses stdout", async () => {
  const providerCalls: unknown[] = [];
  const provider: GitPopStashChangesProvider = async (request) => {
    providerCalls.push(request);
    return {
      exitCode: 0,
      stdout: "On branch main\nDropped refs/stash@{0} (abc123)\n",
      stderr: "",
    };
  };

  const result = await executeGitPopStashChanges({
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
      args: ["stash", "pop", "--index", "stash@{0}"],
      timeoutMs: 1000,
    },
  ]);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.executionBlocked, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.dropsStashOnSuccess, true);
  assert.equal(result.output.resultEnvelope.poppedHint, "On branch main");
  assert.equal(result.output.resultEnvelope.stdoutLineCount, 3);
});

test("executeGitPopStashChanges maps provider failure to public-safe error", async () => {
  const result = await executeGitPopStashChanges({
    target: { repositoryPath: "/repo/project", stashRef: "stash@{0}" },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { allowed: true },
    },
    provider: async () => {
      throw new Error("fatal: /repo/project leaked raw command git stash pop stash@{0}");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/repo\/project|git stash pop|stash@\{0\}/u);
  }
});

test("parseGitPopStashChangesResult keeps safe fallback fields for empty provider output", () => {
  const envelope = parseGitPopStashChangesResult(
    { exitCode: 0, stdout: "", stderr: "" },
    {
      repositoryPath: "/repo/project",
      stashRef: "stash@{0}",
      reinstateIndex: false,
    },
  );

  assert.equal(envelope.parser, "git-stash-pop-exit-v1");
  assert.equal(envelope.poppedHint, undefined);
  assert.equal(envelope.stdoutLineCount, 0);
  assert.equal(envelope.stderrLineCount, 0);
});
