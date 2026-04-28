import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeGitCleanUntrackedFiles,
  parseGitCleanUntrackedFilesResult,
  planGitCleanUntrackedFiles,
  type GitCleanUntrackedFilesProvider,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.cleanUntrackedFiles.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.cleanUntrackedFiles.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.cleanUntrackedFiles.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  invocationId: "clean-untracked-1",
  allowedRepositoryRoots: ["/repo"] as const,
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
} as const;

test("planGitCleanUntrackedFiles creates a runtime-shaped destructive dry-run envelope", () => {
  const result = planGitCleanUntrackedFiles({
    target: {
      repositoryPath: "/repo/project",
      paths: [" tmp/a.log ", "build", "build"],
      includeDirectories: true,
      ignoredMode: "tracked-ignored",
    },
    context: governedContext,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.cleanUntrackedFiles");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.runtimeEntry.argvMode, "fixed-clean-untracked-workspace-deletion");
  assert.equal(result.output.runtimeEntry.allowedSubcommand, "clean");
  assert.equal(result.output.risk.category, "destructive");
  assert.equal(result.output.risk.deletesUntrackedFiles, true);
  assert.equal(result.output.risk.mayDeleteIgnoredFiles, true);
  assert.equal(result.output.risk.repositoryWide, false);
  assert.deepEqual(result.output.target.paths, ["tmp/a.log", "build"]);
  assert.deepEqual(result.output.gitArgs, ["clean", "--dry-run", "-f", "-d", "-x", "--", "tmp/a.log", "build"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "clean",
    "--dry-run",
    "-f",
    "-d",
    "-x",
    "--",
    "tmp/a.log",
    "build",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.deletesUntrackedFiles, true);
  assert.equal(result.audit[0]?.invocationId, "clean-untracked-1");
});

test("planGitCleanUntrackedFiles validates malformed JSON and unsafe paths without raw TypeError", () => {
  const malformedContext = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project" },
    context: "not-an-object" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const repoWide = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", ignoredMode: "ignored-only" },
    context: governedContext,
  });
  assert.equal(repoWide.ok, true);
  if (repoWide.ok) {
    assert.equal(repoWide.output.risk.repositoryWide, true);
    assert.deepEqual(repoWide.output.gitArgs, ["clean", "--dry-run", "-f", "-d", "-X"]);
  }

  const absolutePath = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", paths: ["/tmp/out.log"] },
    context: governedContext,
  });
  assert.equal(absolutePath.ok, false);
  if (!absolutePath.ok) {
    assert.equal(absolutePath.error.code, "PATH_OUTSIDE_SCOPE");
  }

  const traversal = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", paths: ["../outside.log"] },
    context: governedContext,
  });
  assert.equal(traversal.ok, false);
  if (!traversal.ok) {
    assert.equal(traversal.error.code, "PATH_OUTSIDE_SCOPE");
  }
});

test("planGitCleanUntrackedFiles enforces permissions and scope", () => {
  const missingPermission = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", paths: ["tmp/a.log"] },
    context: { grantedPermissions: ["git:read", "git:write", "filesystem:read"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
    assert.equal(missingPermission.error.boundary, "permission");
  }

  const outOfScope = planGitCleanUntrackedFiles({
    target: { repositoryPath: "/other/project", paths: ["tmp/a.log"] },
    context: governedContext,
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
    assert.equal(outOfScope.error.boundary, "scope");
  }
});

test("executeGitCleanUntrackedFiles gates real execution on governance and runtime provider availability", async () => {
  const noGuard = await executeGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", paths: ["tmp/a.log"] },
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

  const noProvider = await executeGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", paths: ["tmp/a.log"] },
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

test("executeGitCleanUntrackedFiles calls runtime provider with real fixed argv and parses stdout", async () => {
  const providerCalls: unknown[] = [];
  const provider: GitCleanUntrackedFilesProvider = async (request) => {
    providerCalls.push(request);
    return {
      exitCode: 0,
      stdout: "Removing tmp/a.log\nRemoving build/\n",
      stderr: "",
    };
  };

  const result = await executeGitCleanUntrackedFiles({
    target: {
      repositoryPath: "/repo/project",
      paths: ["tmp/a.log", "build"],
      includeDirectories: true,
      ignoredMode: "tracked-ignored",
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
      args: ["clean", "-f", "-d", "-x", "--", "tmp/a.log", "build"],
      timeoutMs: 1000,
    },
  ]);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.executionBlocked, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.deepEqual(result.output.gitArgs, ["clean", "-f", "-d", "-x", "--", "tmp/a.log", "build"]);
  assert.deepEqual(result.output.resultEnvelope.removedPaths, ["tmp/a.log", "build/"]);
  assert.equal(result.output.resultEnvelope.stdoutLineCount, 3);
});

test("executeGitCleanUntrackedFiles maps provider failure to public-safe error", async () => {
  const result = await executeGitCleanUntrackedFiles({
    target: { repositoryPath: "/repo/project", paths: ["tmp/a.log"] },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { allowed: true },
    },
    provider: async () => {
      throw new Error("fatal: /repo/project leaked raw command git clean -f tmp/a.log");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/repo\/project|git clean|tmp\/a\.log/u);
  }
});

test("parseGitCleanUntrackedFilesResult keeps safe fallback fields for malformed provider output", () => {
  const envelope = parseGitCleanUntrackedFilesResult(
    { exitCode: 0, stdout: "custom clean output\nWould remove tmp/preview.log\n", stderr: "" },
    {
      repositoryPath: "/repo/project",
      paths: ["tmp"],
      includeDirectories: true,
      ignoredMode: "none",
    },
  );

  assert.equal(envelope.parser, "git-clean-output-v1");
  assert.deepEqual(envelope.previewPaths, ["tmp/preview.log"]);
  assert.deepEqual(envelope.removedPaths, []);
  assert.equal(envelope.unparsedLineCount, 1);
  assert.equal(envelope.truncated, false);
});
