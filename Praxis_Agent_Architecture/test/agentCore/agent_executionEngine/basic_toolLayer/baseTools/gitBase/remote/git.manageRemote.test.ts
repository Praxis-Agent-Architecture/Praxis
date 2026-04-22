import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitRemoteManagement } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.manageRemote.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.manageRemote.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.manageRemote.md",
  testFileUrl: import.meta.url,
});

test("planGitRemoteManagement creates a guarded dry-run set-url plan", () => {
  const result = planGitRemoteManagement({
    target: {
      repositoryPath: "/repo/project",
      action: "set-url",
      remoteName: " origin ",
      remoteUrl: "git@example.com:org/project.git",
      urlMode: "push",
    },
    context: {
      invocationId: "remote-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.manageRemote");
  assert.equal(result.output.target.remoteName, "origin");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "remote",
    "set-url",
    "--push",
    "origin",
    "git@example.com:org/project.git",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "remote-1");
});

test("planGitRemoteManagement rejects incomplete remote mutations", () => {
  const missingUrl = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "add", remoteName: "origin" },
  });

  assert.equal(missingUrl.ok, false);
  if (!missingUrl.ok) {
    assert.equal(missingUrl.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(missingUrl.error.boundary, "input");
  }

  const missingNewName = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "rename", remoteName: "origin" },
  });

  assert.equal(missingNewName.ok, false);
  if (!missingNewName.ok) {
    assert.equal(missingNewName.error.code, "MISSING_REQUIRED_FIELD");
  }
});

test("planGitRemoteManagement keeps list read-only and blocks real execution", () => {
  const list = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(list.ok, true);
  if (list.ok) {
    assert.equal(list.output.unsafeSideEffects, false);
    assert.deepEqual(list.output.permissionsRequired, ["git:read"]);
  }

  const real = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "remove", remoteName: "origin" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
