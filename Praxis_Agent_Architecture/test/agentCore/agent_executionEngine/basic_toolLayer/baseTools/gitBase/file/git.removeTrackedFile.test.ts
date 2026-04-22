import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitRemoveTrackedFile } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.md",
  testFileUrl: import.meta.url,
});

test("planGitRemoveTrackedFile creates a guarded dry-run removal plan", () => {
  const result = planGitRemoveTrackedFile({
    target: {
      repositoryPath: "/repo/project",
      filePath: " src/obsolete.ts ",
      keepWorkingTree: true,
      force: true,
    },
    context: {
      invocationId: "remove-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.removeTrackedFile");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "rm",
    "--cached",
    "--force",
    "--",
    "src/obsolete.ts",
  ]);
  assert.equal(result.output.target.filePath, "src/obsolete.ts");
  assert.deepEqual(result.output.permissionsRequired, ["git:read", "git:write", "filesystem:read"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.audit[0]?.invocationId, "remove-1");
});

test("planGitRemoveTrackedFile separates pathspecs from git options", () => {
  const result = planGitRemoveTrackedFile({
    target: {
      repositoryPath: "/repo/project",
      filePath: "-obsolete.ts",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.output.commandPreview.slice(-2), ["--", "-obsolete.ts"]);
});

test("planGitRemoveTrackedFile rejects missing and unsafe paths", () => {
  const missing = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project" },
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_FILE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsafe = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "/etc/passwd" },
  });

  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "UNSAFE_FILE_PATH");
    assert.equal(unsafe.error.boundary, "scope");
  }
});

test("planGitRemoveTrackedFile blocks missing permissions and real execution", () => {
  const permission = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planGitRemoveTrackedFile({
    target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
