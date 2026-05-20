import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitArchiveRepository,
  planGitRepositoryArchive,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.archiveRepository.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.archiveRepository.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/repository/git.archiveRepository.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "filesystem:write"],
} as const;

test("planGitRepositoryArchive creates a fixed dry-run archive plan", () => {
  const result = planGitRepositoryArchive({
    target: {
      repositoryPath: "/repo/project",
      outputPath: "/repo/project.zip",
      ref: " v1.0.0 ",
      format: "zip",
      pathspecs: [" src ", "docs", "src"],
      prefix: "project/",
    },
    context: {
      invocationId: "archive-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected archive dry-run plan");

  assert.equal(result.output.kind, "agentCore.basicTool.git.archiveRepository");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.target.ref, "v1.0.0");
  assert.deepEqual(result.output.target.pathspecs, ["src", "docs"]);
  assert.deepEqual(result.output.gitArgs, [
    "archive",
    "--format=zip",
    "--output",
    "/repo/project.zip",
    "--prefix=project/",
    "v1.0.0",
    "src",
    "docs",
  ]);
  assert.equal(result.audit[0]?.invocationId, "archive-1");
});

test("executeGitArchiveRepository rejects malformed input, output scope, governance, and missing provider", async () => {
  const malformed = await executeGitArchiveRepository({ context: [] as never });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_CONTEXT");

  const missingOutput = await executeGitArchiveRepository({
    target: { repositoryPath: "/repo/project" },
  });
  assert.equal(missingOutput.ok, false);
  if (!missingOutput.ok) assert.equal(missingOutput.error.code, "MISSING_TARGET_PATH");

  const scoped = await executeGitArchiveRepository({
    target: { repositoryPath: "/repo/project", outputPath: "/tmp/project.tar" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });
  assert.equal(scoped.ok, false);
  if (!scoped.ok) assert.equal(scoped.error.code, "SCOPE_REJECTED");

  const noGuard = await executeGitArchiveRepository({
    target: { repositoryPath: "/repo/project", outputPath: "/repo/project.tar" },
    context: { dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitArchiveRepository({
    target: { repositoryPath: "/repo/project", outputPath: "/repo/project.tar" },
    context: governedContext,
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeGitArchiveRepository calls fake runtime git executor with fixed argv and parses output", async () => {
  const calls: string[] = [];
  const result = await executeGitArchiveRepository({
    target: { repositoryPath: "/repo/project", outputPath: "/repo/project.tar", ref: "HEAD", format: "tar", pathspecs: ["src"] },
    context: governedContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected runtime execution");
  assert.deepEqual(calls, ["/repo/project:archive --format=tar --output /repo/project.tar HEAD src"]);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.resultEnvelope.archiveCreated, true);
});

test("executeGitArchiveRepository provider failure is public-safe and registry handler is mounted", async () => {
  const failed = await executeGitArchiveRepository({
    target: { repositoryPath: "/repo/project", outputPath: "/repo/project.tar" },
    context: governedContext,
    provider: async () => {
      throw new TypeError("secret /home/proview/private failed");
    },
  });

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(failed.error.message, /secret|private/u);
  }

  const handler = createBaseToolRegistry().lookupHandler("git.archiveRepository");
  assert.ok(handler);
});
