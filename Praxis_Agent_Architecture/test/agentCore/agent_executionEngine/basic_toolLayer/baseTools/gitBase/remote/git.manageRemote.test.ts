import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitManageRemote,
  parseGitManageRemoteResult,
  planGitManageRemote,
  planGitRemoteManagement,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.manageRemote.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.manageRemote.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/remote/git.manageRemote.md",
  testFileUrl: import.meta.url,
});

const readOnlyContext = {
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "filesystem:read"],
} as const;

const governedMutationContext = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
} as const;

test("planGitRemoteManagement creates fixed dry-run plans without calling a provider", () => {
  let providerCalled = false;
  const list = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: readOnlyContext,
    provider: async () => {
      providerCalled = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(list.ok, true);
  assert.equal(providerCalled, false);
  if (list.ok) {
    assert.deepEqual(list.output.gitArgs, ["remote", "-v"]);
    assert.equal(list.output.providerCalled, false);
    assert.equal(list.output.risk.category, "read-only-inspection");
    assert.deepEqual(list.output.permissionsRequired, ["git:read", "filesystem:read"]);
  }

  const setUrl = planGitManageRemote({
    target: {
      repositoryPath: "/repo/project",
      action: "set-url",
      remoteName: " origin ",
      remoteUrl: "git@example.com:org/project.git",
      urlMode: "push",
    },
    context: { ...governedMutationContext, dryRun: true },
  });

  assert.equal(setUrl.ok, true);
  if (setUrl.ok) {
    assert.deepEqual(setUrl.output.gitArgs, ["remote", "set-url", "--push", "origin", "git@example.com:org/project.git"]);
    assert.deepEqual(setUrl.output.commandPreview, [
      "git",
      "-C",
      "/repo/project",
      "remote",
      "set-url",
      "--push",
      "origin",
      "git@example.com:org/project.git",
    ]);
    assert.equal(setUrl.output.unsafeSideEffects, true);
    assert.equal(setUrl.output.risk.category, "workspace-mutation");
  }
});

test("git.manageRemote validates malformed JSON and required fields safely", async () => {
  const malformedContext = await executeGitManageRemote({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: "not-json" as never,
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) {
    assert.equal(malformedContext.error.code, "INVALID_CONTEXT");
    assert.equal(malformedContext.error.publicSafe, true);
    assert.doesNotMatch(malformedContext.error.message, /TypeError/u);
  }

  const missingUrl = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "add", remoteName: "origin" },
  });
  assert.equal(missingUrl.ok, false);
  if (!missingUrl.ok) assert.equal(missingUrl.error.code, "MISSING_REQUIRED_FIELD");

  const missingNewName = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "rename", remoteName: "origin" },
  });
  assert.equal(missingNewName.ok, false);
  if (!missingNewName.ok) assert.equal(missingNewName.error.code, "MISSING_REQUIRED_FIELD");

  const unsafeRemote = planGitRemoteManagement({
    target: { repositoryPath: "/repo/project", action: "remove", remoteName: "--upload-pack" },
  });
  assert.equal(unsafeRemote.ok, false);
  if (!unsafeRemote.ok) assert.equal(unsafeRemote.error.code, "INVALID_ARGUMENT");
});

test("git.manageRemote enforces governance and provider boundaries", async () => {
  const noGuard = await executeGitManageRemote({
    target: { repositoryPath: "/repo/project", action: "remove", remoteName: "origin" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProviderReadOnly = await executeGitManageRemote({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { ...readOnlyContext, dryRun: false },
  });
  assert.equal(noProviderReadOnly.ok, false);
  if (!noProviderReadOnly.ok) assert.equal(noProviderReadOnly.error.code, "PROVIDER_UNAVAILABLE");

  const noProviderMutation = await executeGitManageRemote({
    target: { repositoryPath: "/repo/project", action: "remove", remoteName: "origin" },
    context: governedMutationContext,
  });
  assert.equal(noProviderMutation.ok, false);
  if (!noProviderMutation.ok) assert.equal(noProviderMutation.error.code, "PROVIDER_UNAVAILABLE");
});

test("git.manageRemote calls BaseToolExecutorPort.git.runGit shape and parses remote output", async () => {
  const calls: string[] = [];
  const list = await executeGitManageRemote({
    target: { repositoryPath: "/repo/project", action: "list" },
    context: { ...readOnlyContext, dryRun: false },
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return {
        exitCode: 0,
        stdout: "origin\thttps://example.com/project.git (fetch)\norigin\thttps://example.com/project.git (push)\n",
        stderr: "",
      };
    },
  });

  assert.deepEqual(calls, ["/repo/project:remote -v"]);
  assert.equal(list.ok, true);
  if (list.ok) {
    assert.equal(list.output.providerCalled, true);
    assert.equal(list.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(list.output.resultEnvelope.remotes.length, 2);
    assert.equal(list.output.resultEnvelope.remotes[0]?.name, "origin");
    assert.equal(list.output.resultEnvelope.remotes[0]?.mode, "fetch");
  }

  const setUrl = await executeGitManageRemote({
    target: {
      repositoryPath: "/repo/project",
      action: "set-url",
      remoteName: "origin",
      remoteUrl: "git@example.com:org/project.git",
      urlMode: "push",
    },
    context: governedMutationContext,
    provider: async (request) => {
      calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(setUrl.ok, true);
  assert.equal(calls.at(-1), "/repo/project:remote set-url --push origin git@example.com:org/project.git");
  if (setUrl.ok) {
    assert.equal(setUrl.output.resultEnvelope.remoteChanged, true);
    assert.equal(setUrl.output.risk.category, "workspace-mutation");
  }
});

test("git.manageRemote provider failures stay public-safe", async () => {
  const result = await executeGitManageRemote({
    target: { repositoryPath: "/repo/private/project", action: "list" },
    context: {
      dryRun: false,
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read"],
    },
    provider: async () => {
      throw new Error("spawn /repo/private/project/.git/config failed");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.publicSafe, true);
    assert.doesNotMatch(result.error.message, /private|spawn|config/u);
  }
});

test("git.manageRemote parser ignores malformed lines without throwing", () => {
  const envelope = parseGitManageRemoteResult(
    {
      exitCode: 0,
      stdout: "origin\thttps://example.com/project.git (fetch)\nmalformed line with too many columns here\n",
      stderr: "",
    },
    { repositoryPath: "/repo/project", action: "list", urlMode: "fetch" },
  );

  assert.equal(envelope.remotes.length, 1);
  assert.equal(envelope.stdoutLineCount, 2);
});

test("git.manageRemote is mounted in the BaseTool registry handler", async () => {
  const registry = createBaseToolRegistry();
  const lookup = registry.lookupHandler("git.manageRemote");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const calls: string[] = [];
  const result = await lookup.handler.invoke({
    toolCallId: "remote-handler-1",
    runtimeId: "test-runtime",
    sessionId: "test-session",
    input: {
      target: { repositoryPath: "/repo/project", action: "list" },
      context: { ...readOnlyContext, dryRun: false },
    },
    executor: {
      git: {
        async runGit(request) {
          calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "origin\thttps://example.com/project.git (fetch)\n",
              stderr: "",
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:remote -v"]);
  const output = result.output as { runtimeEntry: { port: string } };
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
});
