import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  executeGitAddToStaging,
  gitAddToStagingDescriptor,
  parseGitAddToStagingResult,
  planGitAddToStaging,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.addToStaging.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.addToStaging.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.addToStaging.md",
  testFileUrl: import.meta.url,
});

test("planGitAddToStaging returns a governed dry-run staging plan", () => {
  const result = planGitAddToStaging({
    target: {
      repositoryPath: "/workspace/praxis",
      pathspecs: ["src/index.ts", " src/index.ts ", "test/index.test.ts"],
      intentToAdd: true,
    },
    context: {
      allowedRepositoryRoots: ["/workspace"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(gitAddToStagingDescriptor.unsafeSideEffects, true);
  assert.equal(gitAddToStagingDescriptor.operationRisk, "workspace-mutation");
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected add-to-staging dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.addToStaging");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.output.risk.mutatesIndex, true);
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.output.target.pathspecs, ["src/index.ts", "test/index.test.ts"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/workspace/praxis",
    "add",
    "--intent-to-add",
    "--",
    "src/index.ts",
    "test/index.test.ts",
  ]);
});

test("planGitAddToStaging rejects missing pathspecs, unsafe paths, missing permissions, and malformed context", () => {
  const missingPathspecs = planGitAddToStaging({
    target: { repositoryPath: "/workspace/praxis" },
  });

  assert.equal(missingPathspecs.ok, false);
  if (!missingPathspecs.ok) {
    assert.equal(missingPathspecs.error.code, "MISSING_TARGET_PATH");
    assert.equal(missingPathspecs.error.boundary, "input");
  }

  const escapedPath = planGitAddToStaging({
    target: { repositoryPath: "/workspace/praxis", pathspecs: ["../secret.txt"] },
  });
  assert.equal(escapedPath.ok, false);
  if (!escapedPath.ok) {
    assert.equal(escapedPath.error.code, "PATHSPEC_OUTSIDE_SCOPE");
  }

  const permissionDenied = planGitAddToStaging({
    target: { repositoryPath: "/workspace/praxis", all: true },
    context: { grantedPermissions: ["git:read", "git:write", "filesystem:read"] },
  });

  assert.equal(permissionDenied.ok, false);
  if (!permissionDenied.ok) {
    assert.equal(permissionDenied.error.code, "PERMISSION_DENIED");
    assert.equal(permissionDenied.error.boundary, "permission");
  }

  const malformed = planGitAddToStaging({
    target: { repositoryPath: "/workspace/praxis", pathspecs: ["src/index.ts"] },
    context: { grantedPermissions: [null] } as never,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_CONTEXT");
    assert.equal(malformed.error.internalDetailExposed, false);
  }
});

test("executeGitAddToStaging gates provider dispatch and calls fake runtime with fixed argv", async () => {
  let called = 0;
  const dryRun = await executeGitAddToStaging({
    target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"] },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(dryRun.ok, true);
  assert.equal(called, 0);

  const rejected = await executeGitAddToStaging({
    target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"] },
    context: { dryRun: false },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitAddToStaging({
    target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"] },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const interactive = await executeGitAddToStaging({
    target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"], patch: true },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      called += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(interactive.ok, false);
  if (!interactive.ok) {
    assert.equal(interactive.error.code, "INTERACTIVE_MODE_UNAVAILABLE");
  }

  const executed = await executeGitAddToStaging({
    target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"], intentToAdd: true },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      called += 1;
      assert.deepEqual(request.args, ["add", "--intent-to-add", "--", "src/index.ts"]);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(executed.ok, true);
  assert.equal(called, 1);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.executionBlocked, false);
    assert.equal(executed.output.resultEnvelope.pathspecs[0], "src/index.ts");
  }

  const failed = await executeGitAddToStaging({
    target: { repositoryPath: "/secret/repo", pathspecs: ["src/index.ts"] },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new Error("leaked /secret/repo git add");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(failed.error.message, /secret|git add/u);
  }
});

test("parseGitAddToStagingResult summarizes provider output safely", () => {
  const parsed = parseGitAddToStagingResult(
    { exitCode: 0, stdout: "one\n", stderr: "warn\n" },
    {
      repositoryPath: "/repo/project",
      pathspecs: ["src/index.ts"],
      all: false,
      update: false,
      intentToAdd: false,
      patch: false,
      force: false,
    },
  );
  assert.equal(parsed.exitCode, 0);
  assert.equal(parsed.stdoutLineCount, 2);
  assert.equal(parsed.stderrLineCount, 2);
});
