import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGitMoveOrRenameFile } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.md",
  testFileUrl: import.meta.url,
});

test("planGitMoveOrRenameFile creates a guarded dry-run move plan", () => {
  const result = planGitMoveOrRenameFile({
    target: {
      repositoryPath: "/repo/project",
      sourcePath: " src/old.ts ",
      destinationPath: "src/new.ts",
      force: true,
    },
    context: {
      invocationId: "move-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.moveOrRenameFile");
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "mv",
    "--force",
    "--",
    "src/old.ts",
    "src/new.ts",
  ]);
  assert.equal(result.output.target.sourcePath, "src/old.ts");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "move-1");
});

test("planGitMoveOrRenameFile separates pathspecs from git options", () => {
  const result = planGitMoveOrRenameFile({
    target: {
      repositoryPath: "/repo/project",
      sourcePath: "-old.ts",
      destinationPath: "-new.ts",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.output.commandPreview.slice(-3), ["--", "-old.ts", "-new.ts"]);
});

test("planGitMoveOrRenameFile rejects missing and unsafe paths", () => {
  const missing = planGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", destinationPath: "src/new.ts" },
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SOURCE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsafe = planGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "../old.ts", destinationPath: "src/new.ts" },
  });

  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "UNSAFE_FILE_PATH");
    assert.equal(unsafe.error.boundary, "scope");
  }
});

test("planGitMoveOrRenameFile blocks out-of-scope repositories and real execution", () => {
  const scoped = planGitMoveOrRenameFile({
    target: { repositoryPath: "/other/project", sourcePath: "old.ts", destinationPath: "new.ts" },
    context: { allowedRepositoryRoots: ["/repo"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const real = planGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
