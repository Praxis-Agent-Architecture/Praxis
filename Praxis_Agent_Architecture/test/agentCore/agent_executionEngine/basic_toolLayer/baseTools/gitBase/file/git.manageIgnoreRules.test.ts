import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  gitManageIgnoreRulesDescriptor,
  planGitIgnoreRuleManagement,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.manageIgnoreRules.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.manageIgnoreRules.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.manageIgnoreRules.md",
  testFileUrl: import.meta.url,
});

test("planGitIgnoreRuleManagement creates a guarded dry-run ignore-rule patch", () => {
  const result = planGitIgnoreRuleManagement({
    target: {
      repositoryPath: "/repo",
      action: "add",
      ignoreFilePath: ".gitignore",
      rules: ["dist/", "dist/", "  coverage/  "],
    },
    context: {
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(gitManageIgnoreRulesDescriptor.tapOwnsApproval, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected ignore-rule dry-run plan");
  }

  assert.deepEqual(result.output.patchPreview, {
    action: "add",
    ignoreFilePath: ".gitignore",
    rules: ["dist/", "coverage/"],
  });
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.executionBlocked, true);
});

test("planGitIgnoreRuleManagement rejects empty input, missing rules, and escaped ignore paths", () => {
  const missingRepository = planGitIgnoreRuleManagement();

  assert.equal(missingRepository.ok, false);
  if (!missingRepository.ok) {
    assert.equal(missingRepository.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missingRepository.error.boundary, "input");
  }

  const missingRules = planGitIgnoreRuleManagement({
    target: { repositoryPath: "/repo", action: "replace" },
  });

  assert.equal(missingRules.ok, false);
  if (!missingRules.ok) {
    assert.equal(missingRules.error.code, "MISSING_REQUIRED_FIELD");
    assert.equal(missingRules.error.boundary, "input");
  }

  const escapedPath = planGitIgnoreRuleManagement({
    target: {
      repositoryPath: "/repo",
      action: "add",
      ignoreFilePath: "../.gitignore",
      rules: ["dist/"],
    },
  });

  assert.equal(escapedPath.ok, false);
  if (!escapedPath.ok) {
    assert.equal(escapedPath.error.code, "SCOPE_REJECTED");
    assert.equal(escapedPath.error.boundary, "scope");
  }
});
