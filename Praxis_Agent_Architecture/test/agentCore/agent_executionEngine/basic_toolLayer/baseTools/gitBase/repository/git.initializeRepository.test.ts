import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitInitializeRepository,
  gitInitializeRepositoryDescriptor,
  planGitRepositoryInitialization,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.initializeRepository.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.initializeRepository.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.initializeRepository.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true },
  allowedRepositoryRoots: ["/workspace"],
  grantedPermissions: ["git:write", "filesystem:write"],
} as const;

test("planGitRepositoryInitialization returns a fixed dry-run init plan without provider", () => {
  const result = planGitRepositoryInitialization({
    target: {
      repositoryPath: "/workspace/new-repo",
      initialBranch: "main",
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:write", "filesystem:write"],
    },
  });

  assert.equal(gitInitializeRepositoryDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected init dry-run plan");

  assert.equal(result.output.kind, "agentCore.basicTool.git.initializeRepository");
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.output.gitArgs, ["init", "--initial-branch", "main"]);
  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/workspace/new-repo", "init", "--initial-branch", "main"]);
  assert.deepEqual(result.output.permissionsRequired, ["git:write", "filesystem:write"]);
});

test("executeGitInitializeRepository handles malformed input and governance/provider boundaries", async () => {
  const malformed = await executeGitInitializeRepository({ target: [] as never });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_ARGUMENT");

  const noGuard = await executeGitInitializeRepository({
    target: { repositoryPath: "/workspace/new-repo" },
    context: { dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitInitializeRepository({
    target: { repositoryPath: "/workspace/new-repo" },
    context: governedContext,
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeGitInitializeRepository calls fake runtime git executor with fixed argv and parses output", async () => {
  const calls: string[] = [];
  const result = await executeGitInitializeRepository({
    target: { repositoryPath: "/workspace/new-repo", initialBranch: "main" },
    context: governedContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return { exitCode: 0, stdout: "Initialized empty Git repository in /workspace/new-repo/.git/\n", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected runtime execution");
  assert.deepEqual(calls, ["/workspace/new-repo:init --initial-branch main"]);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.resultEnvelope.initialized, true);
});

test("executeGitInitializeRepository provider failure is public-safe", async () => {
  const result = await executeGitInitializeRepository({
    target: { repositoryPath: "/workspace/new-repo" },
    context: governedContext,
    provider: async () => {
      throw new TypeError("secret /tmp/private command failed");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /secret|\/tmp\/private/u);
  }
});

test("git.initializeRepository registry handler is mounted and old planner name stays usable", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("git.initializeRepository");
  assert.equal(lookup.ok, true);

  if (!lookup.ok) assert.fail("registry lookup failed");
  const result = await lookup.handler.invoke({
    toolCallId: "init-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/workspace/new-repo" },
      context: governedContext,
    },
    executor: {
      git: {
        async runGit(request) {
          assert.deepEqual(request.args, ["init"]);
          return { ok: true, output: { exitCode: 0, stdout: "Initialized empty Git repository\n", stderr: "" } };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as { providerCalled: boolean };
    assert.equal(output.providerCalled, true);
  }
});
