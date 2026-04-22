import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitAddToStagingDescriptor,
  planGitAddToStaging,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.addToStaging.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.addToStaging.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/staging/git.addToStaging.md",
  testFileUrl: import.meta.url,
});

test("planGitAddToStaging returns a guarded dry-run staging plan", () => {
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
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected add-to-staging dry-run plan");
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.addToStaging");
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

test("planGitAddToStaging rejects missing pathspecs and missing permissions", () => {
  const missingPathspecs = planGitAddToStaging({
    target: { repositoryPath: "/workspace/praxis" },
  });

  assert.equal(missingPathspecs.ok, false);
  if (!missingPathspecs.ok) {
    assert.equal(missingPathspecs.error.code, "MISSING_TARGET_PATH");
    assert.equal(missingPathspecs.error.boundary, "input");
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
});
