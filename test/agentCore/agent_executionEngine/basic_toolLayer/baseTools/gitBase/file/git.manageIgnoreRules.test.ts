import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitManageIgnoreRules,
  gitManageIgnoreRulesDescriptor,
  planGitIgnoreRuleManagement,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/file/git.manageIgnoreRules.js";
import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/file/git.manageIgnoreRules.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.manageIgnoreRules.md",
  testFileUrl: import.meta.url,
});

test("planGitIgnoreRuleManagement creates a runtime-shaped dry-run ignore-rule patch", () => {
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
  if (!result.ok) return;
  assert.equal(result.output.kind, "agentCore.basicTool.git.manageIgnoreRules");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.filesystem.readText/writeText");
  assert.deepEqual(result.output.operationPlan, ["add:.gitignore", "dist/", "coverage/"]);
  assert.equal(result.output.resultEnvelope.afterRuleCount, 2);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.executionBlocked, true);
});

test("planGitIgnoreRuleManagement validates malformed JSON, missing rules, and escaped paths", () => {
  const malformed = planGitIgnoreRuleManagement({
    target: null as unknown as Record<string, unknown>,
    context: { allowedRepositoryRoots: [1] } as unknown as Record<string, unknown>,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_CONTEXT");

  const missingRules = planGitIgnoreRuleManagement({
    target: { repositoryPath: "/repo", action: "replace" },
  });
  assert.equal(missingRules.ok, false);
  if (!missingRules.ok) assert.equal(missingRules.error.code, "MISSING_RULES");

  const escapedPath = planGitIgnoreRuleManagement({
    target: { repositoryPath: "/repo", action: "add", ignoreFilePath: "../.gitignore", rules: ["dist/"] },
  });
  assert.equal(escapedPath.ok, false);
  if (!escapedPath.ok) assert.equal(escapedPath.error.code, "UNSAFE_IGNORE_FILE_PATH");
});

test("executeGitManageIgnoreRules gates real execution on governance and provider availability", async () => {
  const noGuard = await executeGitManageIgnoreRules({
    target: { repositoryPath: "/repo", action: "add", rules: ["dist/"] },
    context: { dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitManageIgnoreRules({
    target: { repositoryPath: "/repo", action: "add", rules: ["dist/"] },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeGitManageIgnoreRules calls runtime filesystem provider and writes normalized content", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    filesystem: {
      async readText(request) {
        calls.push(`read:${request.path}`);
        return { ok: true, output: { content: "node_modules/\n", truncated: false } };
      },
      async writeText(request) {
        calls.push(`write:${request.path}:${request.content}`);
        return { ok: true, output: { bytesWritten: Buffer.byteLength(request.content, "utf8") } };
      },
    },
  };

  const result = await executeGitManageIgnoreRules({
    target: { repositoryPath: "/repo/project", action: "add", ignoreFilePath: ".gitignore", rules: ["dist/", "node_modules/"] },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["git:read", "filesystem:read", "filesystem:write"],
    },
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["read:/repo/project/.gitignore", "write:/repo/project/.gitignore:node_modules/\ndist/\n"]);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.resultEnvelope.beforeRuleCount, 1);
  assert.equal(result.output.resultEnvelope.afterRuleCount, 2);
  assert.deepEqual(result.output.resultEnvelope.addedRules, ["dist/"]);
  assert.deepEqual(result.output.resultEnvelope.unchangedRules, ["node_modules/"]);
});

test("executeGitManageIgnoreRules maps provider failure to public-safe error", async () => {
  const result = await executeGitManageIgnoreRules({
    target: { repositoryPath: "/repo/project", action: "add", rules: ["dist/"] },
    context: { dryRun: false, guard: { accepted: true } },
    provider: {
      readText() {
        throw new Error("private /repo/project/.gitignore detail");
      },
      writeText() {
        return { bytesWritten: 0 };
      },
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
    assert.doesNotMatch(result.error.message, /\/repo\/project/u);
  }
});

test("git.manageIgnoreRules registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.manageIgnoreRules");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "call-ignore",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", action: "inspect", ignoreFilePath: ".gitignore" },
      context: { dryRun: true, allowedRepositoryRoots: ["/repo"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as { runtimeEntry: { port: string } };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.filesystem.readText/writeText");
  }
});
