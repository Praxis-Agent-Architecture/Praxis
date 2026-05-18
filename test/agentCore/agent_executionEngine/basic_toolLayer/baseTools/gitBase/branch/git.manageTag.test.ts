import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitManageTag,
  gitManageTagHandler,
  parseGitManageTagResult,
  planGitTagManagement,
  type GitManageTagOutput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageTag.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageTag.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageTag.md",
  testFileUrl: import.meta.url,
});

function governedContext() {
  return {
    dryRun: false,
    guard: { allowed: true, accepted: true },
    allowedRepositoryRoots: ["/repo"],
    grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"] as const,
  };
}

test("planGitTagManagement creates a fixed dry-run annotated-tag envelope without provider dispatch", () => {
  const result = planGitTagManagement({
    target: {
      repositoryPath: "/repo/project",
      action: "annotate",
      tagName: " v1.0.0 ",
      targetRef: "main",
      message: "release",
    },
    context: {
      invocationId: "tag-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.git.manageTag");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.target.tagName, "v1.0.0");
  assert.deepEqual(result.output.gitArgs, ["tag", "-a", "v1.0.0", "main", "-m", "release"]);
  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/repo/project", "tag", "-a", "v1.0.0", "main", "-m", "release"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.output.risk.category, "history-mutation");
  assert.equal(result.audit[0]?.invocationId, "tag-1");
});

test("git.manageTag rejects malformed input and unsafe refs without raw TypeError", async () => {
  const malformed = await executeGitManageTag(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.doesNotMatch(malformed.error.message, /TypeError/u);
  }

  const malformedContext = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: "bad" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
  }

  const invalidAction = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "push" as never },
    context: governedContext(),
  });
  assert.equal(invalidAction.ok, false);
  if (!invalidAction.ok) {
    assert.equal(invalidAction.error.code, "INVALID_ACTION");
  }

  const missingName = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "delete" },
    context: governedContext(),
  });
  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.equal(missingName.error.code, "MISSING_TAG_NAME");
  }

  const missingMessage = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "annotate", tagName: "v1.0.0" },
    context: governedContext(),
  });
  assert.equal(missingMessage.ok, false);
  if (!missingMessage.ok) {
    assert.equal(missingMessage.error.code, "MISSING_MESSAGE");
  }

  const unsafeTag = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "create", tagName: "--bad" },
    context: governedContext(),
  });
  assert.equal(unsafeTag.ok, false);
  if (!unsafeTag.ok) {
    assert.equal(unsafeTag.error.code, "UNSAFE_REF");
  }

  const unsafeTarget = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "create", tagName: "v1.0.0", targetRef: "bad ref" },
    context: governedContext(),
  });
  assert.equal(unsafeTarget.ok, false);
  if (!unsafeTarget.ok) {
    assert.equal(unsafeTarget.error.code, "UNSAFE_REF");
  }
});

test("git.manageTag enforces scope, permissions, governance, and provider availability", async () => {
  const outOfScope = await executeGitManageTag({
    target: { repositoryPath: "/tmp/project", action: "list" },
    context: governedContext(),
  });
  assert.equal(outOfScope.ok, false);
  if (!outOfScope.ok) {
    assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "create", tagName: "v1.0.0" },
    context: { ...governedContext(), grantedPermissions: ["git:read", "git:write"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const missingGuard = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "delete", tagName: "v1.0.0" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(missingGuard.ok, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const listWithoutGuard = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { ...governedContext(), guard: undefined },
  });
  assert.equal(listWithoutGuard.ok, false);
  if (!listWithoutGuard.ok) {
    assert.equal(listWithoutGuard.error.code, "PROVIDER_UNAVAILABLE");
  }

  const missingProvider = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "create", tagName: "v1.0.0" },
    context: governedContext(),
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }
});

test("git.manageTag calls the runtime git executor with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "v1.0.0\nv1.1.0\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: governedContext(),
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:tag --list"]);
  if (!result.ok) return;

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.exitCode, 0);
  assert.deepEqual(result.output.resultEnvelope.tagNames, ["v1.0.0", "v1.1.0"]);
});

test("git.manageTag provider failures remain public-safe", async () => {
  const result = await executeGitManageTag({
    target: { repositoryPath: "/repo/project", action: "create", tagName: "v1.0.0" },
    context: governedContext(),
    provider: async () => {
      throw new Error("/repo/project/.git/refs/tags/v1.0.0 failed with private detail");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /\/repo\/project/u);
    assert.doesNotMatch(result.error.message, /\.git/u);
  }
});

test("git.manageTag parser handles dry-run, list, create, and delete", () => {
  const dryRun = parseGitManageTagResult(undefined, {
    repositoryPath: "/repo/project",
    action: "list",
    force: false,
  });
  assert.equal(dryRun.stdoutLineCount, 0);
  assert.deepEqual(dryRun.tagNames, []);

  const list = parseGitManageTagResult(
    { exitCode: 0, stdout: "v1.0.0\nv1.1.0\n", stderr: "" },
    { repositoryPath: "/repo/project", action: "list", force: false },
  );
  assert.deepEqual(list.tagNames, ["v1.0.0", "v1.1.0"]);

  const create = parseGitManageTagResult(
    { exitCode: 0, stdout: "", stderr: "" },
    { repositoryPath: "/repo/project", action: "create", tagName: "v1.0.0", force: false },
  );
  assert.equal(create.tagCreated, true);
  assert.equal(create.tagDeleted, false);

  const deleteResult = parseGitManageTagResult(
    { exitCode: 0, stdout: "Deleted tag 'v1.0.0' (was abc123)\n", stderr: "" },
    { repositoryPath: "/repo/project", action: "delete", tagName: "v1.0.0", force: false },
  );
  assert.equal(deleteResult.tagDeleted, true);
  assert.equal(deleteResult.operationHint, "Deleted tag 'v1.0.0' (was abc123)");
});

test("git.manageTag registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.manageTag");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;
  assert.equal(lookup.handler.definition.toolId, "git.manageTag");

  const result = await lookup.handler.invoke({
    toolCallId: "tag-handler-1",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", action: "list" },
      context: { allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "filesystem:read"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as GitManageTagOutput;
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.providerCalled, false);
    assert.equal(output.risk.category, "read-only-inspection");
  }

  assert.equal(gitManageTagHandler.definition.toolId, "git.manageTag");
});
