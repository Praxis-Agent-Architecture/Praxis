import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitCloneRepository,
  gitCloneRepositoryDescriptor,
  planGitRepositoryClone,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.cloneRepository.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.cloneRepository.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.cloneRepository.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { accepted: true },
  allowedRepositoryRoots: ["/workspace"],
  grantedPermissions: ["git:read", "filesystem:write"],
} as const;

test("planGitRepositoryClone returns a fixed dry-run command preview", () => {
  const result = planGitRepositoryClone({
    target: {
      repositoryPath: "/workspace",
      remoteUrl: "https://example.com/praxis.git",
      destinationPath: "/workspace/praxis",
      branch: "main",
      depth: 1,
      singleBranch: true,
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:read", "filesystem:write"],
      invocationId: "clone-1",
    },
  });

  assert.equal(gitCloneRepositoryDescriptor.tapOwnsApproval, true);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected clone dry-run plan");

  assert.equal(result.output.kind, "agentCore.basicTool.git.cloneRepository");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.mayUseNetwork, true);
  assert.deepEqual(result.output.gitArgs, [
    "clone",
    "--branch",
    "main",
    "--depth",
    "1",
    "--single-branch",
    "https://example.com/praxis.git",
    "/workspace/praxis",
  ]);
  assert.deepEqual(result.events, ["basicTool.git.cloneRepository.dryRun"]);
});

test("executeGitCloneRepository classifies malformed input, scope, governance, and provider boundaries", async () => {
  const malformed = await executeGitCloneRepository({ target: [] as never });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_ARGUMENT");

  const missingRemote = await executeGitCloneRepository({ target: { destinationPath: "/workspace/praxis" } });
  assert.equal(missingRemote.ok, false);
  if (!missingRemote.ok) assert.equal(missingRemote.error.code, "MISSING_REQUIRED_FIELD");

  const outOfScope = await executeGitCloneRepository({
    target: { repositoryPath: "/workspace", remoteUrl: "https://example.com/praxis.git", destinationPath: "/tmp/praxis" },
    context: { allowedRepositoryRoots: ["/workspace"] },
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) assert.equal(outOfScope.error.code, "SCOPE_REJECTED");

  const noGuard = await executeGitCloneRepository({
    target: { repositoryPath: "/workspace", remoteUrl: "https://example.com/praxis.git", destinationPath: "/workspace/praxis" },
    context: { dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitCloneRepository({
    target: { repositoryPath: "/workspace", remoteUrl: "https://example.com/praxis.git", destinationPath: "/workspace/praxis" },
    context: governedContext,
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeGitCloneRepository calls fake runtime git executor with fixed argv and parses output", async () => {
  const calls: string[] = [];
  const result = await executeGitCloneRepository({
    target: {
      repositoryPath: "/workspace",
      remoteUrl: "https://example.com/praxis.git",
      destinationPath: "/workspace/praxis",
      branch: "main",
      depth: 1,
      singleBranch: true,
    },
    context: governedContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return { exitCode: 0, stdout: "", stderr: "Cloning into '/workspace/praxis'...\n" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected runtime execution");
  assert.deepEqual(calls, ["/workspace:clone --branch main --depth 1 --single-branch https://example.com/praxis.git /workspace/praxis"]);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.resultEnvelope.cloned, true);
});

test("executeGitCloneRepository provider failure is public-safe and registry handler is mounted", async () => {
  const failed = await executeGitCloneRepository({
    target: { repositoryPath: "/workspace", remoteUrl: "https://example.com/praxis.git", destinationPath: "/workspace/praxis" },
    context: governedContext,
    provider: async () => {
      throw new Error("secret token in remote helper");
    },
  });

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(failed.error.message, /secret|token/u);
  }

  const handler = createBaseToolRegistry().lookupHandler("git.cloneRepository");
  assert.ok(handler);
});
