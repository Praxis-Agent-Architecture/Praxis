import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitPushLocalChanges,
  parseGitPushLocalChangesResult,
  planGitLocalPush,
  planGitPushLocalChanges,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pushLocalChanges.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pushLocalChanges.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.pushLocalChanges.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "network:egress"],
} as const;

test("planGitLocalPush creates a fixed dry-run push plan without provider dispatch", () => {
  let providerCalled = false;
  const result = planGitLocalPush({
    target: {
      repositoryPath: "/repo/project",
      remoteName: " origin ",
      branchName: " feature/a ",
      setUpstream: true,
      forceWithLease: true,
    },
    context: { ...governedContext, dryRun: true, invocationId: "push-1" },
    provider: async () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.deepEqual(result.output.gitArgs, ["push", "--set-upstream", "--force-with-lease", "origin", "feature/a"]);
    assert.deepEqual(result.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "push",
      "--set-upstream",
      "--force-with-lease",
      "origin",
      "feature/a",
    ]);
    assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(result.output.risk.category, "destructive");
    assert.equal(result.output.providerCalled, false);
    assert.equal(result.audit[0]?.invocationId, "push-1");
  }
});

test("git.pushLocalChanges validates malformed JSON and unsafe arguments safely", async () => {
  const malformedContext = await executeGitPushLocalChanges({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main" },
    context: "bad-context" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const missingBranch = planGitPushLocalChanges({
    target: { repositoryPath: "/repo/project", remoteName: "origin" },
  });
  assert.equal(missingBranch.ok, false);
  if (!missingBranch.ok) assert.equal(missingBranch.error.code, "INVALID_ARGUMENT");

  const unsafeRemote = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "--receive-pack=/tmp/fake", branchName: "main" },
  });
  assert.equal(unsafeRemote.ok, false);
  if (!unsafeRemote.ok) assert.equal(unsafeRemote.error.code, "INVALID_ARGUMENT");

  const badBoolean = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main", forceWithLease: "yes" as never },
  });
  assert.equal(badBoolean.ok, false);
  if (!badBoolean.ok) assert.equal(badBoolean.error.code, "INVALID_ARGUMENT");
});

test("git.pushLocalChanges supports tag and delete branch push plans", () => {
  const tags = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "origin", pushTags: true },
  });

  assert.equal(tags.ok, true);
  if (tags.ok) {
    assert.deepEqual(tags.output.gitArgs, ["push", "origin", "--tags"]);
    assert.equal(tags.output.risk.category, "remote-network");
  }

  const deleteBranch = planGitLocalPush({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "old/topic", deleteRemoteBranch: true },
  });

  assert.equal(deleteBranch.ok, true);
  if (deleteBranch.ok) {
    assert.deepEqual(deleteBranch.output.gitArgs, ["push", "origin", ":old/topic"]);
    assert.equal(deleteBranch.output.risk.category, "destructive");
  }
});

test("git.pushLocalChanges enforces scope, permission, governance, and provider boundaries", async () => {
  const scope = await executeGitPushLocalChanges({
    target: { repositoryPath: "/outside/project", remoteName: "origin", branchName: "main" },
    context: governedContext,
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) assert.equal(scope.error.code, "SCOPE_REJECTED");

  const permission = await executeGitPushLocalChanges({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main" },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read", "git:write"],
    },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  const noGuard = await executeGitPushLocalChanges({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "network:egress"],
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitPushLocalChanges({
    target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main" },
    context: governedContext,
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.pushLocalChanges calls runtime git executor with fixed argv and parses output", async () => {
  const calls: string[] = [];
  const result = await executeGitPushLocalChanges({
    target: {
      repositoryPath: "/repo/project",
      remoteName: "origin",
      branchName: "feature/a",
      setUpstream: true,
    },
    context: governedContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: "branch 'feature/a' set up to track 'origin/feature/a'.\n",
        stderr: "To https://example.com/project.git\n * [new branch] feature/a -> feature/a\n",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:push --set-upstream origin feature/a"]);
  if (result.ok) {
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.resultEnvelope.pushed, true);
    assert.equal(result.output.resultEnvelope.remoteName, "origin");
    assert.equal(result.output.resultEnvelope.pushLines.some((line) => line.operation === "new"), true);
  }
});

test("git.pushLocalChanges provider failures stay public-safe", async () => {
  const result = await executeGitPushLocalChanges({
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

test("git.pushLocalChanges parser keeps rejected hints public-safe", () => {
  const envelope = parseGitPushLocalChangesResult(
    {
      exitCode: 1,
      stdout: "",
      stderr: "! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs\n",
    },
    {
      repositoryPath: "/repo/project",
      remoteName: "origin",
      branchName: "main",
      setUpstream: false,
      forceWithLease: false,
      pushTags: false,
      deleteRemoteBranch: false,
    },
  );

  assert.equal(envelope.pushed, false);
  assert.equal(envelope.rejectedHints.length, 2);
  assert.equal(envelope.stderrLineCount, 2);
});

test("git.pushLocalChanges is mounted in the BaseTool registry handler", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.pushLocalChanges");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const calls: string[] = [];
  const result = await lookup.handler.invoke({
    toolCallId: "push-handler-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "feature/a", setUpstream: true },
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
              stderr: "To https://example.com/project.git\n * [new branch] feature/a -> feature/a\n",
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:push --set-upstream origin feature/a"]);
  const output = result.output as { runtimeEntry: { port: string } };
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
});
