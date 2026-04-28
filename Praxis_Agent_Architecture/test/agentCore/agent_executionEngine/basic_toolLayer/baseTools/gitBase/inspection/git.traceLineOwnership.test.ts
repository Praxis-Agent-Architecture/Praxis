import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeGitTraceLineOwnership,
  parseGitTraceLineOwnership,
  planTraceLineOwnership,
  traceLineOwnershipDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.traceLineOwnership.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.traceLineOwnership.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.traceLineOwnership.md",
  testFileUrl: import.meta.url,
});

test("planTraceLineOwnership creates a governed dry-run blame plan", () => {
  const result = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
    filePath: "src/index.ts",
    range: { startLine: 3, endLine: 8 },
    revision: "HEAD",
    context: {
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });

  assert.equal(traceLineOwnershipDescriptor.defaultDispatch, "dry-run");
  assert.equal(traceLineOwnershipDescriptor.operationRisk, "read-only-inspection");
  assert.equal(traceLineOwnershipDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected trace line ownership dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.traceLineOwnership");
  assert.equal(result.plan.filePath, "src/index.ts");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldReadBlameMetadata, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "blame",
    "--line-porcelain",
    "-L",
    "3,8",
    "HEAD",
    "--",
    "src/index.ts",
  ]);
});

test("planTraceLineOwnership rejects invalid file/range input, bad scope, and malformed context", () => {
  const missingRange = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
    filePath: "src/index.ts",
  });

  assert.equal(missingRange.ok, false);
  if (!missingRange.ok) {
    assert.equal(missingRange.error.code, "INVALID_LINE_RANGE");
    assert.equal(missingRange.error.boundary, "input");
  }

  const escapedFile = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
    filePath: "../index.ts",
    range: { startLine: 1, endLine: 1 },
  });

  assert.equal(escapedFile.ok, false);
  if (!escapedFile.ok) {
    assert.equal(escapedFile.error.code, "INVALID_FILE_PATH");
    assert.equal(escapedFile.error.boundary, "scope");
  }

  const scoped = planTraceLineOwnership({
    target: { repositoryPath: "/other/project", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 } },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const optionLikeRevision = planTraceLineOwnership({
    runtimeId: "runtime-1",
    repositoryPath: "/repo/project",
    filePath: "src/index.ts",
    range: { startLine: 1, endLine: 1 },
    revision: "--contents=/tmp/file",
  });

  assert.equal(optionLikeRevision.ok, false);
  if (!optionLikeRevision.ok) {
    assert.equal(optionLikeRevision.error.code, "INVALID_REVISION");
  }

  const malformed = planTraceLineOwnership({
    target: { repositoryPath: "/repo/project", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 } },
    context: "bad" as never,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_CONTEXT");
    assert.equal(malformed.error.internalDetailExposed, false);
  }
});

test("executeGitTraceLineOwnership gates provider dispatch and parses fake runtime output", async () => {
  let called = 0;
  const dryRun = await executeGitTraceLineOwnership({
    target: { repositoryPath: "/repo/project", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 } },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(dryRun.ok, true);
  assert.equal(called, 0);

  const rejected = await executeGitTraceLineOwnership({
    target: { repositoryPath: "/repo/project", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 } },
    context: { dryRun: false },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitTraceLineOwnership({
    target: { repositoryPath: "/repo/project", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 } },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const executed = await executeGitTraceLineOwnership({
    target: { repositoryPath: "/repo/project", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 }, revision: "HEAD" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      called += 1;
      assert.deepEqual(request.args, ["blame", "--line-porcelain", "-L", "1,1", "HEAD", "--", "src/index.ts"]);
      return {
        exitCode: 0,
        stdout: "abcdef123456 1 1 1\n" +
          "author Ada\n" +
          "author-mail <ada@example.com>\n" +
          "author-time 1777248000\n" +
          "summary Initial commit\n" +
          "filename src/index.ts\n" +
          "\tconsole.log('hi');\n",
        stderr: "",
      };
    },
  });
  assert.equal(executed.ok, true);
  assert.equal(called, 1);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.resultEnvelope.entries[0]?.commit, "abcdef123456");
    assert.equal(executed.output.resultEnvelope.entries[0]?.author, "Ada");
    assert.equal(executed.output.resultEnvelope.entries[0]?.sourceLine, "console.log('hi');");
  }

  const failed = await executeGitTraceLineOwnership({
    target: { repositoryPath: "/secret/repo", filePath: "src/index.ts", range: { startLine: 1, endLine: 1 } },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new Error("leaked /secret/repo git blame");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(failed.error.message, /secret|git blame/u);
  }
});

test("parseGitTraceLineOwnership safely extracts blame entries", () => {
  const parsed = parseGitTraceLineOwnership("abcdef 7 1 1\nauthor Ada\nsummary Initial\nfilename a.ts\n\tline\n");
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.finalLine, 1);
  assert.equal(parsed.entries[0]?.path, "a.ts");
});
