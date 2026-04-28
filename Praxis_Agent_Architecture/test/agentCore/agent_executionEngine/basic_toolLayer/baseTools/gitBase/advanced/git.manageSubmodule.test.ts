import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitManageSubmodule,
  gitManageSubmoduleDescriptor,
  parseGitManageSubmoduleResult,
  planGitManageSubmodule,
  planManageSubmodule,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageSubmodule.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageSubmodule.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.manageSubmodule.md",
  testFileUrl: import.meta.url,
});

const governedContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write", "network:egress"],
} as const;

test("planManageSubmodule creates a fixed dry-run add plan without provider dispatch", () => {
  let providerCalled = false;
  const result = planManageSubmodule({
    target: {
      repositoryPath: "/repo/project",
      action: "add",
      submodulePath: "vendor/toolkit",
      remoteUrl: "https://example.test/toolkit.git",
      branch: "main",
    },
    context: { ...governedContext, dryRun: true, invocationId: "submodule-1" },
    provider: async () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(gitManageSubmoduleDescriptor.defaultDispatch, "dry-run");
  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.deepEqual(result.output.gitArgs, [
      "submodule",
      "add",
      "-b",
      "main",
      "https://example.test/toolkit.git",
      "vendor/toolkit",
    ]);
    assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(result.output.risk.category, "remote-network");
    assert.equal(result.output.mayUseNetwork, true);
    assert.equal(result.audit[0]?.invocationId, "submodule-1");
  }
});

test("git.manageSubmodule validates malformed JSON and unsafe arguments safely", async () => {
  const malformedContext = await executeGitManageSubmodule({
    target: { repositoryPath: "/repo/project" },
    context: "bad-context" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const missingRemote = planGitManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "add", submodulePath: "vendor/toolkit" },
  });
  assert.equal(missingRemote.ok, false);
  if (!missingRemote.ok) assert.equal(missingRemote.error.code, "MISSING_REMOTE_URL");

  const escaped = planManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "update", submodulePath: "../toolkit" },
  });
  assert.equal(escaped.ok, false);
  if (!escaped.ok) assert.equal(escaped.error.code, "INVALID_ARGUMENT");

  const unsafeBranch = planManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "add", submodulePath: "vendor/toolkit", remoteUrl: "https://example.test/toolkit.git", branch: "--bad" },
  });
  assert.equal(unsafeBranch.ok, false);
  if (!unsafeBranch.ok) assert.equal(unsafeBranch.error.code, "INVALID_ARGUMENT");
});

test("git.manageSubmodule enforces scope, permission, governance, and provider boundaries", async () => {
  const scope = await executeGitManageSubmodule({
    target: { repositoryPath: "/outside/project", action: "status" },
    context: governedContext,
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) assert.equal(scope.error.code, "SCOPE_REJECTED");

  const permission = await executeGitManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "add", submodulePath: "vendor/toolkit", remoteUrl: "https://example.test/toolkit.git" },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  const noGuard = await executeGitManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "sync", submodulePath: "vendor/toolkit" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await executeGitManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "status" },
    context: { dryRun: false, allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "filesystem:read"] },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.manageSubmodule calls runtime git executor with fixed argv and parses status output", async () => {
  const calls: string[] = [];
  const result = await executeGitManageSubmodule({
    target: { repositoryPath: "/repo/project", action: "status", recursive: true },
    context: { dryRun: false, allowedRepositoryRoots: ["/repo"], grantedPermissions: ["git:read", "filesystem:read"] },
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: " abcdef1234567890 vendor/toolkit (heads/main)\n-1111111111111111 vendor/missing\n",
        stderr: "",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:submodule status --recursive"]);
  if (result.ok) {
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.resultEnvelope.entries.length, 2);
    assert.equal(result.output.resultEnvelope.entries[0]?.status, "initialized");
    assert.equal(result.output.resultEnvelope.entries[1]?.status, "uninitialized");
  }
});

test("git.manageSubmodule provider failures stay public-safe", async () => {
  const result = await executeGitManageSubmodule({
    target: { repositoryPath: "/repo/private/project", action: "deinit", submodulePath: "vendor/toolkit" },
    context: {
      ...governedContext,
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
    provider: async () => {
      throw new Error("fatal: leaked /repo/private/project token");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /private|token/u);
  }
});

test("git.manageSubmodule parser keeps safe fallback fields for mutation output", () => {
  const envelope = parseGitManageSubmoduleResult(
    {
      exitCode: 0,
      stdout: "",
      stderr: "Synchronizing submodule url for 'vendor/toolkit'\n",
    },
    {
      repositoryPath: "/repo/project",
      action: "sync",
      submodulePath: "vendor/toolkit",
      recursive: true,
    },
  );

  assert.equal(envelope.submoduleChanged, true);
  assert.equal(envelope.entries.length, 0);
  assert.equal(envelope.stderrLineCount, 1);
});

test("git.manageSubmodule is mounted in the BaseTool registry handler", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("git.manageSubmodule");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const calls: string[] = [];
  const result = await lookup.handler.invoke({
    toolCallId: "submodule-handler-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/repo/project", action: "sync", submodulePath: "vendor/toolkit" },
      context: {
        ...governedContext,
        grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
      },
    },
    executor: {
      git: {
        async runGit(request) {
          calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "Synchronizing submodule url for 'vendor/toolkit'\n",
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:submodule sync --recursive -- vendor/toolkit"]);
  const output = result.output as { runtimeEntry: { port: string }; resultEnvelope: { submoduleChanged: boolean } };
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(output.resultEnvelope.submoduleChanged, true);
});
