import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeGitRepositoryStatus,
  type GitGetRepositoryStatusOutput,
  parseGitRepositoryStatus,
  planGitRepositoryStatusRead,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getRepositoryStatus.js";
import { adaptRuntimeToolInvocation } from "../../../../../../../src/executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../../../../../../src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getRepositoryStatus.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/inspection/git.getRepositoryStatus.md",
  testFileUrl: import.meta.url,
});

test("planGitRepositoryStatusRead creates a guarded dry-run status read plan", () => {
  const result = planGitRepositoryStatusRead({
    target: {
      repositoryPath: "/repo/project",
      includeBranch: true,
      includeUntracked: false,
      porcelainVersion: "v2",
    },
    context: {
      invocationId: "status-1",
      allowedRepositoryRoots: ["/repo"],
      grantedPermissions: ["git:read", "filesystem:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.git.getRepositoryStatus");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.output.runtimeEntry.argvMode, "fixed-status-read");
  assert.equal(result.output.risk.category, "read-only-inspection");
  assert.equal(result.output.risk.mutatesRepository, false);
  assert.deepEqual(result.output.gitArgs, ["status", "--porcelain=v2", "--branch", "--untracked-files=no"]);
  assert.deepEqual(result.output.commandPreview, [
    "git",
    "-C",
    "/repo/project",
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=no",
  ]);
  assert.equal(result.output.timeoutMs, 30000);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.resultEnvelope.entries, []);
  assert.equal(result.plan?.dispatch, "dry-run");
  assert.equal(result.plan?.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.equal(result.audit[0]?.invocationId, "status-1");
});

test("planGitRepositoryStatusRead rejects missing repository, invalid porcelain versions, and malformed JSON", () => {
  const missing = planGitRepositoryStatusRead();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_REPOSITORY_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const invalid = planGitRepositoryStatusRead({
    target: { repositoryPath: "/repo/project", porcelainVersion: "v3" as "v1" },
  });

  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_PORCELAIN_VERSION");
  }

  const malformed = planGitRepositoryStatusRead({
    target: null,
    context: { runtimeId: 1 },
  } as never);

  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.match(malformed.error.code, /INVALID_/);
    assert.equal(malformed.error.safeForRuntimeInspection, true);
    assert.equal(malformed.error.internalDetailExposed, false);
  }
});

