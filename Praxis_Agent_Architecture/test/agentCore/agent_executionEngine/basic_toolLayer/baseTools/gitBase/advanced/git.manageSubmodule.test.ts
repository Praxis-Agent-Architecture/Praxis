import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  manageSubmoduleDescriptor,
  planManageSubmodule,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageSubmodule.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageSubmodule.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageSubmodule.md",
  testFileUrl: import.meta.url,
});

test("planManageSubmodule creates a dry-run add plan", () => {
  const result = planManageSubmodule({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    action: "add",
    submodulePath: "vendor/toolkit",
    remoteUrl: "https://example.test/toolkit.git",
    branch: "main",
    requestedScopes: ["tool:git:submodule"],
    allowedScopes: ["tool:git:submodule"],
  });

  assert.equal(manageSubmoduleDescriptor.defaultDispatch, "dry-run");
  assert.equal(manageSubmoduleDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected manage submodule dry-run plan");
  }

  assert.equal(result.plan.toolKind, "git.manageSubmodule");
  assert.equal(result.plan.action, "add");
  assert.equal(result.plan.repositoryPath, ".");
  assert.equal(result.plan.submodulePath, "vendor/toolkit");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldModifyGitMetadata, true);
  assert.deepEqual(result.plan.requiredPermissions, ["git:submodule:read", "git:submodule:write:dry-run"]);
});

test("planManageSubmodule rejects incomplete add, escaped paths, denied scope, and real submodule changes", () => {
  const missingRemote = planManageSubmodule({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    action: "add",
    submodulePath: "vendor/toolkit",
  });

  assert.equal(missingRemote.ok, false);
  if (!missingRemote.ok) {
    assert.equal(missingRemote.error.code, "MISSING_REMOTE_URL");
    assert.equal(missingRemote.error.boundary, "input");
  }

  const escaped = planManageSubmodule({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    action: "update",
    submodulePath: "../toolkit",
  });

  assert.equal(escaped.ok, false);
  if (!escaped.ok) {
    assert.equal(escaped.error.code, "SUBMODULE_PATH_OUTSIDE_SCOPE");
    assert.equal(escaped.error.boundary, "scope");
  }

  const denied = planManageSubmodule({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    action: "status",
    requestedScopes: ["tool:git:submodule"],
    allowedScopes: ["tool:git:history"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realChange = planManageSubmodule({
    runtimeId: "runtime-1",
    repositoryPath: ".",
    action: "sync",
    submodulePath: "vendor/toolkit",
    dryRun: false,
  });

  assert.equal(realChange.ok, false);
  if (!realChange.ok) {
    assert.equal(realChange.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realChange.error.boundary, "governance");
  }
});
