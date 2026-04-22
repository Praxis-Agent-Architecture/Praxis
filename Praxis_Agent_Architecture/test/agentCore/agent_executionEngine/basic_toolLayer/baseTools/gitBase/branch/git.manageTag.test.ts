import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitTagManagement } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageTag.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageTag.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageTag.md",
  testFileUrl: import.meta.url,
});

test("planGitTagManagement creates a guarded annotated-tag dry-run plan", () => {
  const result = planGitTagManagement({
    target: { repositoryPath: "/repo/project", action: "annotate", tagName: " v1.0.0 ", targetRef: "main", message: "release" },
    context: {
      invocationId: "tag-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.manageTag");
  assert.equal(result.output.target.tagName, "v1.0.0");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "tag",
    "-a",
    "v1.0.0",
    "main",
    "-m",
    "release",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "tag-1");
});

test("planGitTagManagement rejects incomplete write actions", () => {
  const missingName = planGitTagManagement({
    target: { repositoryPath: "/repo/project", action: "delete" },
  });

  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.equal(missingName.error.code, "MISSING_TAG_NAME");
  }

  const missingMessage = planGitTagManagement({
    target: { repositoryPath: "/repo/project", action: "annotate", tagName: "v1.0.0" },
  });

  assert.equal(missingMessage.ok, false);
  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "MISSING_REQUIRED_FIELD");
  }
});

test("planGitTagManagement blocks real tag mutation", () => {
  const result = planGitTagManagement({
    target: { repositoryPath: "/repo/project", action: "create", tagName: "v1.0.0" },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
