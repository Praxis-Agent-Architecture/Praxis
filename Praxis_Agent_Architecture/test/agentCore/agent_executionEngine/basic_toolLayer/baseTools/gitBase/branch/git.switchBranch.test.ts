import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitBranchSwitch } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.switchBranch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.switchBranch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.switchBranch.md",
  testFileUrl: import.meta.url,
});

test("planGitBranchSwitch creates a guarded dry-run switch envelope", () => {
  const result = planGitBranchSwitch({
    target: {
      repositoryPath: "/repo/project",
      branchName: " feature/a ",
      create: true,
      startPoint: "origin/main",
      track: true,
    },
    context: {
      invocationId: "switch-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.switchBranch");
  assert.equal(result.output.target.branchName, "feature/a");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "switch",
    "--track",
    "-c",
    "feature/a",
    "origin/main",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "switch-1");
});

test("planGitBranchSwitch rejects missing branch names and permission gaps", () => {
  const missingBranch = planGitBranchSwitch({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missingBranch.ok, false);
  if (!missingBranch.ok) {
    assert.equal(missingBranch.error.code, "MISSING_BRANCH_NAME");
  }

  const missingPermission = planGitBranchSwitch({
    target: { repositoryPath: "/repo/project", branchName: "feature/a" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }
});

test("planGitBranchSwitch blocks real switch side effects", () => {
  const result = planGitBranchSwitch({
    target: { repositoryPath: "/repo/project", branchName: "main" },
    context: { dryRun: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
