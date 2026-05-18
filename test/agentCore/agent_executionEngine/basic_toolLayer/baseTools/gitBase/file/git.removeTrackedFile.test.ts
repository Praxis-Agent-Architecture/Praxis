import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeGitRemoveTrackedFile,
  parseGitRemoveTrackedFileResult,
  planGitRemoveTrackedFile,
  type GitRemoveTrackedFileProvider,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  invocationId: "remove-tracked-1",
  allowedRepositoryRoots: ["/repo"] as const,
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
} as const;

test("planGitRemoveTrackedFile creates a runtime-shaped dry-run removal plan", () => {
  const result = planGitRemoveTrackedFile({
    target: {
      repositoryPath: "/repo/project",
      filePath: " src/obsolete.ts ",
      keepWorkingTree: true,
      force: true,
    },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read", "git:write", "filesystem:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.removeTrackedFile");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.runtimeEntry.allowedSubcommand, "rm");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.risk.mutatesWorkingTree, false);
  assert.equal(result.output.risk.keepsWorkingTreeFile, true);
  assert.deepEqual(result.output.gitArgs, ["rm", "--cached", "--force", "--", "src/obsolete.ts"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "rm",
    "--cached",
    "--force",
    "--",
    "src/obsolete.ts",
  ]);
  assert.deepEqual(result.output.permissionsRequired, ["git:read", "git:write", "filesystem:read"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.audit[0]?.invocationId, "remove-tracked-1");
});

test("planGitRemoveTrackedFile validates malformed JSON and unsafe paths without raw TypeError", () => {
  const malformedContext = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
    context: "not-an-object" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const missing = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project" },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_FILE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsafe = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "/etc/passwd" },
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "UNSAFE_FILE_PATH");
    assert.equal(unsafe.error.boundary, "scope");
  }
});

test("planGitRemoveTrackedFile separates pathspecs from git options and enforces permissions", () => {
  const dashedPath = planGitRemoveTrackedFile({
    target: {
      repositoryPath: "/repo/project",
      filePath: "-obsolete.ts",
    },
  });
  assert.equal(dashedPath.ok, true);
  if (dashedPath.ok) {
    assert.deepEqual(dashedPath.output.gitArgs.slice(-2), ["--", "-obsolete.ts"]);
  }

  const permission = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
    context: { grantedPermissions: ["git:read"] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }
});

test("executeGitRemoveTrackedFile gates real execution on governance and runtime provider availability", async () => {
  const noGuard = await executeGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
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

  const noProvider = await executeGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
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

test("executeGitRemoveTrackedFile calls runtime provider with fixed argv and parses stdout", async () => {
  const providerCalls: unknown[] = [];
  const provider: GitRemoveTrackedFileProvider = async (request) => {
    providerCalls.push(request);
    return {
      exitCode: 0,
      stdout: "rm 'src/obsolete.ts'\n",
      stderr: "",
    };
  };

  const result = await executeGitRemoveTrackedFile({
    target: {
      repositoryPath: "/repo/project",
      filePath: "src/obsolete.ts",
      force: true,
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
      args: ["rm", "--force", "--", "src/obsolete.ts"],
      timeoutMs: 1000,
    },
  ]);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.executionBlocked, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.equal(result.output.risk.category, "destructive");
  assert.deepEqual(result.output.resultEnvelope.removedPaths, ["src/obsolete.ts"]);
});

test("executeGitRemoveTrackedFile maps provider failure to public-safe error", async () => {
  const result = await executeGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
    context: {
      ...governedContext,
      dryRun: false,
      guard: { allowed: true },
    },
    provider: async () => {
      throw new Error("fatal: /repo/project leaked raw command git rm src/obsolete.ts");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/repo\/project|git rm|src\/obsolete/u);
  }
});

test("parseGitRemoveTrackedFileResult keeps safe fallback fields for malformed provider output", () => {
  const envelope = parseGitRemoveTrackedFileResult(
    { exitCode: 0, stdout: "custom rm output\nrm 'src/obsolete.ts'\n", stderr: "" },
    {
      repositoryPath: "/repo/project",
      filePath: "src/obsolete.ts",
      keepWorkingTree: true,
      force: false,
    },
  );

  assert.equal(envelope.parser, "git-rm-output-v1");
  assert.deepEqual(envelope.cachedOnlyPaths, ["src/obsolete.ts"]);
  assert.deepEqual(envelope.removedPaths, []);
  assert.equal(envelope.unparsedLineCount, 1);
});
