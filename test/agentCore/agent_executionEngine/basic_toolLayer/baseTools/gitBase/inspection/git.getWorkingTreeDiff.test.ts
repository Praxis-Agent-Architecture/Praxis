import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeGitWorkingTreeDiff,
  getWorkingTreeDiffDescriptor,
  parseGitWorkingTreeDiff,
  planGetWorkingTreeDiff,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getWorkingTreeDiff.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getWorkingTreeDiff.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getWorkingTreeDiff.md",
  testFileUrl: import.meta.url,
});

test("planGetWorkingTreeDiff creates a guarded dry-run diff plan", () => {
  const result = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: "./repo",
    mode: "combined",
    pathspecs: ["src/index.ts"],
    contextLines: 4,
    requestedScopes: ["tool:git:diff"],
    allowedScopes: ["tool:git:diff"],
  });

  assert.equal(getWorkingTreeDiffDescriptor.defaultDryRun, true);
  assert.equal(getWorkingTreeDiffDescriptor.operationRisk, "read-only-inspection");
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected working tree diff dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.getWorkingTreeDiff");
  assert.equal(result.plan.mode, "combined");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldReadWorkingTree, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.plan.commandPreview, [
    "git",
    "-C",
    "./repo",
    "diff",
    "--unified=4",
    "HEAD",
    "--",
    "src/index.ts",
  ]);
});

test("planGetWorkingTreeDiff rejects empty input, escaped pathspecs, denied scopes, and real execution", () => {
  const empty = planGetWorkingTreeDiff();

  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(empty.error.boundary, "input");
  }

  const escaped = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    pathspecs: ["../secret.txt"],
  });

  assert.equal(escaped.ok, false);
  if (!escaped.ok) {
    assert.equal(escaped.error.code, "PATHSPEC_OUTSIDE_SCOPE");
    assert.equal(escaped.error.boundary, "scope");
  }

  const optionLikeRef = planGetWorkingTreeDiff({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    compareRef: "--output=/tmp/diff",
  });

  assert.equal(optionLikeRef.ok, false);
  if (!optionLikeRef.ok) {
    assert.equal(optionLikeRef.error.code, "INVALID_COMPARE_REF");
  }

  const scoped = planGetWorkingTreeDiff({
    repositoryPath: "/other/project",
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }
});

test("executeGitWorkingTreeDiff gates provider dispatch and parses fake runtime output", async () => {
  let called = 0;
  const dryRun = await executeGitWorkingTreeDiff({
    target: { repositoryPath: "/repo/project", mode: "staged" },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(dryRun.ok, true);
  assert.equal(called, 0);

  const rejected = await executeGitWorkingTreeDiff({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitWorkingTreeDiff({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const executed = await executeGitWorkingTreeDiff({
    target: { repositoryPath: "/repo/project", mode: "combined", pathspecs: ["src/index.ts"], contextLines: 2 },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      called += 1;
      assert.deepEqual(request.args, ["diff", "--unified=2", "HEAD", "--", "src/index.ts"]);
      return {
        exitCode: 0,
        stdout: "diff --git a/src/index.ts b/src/index.ts\n@@ -1 +1 @@\n-old\n+new\n",
        stderr: "",
      };
    },
  });
  assert.equal(executed.ok, true);
  assert.equal(called, 1);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.resultEnvelope.files.length, 1);
    assert.equal(executed.output.resultEnvelope.hunkCount, 1);
  }
});

test("parseGitWorkingTreeDiff safely extracts files and hunks", () => {
  const parsed = parseGitWorkingTreeDiff("diff --git a/a.ts b/a.ts\nnew file mode 100644\n@@ -0,0 +1 @@\n+x\n");
  assert.equal(parsed.files[0]?.status, "added");
  assert.equal(parsed.hunkCount, 1);
});