test("planGitRepositoryStatusRead blocks missing permissions while keeping old dry-run compatibility", () => {
  const permission = planGitRepositoryStatusRead({
    target: { repositoryPath: "/repo/project" },
    context: { grantedPermissions: ["git:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const planned = planGitRepositoryStatusRead({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
  });

  assert.equal(planned.ok, true);
  if (planned.ok) {
    assert.equal(planned.output.dryRun, true);
    assert.equal(planned.output.providerCalled, false);
  }
});

test("executeGitRepositoryStatus covers dry-run, guard, missing provider, provider success, and provider failure", async () => {
  let providerCalls = 0;
  const dryRun = await executeGitRepositoryStatus({
    target: { repositoryPath: "/repo/project" },
    provider: async () => {
      providerCalls += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(dryRun.ok, true);
  assert.equal(providerCalls, 0);
  if (dryRun.ok) {
    assert.equal(dryRun.output.providerCalled, false);
  }

  const denied = await executeGitRepositoryStatus({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false },
    provider: async () => {
      throw new Error("must not dispatch");
    },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await executeGitRepositoryStatus({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const executed = await executeGitRepositoryStatus({
    target: { repositoryPath: "/repo/project", porcelainVersion: "v1" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: async (request) => {
      providerCalls += 1;
      assert.equal(request.repositoryPath, "/repo/project");
      assert.deepEqual(request.args, ["status", "--porcelain=v1", "--branch"]);
      return {
        exitCode: 0,
        stdout: "## main...origin/main [ahead 1, behind 2]\n M src/a.ts\n?? new.txt\n",
        stderr: "",
      };
    },
  });
  assert.equal(executed.ok, true);
  if (executed.ok) {
    assert.equal(executed.output.providerCalled, true);
    assert.equal(executed.output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.deepEqual(executed.output.gitArgs, ["status", "--porcelain=v1", "--branch"]);
    assert.equal(executed.plan?.dispatch, "runtime-git-executor");
    assert.equal(executed.output.resultEnvelope.branch, "main");
    assert.equal(executed.output.resultEnvelope.upstream, "origin/main");
    assert.equal(executed.output.resultEnvelope.ahead, 1);
    assert.equal(executed.output.resultEnvelope.behind, 2);
    assert.deepEqual(executed.output.resultEnvelope.entries, [
      { path: "src/a.ts", indexStatus: " ", workingTreeStatus: "M" },
      { path: "new.txt", indexStatus: "?", workingTreeStatus: "?" },
    ]);
  }

  const providerFailure = await executeGitRepositoryStatus({
    target: { repositoryPath: "/repo/project" },
    context: { dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new Error("leaked /secret/path and command details");
    },
  });
  assert.equal(providerFailure.ok, false);
  if (!providerFailure.ok) {
    assert.equal(providerFailure.error.code, "PROVIDER_REJECTED");
    assert.match(providerFailure.error.message, /provider failed/);
    assert.doesNotMatch(providerFailure.error.message, /secret|command|path/);
  }
});

test("parseGitRepositoryStatus handles porcelain v2 branch metadata and entries", () => {
  const parsed = parseGitRepositoryStatus(
    "# branch.head feature\n# branch.upstream origin/feature\n# branch.ab +3 -4\n1 MM N... 100644 100644 100644 abc def file.ts\n? extra.ts\n",
    "v2",
  );

  assert.equal(parsed.branch, "feature");
  assert.equal(parsed.upstream, "origin/feature");
  assert.equal(parsed.ahead, 3);
  assert.equal(parsed.behind, 4);
  assert.deepEqual(parsed.entries, [
    { path: "file.ts", indexStatus: "M", workingTreeStatus: "M" },
    { path: "extra.ts", indexStatus: "?", workingTreeStatus: "?" },
  ]);
});

test("git.getRepositoryStatus runtime chain reaches BaseToolGitExecutor.runGit through registry handler", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit(request) {
        calls.push(`runGit:${request.repositoryPath}:${request.args.join(" ")}`);
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "## main\n M src/a.ts\n",
            stderr: "",
          },
        };
      },
    },
  };
  const toolId = "git.getRepositoryStatus";
  const runtimeId = "git-status-runtime-chain-1";
  const sessionId = "git-status-session-chain-1";
  const toolCallId = `${toolId}:runtime-chain`;
  const input = {
    target: { repositoryPath: "/repo/project", includeBranch: false, porcelainVersion: "v1" },
    context: { dryRun: false, guard: { allowed: true } },
  } as const;

  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId,
      sessionId,
      invocationId: toolCallId,
      requestedScopes: ["tool.execute", `tool.${toolId}`],
      allowedScopes: ["tool.execute", `tool.${toolId}`],
      auditMetadata: { test: "git.getRepositoryStatus.runtimeChain" },
    },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  assert.equal(adapted.ok, true);
  if (!adapted.ok) throw new Error("adapter failed");

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "git-status-runtime-chain-test", sessionId },
    invocation: {
      invocationId: toolCallId,
      kind: "tool",
      target: toolId,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: true,
  });
  assert.equal(bridged.ok, true);
  if (!bridged.ok) throw new Error("bridge failed");

  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true);
  if (!lookup.ok) throw new Error("registry lookup failed");

  const result = await lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["runGit:/repo/project:status --porcelain=v1 --branch"]);
  if (result.ok) {
    const output = result.output as GitGetRepositoryStatusOutput;
    assert.equal(output.providerCalled, true);
  }
});
