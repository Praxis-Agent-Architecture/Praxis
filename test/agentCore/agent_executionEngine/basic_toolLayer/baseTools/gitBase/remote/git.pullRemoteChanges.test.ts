import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitPullRemoteChanges,
  parseGitPullRemoteChangesResult,
  planGitPullRemoteChanges,
  planGitRemotePull,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pullRemoteChanges.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pullRemoteChanges.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pullRemoteChanges.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:write", "network:egress"],
} as const;

test("planGitRemotePull creates a fixed dry-run pull plan without provider dispatch", () => {
  let providerCalled = false;
  const result = planGitRemotePull({
    target: {
      repositoryPath: "/repo/project",
      remoteName: " origin ",
      branchName: " main ",
      integrationMode: "rebase",
      autostash: true,
      prune: true,
    },
    context: { ...governedContext, dryRun: true, invocationId: "pull-1" },
    provider: async () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.deepEqual(result.output.gitArgs, ["pull", "--prune", "--autostash", "--rebase", "origin", "main"]);
    assert.deepEqual(result.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "pull",
      "--prune",
      "--autostash",
      "--rebase",
      "origin",
      "main",
    ]);
    assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(result.output.risk.category, "remote-network");
    assert.equal(result.output.risk.mutatesWorkingTree, true);
    assert.equal(result.output.risk.mayCreateConflicts, true);
    assert.equal(result.audit[0]?.invocationId, "pull-1");
  }
});

test("git.pullRemoteChanges validates malformed JSON and unsafe arguments safely", async () => {
  const malformedContext = await executeGitPullRemoteChanges({
    target: { repositoryPath: "/repo/project" },
    context: "bad-context" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const partial = planGitPullRemoteChanges({
    target: { repositoryPath: "/repo/project", remoteName: "origin" },
  });
  assert.equal(partial.ok, false);
  if (!partial.ok) assert.equal(partial.error.code, "INVALID_ARGUMENT");

  const unsafeBranch = planGitRemotePull({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "--upload-pack=/tmp/fake" },
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) assert.equal(unsafeBranch.error.code, "INVALID_ARGUMENT");

  const badMode = planGitRemotePull({
    target: { repositoryPath: "/repo/project", integrationMode: "octopus" as never },
  });
  assert.equal(badMode.ok, false);
  if (!badMode.ok) assert.equal(badMode.error.code, "INVALID_ARGUMENT");
});

test("git.pullRemoteChanges enforces scope, permission, governance, and provider boundaries", async () => {
  const scope = await executeGitPullRemoteChanges({
    target: { repositoryPath: "/outside/project" },
    context: governedContext,
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) assert.equal(scope.error.code, "SCOPE_REJECTED");

  const permission = await executeGitPullRemoteChanges({
    target: { repositoryPath: "/repo/project" },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read"],
    },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  const noGuard = await executeGitPullRemoteChanges({
    target: { repositoryPath: "/repo/project" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write", "network:egress"],
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitPullRemoteChanges({
    target: { repositoryPath: "/repo/project" },
    context: governedContext,
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.pullRemoteChanges calls runtime git executor with fixed argv and parses output", async () => {
  const calls: string[] = [];
  const result = await executeGitPullRemoteChanges({
    target: {
      repositoryPath: "/repo/project",
      remoteName: "origin",
      branchName: "main",
      integrationMode: "ff-only",
      prune: true,
    },
    context: governedContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: "Updating abc..def\nFast-forward\n src/index.ts | 1 +\n",
        stderr: "From https://example.com/project.git\n",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:pull --prune --ff-only origin main"]);
  if (result.ok) {
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.resultEnvelope.pulled, true);
    assert.equal(result.output.resultEnvelope.integrationMode, "ff-only");
    assert.equal(result.output.resultEnvelope.updateLines[0]?.operation, "update");
  }
});

test("git.pullRemoteChanges provider failures stay public-safe", async () => {
  const result = await executeGitPullRemoteChanges({
    target: { repositoryPath: "/repo/private/project", remoteName: "origin", branchName: "main" },
    context: governedContext,
    provider: async () => {
      throw new Error("fatal: credential helper leaked /repo/private/project token");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /private|credential|token/u);
  }
});

test("git.pullRemoteChanges parser keeps conflict hints public-safe", () => {
  const envelope = parseGitPullRemoteChangesResult(
    {
      exitCode: 1,
      stdout: "Auto-merging src/index.ts\nCONFLICT (content): Merge conflict in src/index.ts\n",
      stderr: "Automatic merge failed; fix conflicts and then commit the result.\n",
    },
    { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main", integrationMode: "merge", autostash: false, prune: false },
  );

  assert.equal(envelope.pulled, false);
  assert.equal(envelope.conflictHints.length, 2);
  assert.equal(envelope.stdoutLineCount, 2);
});

test("git.pullRemoteChanges is mounted in the BaseTool registry handler", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.pullRemoteChanges");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const calls: string[] = [];
  const result = await lookup.handler.invoke({
    toolCallId: "pull-handler-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main", integrationMode: "ff-only" },
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
              stdout: "Already up to date.\n",
              stderr: "",
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:pull --ff-only origin main"]);
  const output = result.output as { runtimeEntry: { port: string } };
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
});
