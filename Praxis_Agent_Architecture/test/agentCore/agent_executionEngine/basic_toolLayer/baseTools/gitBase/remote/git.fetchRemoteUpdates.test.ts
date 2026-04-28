import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitFetchRemoteUpdates,
  gitFetchRemoteUpdatesDescriptor,
  parseGitFetchRemoteUpdatesResult,
  planFetchRemoteUpdates,
  planGitFetchRemoteUpdates,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.fetchRemoteUpdates.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.fetchRemoteUpdates.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.fetchRemoteUpdates.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:write", "network:egress"],
} as const;

test("planFetchRemoteUpdates creates a fixed dry-run fetch plan without provider dispatch", () => {
  let providerCalled = false;
  const result = planFetchRemoteUpdates({
    target: {
      repositoryPath: "/repo/project",
      remoteName: "origin",
      refspecs: ["main"],
      prune: true,
      tagsMode: "no-tags",
    },
    context: { ...governedContext, dryRun: true },
    provider: async () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(gitFetchRemoteUpdatesDescriptor.defaultDispatch, "dry-run");
  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.deepEqual(result.output.gitArgs, ["fetch", "--prune", "--no-tags", "origin", "main"]);
    assert.deepEqual(result.output.commandPreview, ["git", "-C", "/repo/project", "fetch", "--prune", "--no-tags", "origin", "main"]);
    assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(result.output.risk.category, "remote-network");
    assert.equal(result.output.risk.updatesRemoteTrackingRefs, true);
    assert.equal(result.output.mayUseNetwork, true);
    assert.equal(result.output.providerCalled, false);
  }
});

test("git.fetchRemoteUpdates validates malformed JSON and unsafe arguments safely", async () => {
  const malformedContext = await executeGitFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project" },
    context: "bad-context" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const unsafeRemote = planGitFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project", remoteName: "--upload-pack=/tmp/fake" },
  });
  assert.equal(unsafeRemote.ok, false);
  if (!unsafeRemote.ok) assert.equal(unsafeRemote.error.code, "INVALID_ARGUMENT");

  const unsafeRefspec = planFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project", remoteName: "origin", refspecs: ["main dev"] },
  });
  assert.equal(unsafeRefspec.ok, false);
  if (!unsafeRefspec.ok) assert.equal(unsafeRefspec.error.code, "INVALID_ARGUMENT");

  const badTags = planFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project", tagsMode: "everything" as never },
  });
  assert.equal(badTags.ok, false);
  if (!badTags.ok) assert.equal(badTags.error.code, "INVALID_ARGUMENT");
});

test("git.fetchRemoteUpdates enforces scope, permission, governance, and provider boundaries", async () => {
  const scope = await executeGitFetchRemoteUpdates({
    target: { repositoryPath: "/outside/project" },
    context: governedContext,
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) assert.equal(scope.error.code, "SCOPE_REJECTED");

  const permission = await executeGitFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project" },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read"],
    },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  const noGuard = await executeGitFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write", "network:egress"],
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitFetchRemoteUpdates({
    target: { repositoryPath: "/repo/project" },
    context: governedContext,
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.fetchRemoteUpdates calls runtime git executor with fixed argv and parses output", async () => {
  const calls: string[] = [];
  const result = await executeGitFetchRemoteUpdates({
    target: {
      repositoryPath: "/repo/project",
      remoteName: "origin",
      refspecs: ["main"],
      prune: true,
      tagsMode: "tags",
    },
    context: governedContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: "",
        stderr: "From https://example.com/project.git\n * [new branch] main -> origin/main\n",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:fetch --prune --tags origin main"]);
  if (result.ok) {
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.resultEnvelope.fetched, true);
    assert.equal(result.output.resultEnvelope.updateLines.length, 1);
    assert.equal(result.output.resultEnvelope.updateLines[0]?.operation, "new");
    assert.equal(result.output.resultEnvelope.updateLines[0]?.destination, "origin/main");
  }
});

test("git.fetchRemoteUpdates provider failures stay public-safe", async () => {
  const result = await executeGitFetchRemoteUpdates({
    target: { repositoryPath: "/repo/private/project", remoteName: "origin" },
    context: {
      ...governedContext,
      allowedRepositoryRoots: ["/repo"],
    },
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

test("git.fetchRemoteUpdates parser ignores malformed lines without throwing", () => {
  const envelope = parseGitFetchRemoteUpdatesResult(
    {
      exitCode: 0,
      stdout: "noise without arrows\n",
      stderr: "From https://example.com/project.git\n   abc..def main -> origin/main\n",
    },
    { repositoryPath: "/repo/project", remoteName: "origin", refspecs: [], prune: false, tagsMode: "default" },
  );

  assert.equal(envelope.fetched, true);
  assert.equal(envelope.updateLines.length, 2);
  assert.equal(envelope.stderrLineCount, 2);
});

test("git.fetchRemoteUpdates is mounted in the BaseTool registry handler", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.fetchRemoteUpdates");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const calls: string[] = [];
  const result = await lookup.handler.invoke({
    toolCallId: "fetch-handler-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/repo/project", remoteName: "origin" },
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
              stderr: "From https://example.com/project.git\n",
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:fetch origin"]);
  const output = result.output as { runtimeEntry: { port: string } };
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
});
