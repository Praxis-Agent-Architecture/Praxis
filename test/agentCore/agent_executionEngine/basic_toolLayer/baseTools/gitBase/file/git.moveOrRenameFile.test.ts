import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitMoveOrRenameFile,
  parseGitMoveOrRenameFileResult,
  planGitMoveOrRenameFile,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.js";
import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.md",
  testFileUrl: import.meta.url,
});

test("planGitMoveOrRenameFile creates a runtime-shaped dry-run move plan", () => {
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
  if (!result.ok) return;
  assert.equal(result.output.kind, "agentCore.basicTool.git.moveOrRenameFile");
  assert.deepEqual(result.output.gitArgs, ["mv", "--force", "--", "src/old.ts", "src/new.ts"]);
  assert.deepEqual(result.output.commandPreview, ["git", "-C", "/repo/project", "mv", "--force", "--", "src/old.ts", "src/new.ts"]);
  assert.equal(result.output.target.sourcePath, "src/old.ts");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.risk.category, "workspace-mutation");
  assert.equal(result.audit[0]?.invocationId, "move-1");
});

test("planGitMoveOrRenameFile validates malformed JSON and unsafe paths without raw TypeError", () => {
  const malformed = planGitMoveOrRenameFile({
    target: null as unknown as Record<string, unknown>,
    context: { runtimeId: 1 } as unknown as Record<string, unknown>,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_ARGUMENT");

  const unsafe = planGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "../old.ts", destinationPath: "src/new.ts" },
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) assert.equal(unsafe.error.code, "UNSAFE_FILE_PATH");

  const missing = planGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", destinationPath: "src/new.ts" },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "MISSING_SOURCE_PATH");
});

test("planGitMoveOrRenameFile separates pathspecs from git options and enforces permissions", () => {
  const result = planGitMoveOrRenameFile({
    target: {
      repositoryPath: "/repo/project",
      sourcePath: "-old.ts",
      destinationPath: "-new.ts",
    },
    context: {
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.output.gitArgs, ["mv", "--", "-old.ts", "-new.ts"]);

  const denied = planGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts" },
    context: { grantedPermissions: ["git:read"] },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "PERMISSION_DENIED");
});

test("executeGitMoveOrRenameFile gates real execution on governance and runtime provider availability", async () => {
  const noGuard = await executeGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts" },
    context: { dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts" },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeGitMoveOrRenameFile calls runtime provider with fixed argv and parses stdout", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return { ok: true, output: { exitCode: 0, stdout: "", stderr: "" } };
      },
    },
  };

  const result = await executeGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "src/old.ts", destinationPath: "src/new.ts", force: true },
    context: {
      dryRun: false,
      guard: { allowed: true },
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:mv --force -- src/old.ts src/new.ts"]);
  if (!result.ok) return;
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.exitCode, 0);
  assert.deepEqual(result.output.resultEnvelope.movedPairs, [{ sourcePath: "src/old.ts", destinationPath: "src/new.ts" }]);
});

test("executeGitMoveOrRenameFile maps provider failure to public-safe error", async () => {
  const result = await executeGitMoveOrRenameFile({
    target: { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private /repo/project command detail");
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

test("parseGitMoveOrRenameFileResult keeps safe fallback fields for malformed provider output", () => {
  const parsed = parseGitMoveOrRenameFileResult(
    { exitCode: 0, stdout: "unexpected output\n", stderr: "" },
    { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts", force: false },
  );
  assert.equal(parsed.parser, "git-mv-output-v1");
  assert.equal(parsed.unparsedLineCount, 1);
  assert.deepEqual(parsed.movedPairs, [{ sourcePath: "old.ts", destinationPath: "new.ts" }]);
});

test("git.moveOrRenameFile registry handler remains callable", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.moveOrRenameFile");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "call-move",
    runtimeId: "runtime-test",
    sessionId: "session-test",
    input: {
      target: { repositoryPath: "/repo/project", sourcePath: "old.ts", destinationPath: "new.ts" },
      context: { dryRun: true, allowedRepositoryRoots: ["/repo"] },
    },
    executor: {},
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const output = result.output as { runtimeEntry: { port: string } };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  }
});
