import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeGitShowObjectDetails,
  parseGitShowObjectDetails,
  planShowGitObjectDetails,
  showGitObjectDetailsDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.showGitObjectDetails.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.showGitObjectDetails.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.showGitObjectDetails.md",
  testFileUrl: import.meta.url,
});

test("planShowGitObjectDetails creates a governed dry-run object inspection plan", () => {
  const result = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
    objectRef: "HEAD",
    format: "raw",
    context: {
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });

  assert.equal(showGitObjectDetailsDescriptor.defaultDispatch, "dry-run");
  assert.equal(showGitObjectDetailsDescriptor.operationRisk, "read-only-inspection");
  assert.equal(showGitObjectDetailsDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected show git object details dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.showGitObjectDetails");
  assert.equal(result.plan.format, "raw");
  assert.equal(result.plan.maxBytes, showGitObjectDetailsDescriptor.defaultMaxBytes);
  assert.deepEqual(result.plan.requiredPermissions, ["git:read", "filesystem:read"]);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "show",
    "--no-ext-diff",
    "--no-patch",
    "--pretty=raw",
    "HEAD",
  ]);
});

test("planShowGitObjectDetails rejects missing refs, unsafe refs, bad scope, and malformed context", () => {
  const missingRef = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
  });

  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) {
    assert.equal(missingRef.error.code, "MISSING_OBJECT_REF");
  }

  const unsafeRef = planShowGitObjectDetails({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
    objectRef: "HEAD bad",
  });

  assert.equal(unsafeRef.ok, false);
  if (!unsafeRef.ok) {
    assert.equal(unsafeRef.error.code, "INVALID_OBJECT_REF");
    assert.equal(unsafeRef.error.boundary, "input");
  }

  const scoped = planShowGitObjectDetails({
    target: { repositoryPath: "/other/project", objectRef: "HEAD" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const malformed = planShowGitObjectDetails({
    target: { repositoryPath: "/repo/project", objectRef: "HEAD" },
    context: "bad" as never,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_CONTEXT");
    assert.equal(malformed.error.internalDetailExposed, false);
  }
});

test("executeGitShowObjectDetails gates provider dispatch and parses fake runtime output", async () => {
  let called = 0;
  const dryRun = await executeGitShowObjectDetails({
    target: { repositoryPath: "/repo/project", objectRef: "HEAD", format: "summary" },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(dryRun.ok, true);
  assert.equal(called, 0);

  const rejected = await executeGitShowObjectDetails({
    target: { repositoryPath: "/repo/project", objectRef: "HEAD", format: "summary" },
    context: { dryRun: false },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitShowObjectDetails({
    target: { repositoryPath: "/repo/project", objectRef: "HEAD", format: "summary" },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const executed = await executeGitShowObjectDetails({
    target: { repositoryPath: "/repo/project", objectRef: "HEAD", format: "raw", maxBytes: 10_000 },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      called += 1;
      assert.deepEqual(request.args, ["show", "--no-ext-diff", "--no-patch", "--pretty=raw", "HEAD"]);
      return {
        exitCode: 0,
        stdout: "commit abcdef123456\n" +
          "tree 111111\n" +
          "author Ada <ada@example.com> 1777248000 +0000\n" +
          "committer Ada <ada@example.com> 1777248000 +0000\n\n" +
          "    Initial commit\n",
        stderr: "",
      };
    },
  });
  assert.equal(executed.ok, true);
  assert.equal(called, 1);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.dryRun, false);
    assert.equal(executed.output.resultEnvelope.commit?.commit, "abcdef123456");
    assert.equal(executed.output.resultEnvelope.commit?.subject, "Initial commit");
  }

  const failed = await executeGitShowObjectDetails({
    target: { repositoryPath: "/secret/repo", objectRef: "HEAD", format: "summary" },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new Error("leaked /secret/repo git show HEAD");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(failed.error.message, /secret|git show/u);
  }
});

test("parseGitShowObjectDetails safely exposes output metadata and truncation", () => {
  const parsed = parseGitShowObjectDetails("line 1\nline 2\n", {
    repositoryPath: "/repo/project",
    objectRef: "HEAD",
    format: "summary",
    maxBytes: 6,
  });
  assert.equal(parsed.lineCount, 3);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.stdoutPreview, "line 1");
});
