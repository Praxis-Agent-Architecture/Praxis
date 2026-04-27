import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeSearchRipgrepDescriptor,
  type CodeSearchRipgrepExecutor,
  planCodeSearchRipgrep,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.search_Ripgrep.js";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createHostExecutorCodeSearchRipgrepProvider } from "../../../../../../../src/storagePool/baseToolStorage/codeBase/explore/code.search_Ripgrep/dependencies.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.search_Ripgrep.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.search_Ripgrep.md",
  testFileUrl: import.meta.url,
});

test("planCodeSearchRipgrep builds a dry-run rg command envelope", async () => {
  const result = await planCodeSearchRipgrep({
    toolCallId: "rg-1",
    query: " planCodeRead ",
    directoryPath: " src ",
    fileGlob: "**/*.ts",
    maxMatches: 3,
    caseSensitive: false,
    requestedScopes: ["code.search"],
    allowedScopes: ["code.search"],
  });

  assert.equal(codeSearchRipgrepDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected ripgrep dry-run plan");
  }

  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.spawnsProcessDirectly, false);
  assert.deepEqual(result.plan.command, [
    "rg",
    "--json",
    "--max-count",
    "3",
    "--fixed-strings",
    "--ignore-case",
    "--glob",
    "**/*.ts",
    "--",
    "planCodeRead",
    "src",
  ]);
});

test("planCodeSearchRipgrep can use an injected executor envelope", async () => {
  const result = await planCodeSearchRipgrep({
    query: "needle",
    directoryPath: "src",
    dryRun: false,
    executor: (({ command }) => ({
      exitCode: 0,
      matches: [{ path: String(command.at(-1)), line: 1, text: "needle" }],
    })) satisfies CodeSearchRipgrepExecutor,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected ripgrep result");
  }

  assert.equal(result.plan.dispatch, "injected-executor");
  assert.equal(result.output?.matches[0]?.path, "src");
  assert.equal(result.output?.unsafeSideEffects, false);
});

test("planCodeSearchRipgrep rejects missing query and failed rg execution", async () => {
  const missing = await planCodeSearchRipgrep({
    query: " ",
    directoryPath: "src",
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_QUERY");
  }

  const failed = await planCodeSearchRipgrep({
    query: "needle",
    directoryPath: "src",
    dryRun: false,
    executor: () => ({ exitCode: 2, matches: [], stderr: "bad regex" }),
  });

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "RIPGREP_FAILED");
    assert.equal(failed.error.boundary, "provider");
  }
});

test("code.search_Ripgrep forwards full runtime search options and hides provider failure detail", async () => {
  let received: Parameters<NonNullable<NonNullable<BaseToolExecutorPort["search"]>["ripgrep"]>>[0] | undefined;
  const provider = createHostExecutorCodeSearchRipgrepProvider({
    search: {
      async ripgrep(request) {
        received = request;
        return { ok: true, output: { exitCode: 0, matches: [] } };
      },
    },
  });

  assert.notEqual(provider, undefined);
  const result = await planCodeSearchRipgrep({
    query: "needle",
    directoryPath: "src",
    dryRun: false,
    multiline: true,
    contextLines: 3,
    executor: provider,
  });

  assert.equal(result.ok, true);
  assert.equal(received?.multiline, true);
  assert.equal(received?.contextLines, 3);

  const failed = await planCodeSearchRipgrep({
    query: "needle",
    directoryPath: "src",
    dryRun: false,
    executor: (() => {
      throw new Error("leaked /tmp/private/path TOKEN=abc");
    }) satisfies CodeSearchRipgrepExecutor,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "EXECUTOR_REJECTED");
    assert.equal(failed.error.message, "code.search_Ripgrep provider rejected the request");
    assert.equal(failed.error.message.includes("/tmp/private"), false);
    assert.equal(failed.error.internalDetailExposed, false);
  }
});

test("planCodeSearchRipgrep rejects malformed JSON without provider dispatch", async () => {
  const malformed = await planCodeSearchRipgrep(null);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_REQUEST");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
    assert.equal(malformed.error.internalDetailExposed, false);
  }

  const badGlob = await planCodeSearchRipgrep({ query: "needle", directoryPath: "src", fileGlob: "\0" });
  assert.equal(badGlob.ok, false);
  if (!badGlob.ok) {
    assert.equal(badGlob.error.code, "INVALID_GLOB");
  }

  let providerCalled = false;
  const denied = await planCodeSearchRipgrep({
    query: "needle",
    directoryPath: "src",
    dryRun: false,
    context: { guard: { allowed: false, reason: "blocked" } },
    executor: (() => {
      providerCalled = true;
      return { exitCode: 0, matches: [] };
    }) satisfies CodeSearchRipgrepExecutor,
  });
  assert.equal(denied.ok, false);
  assert.equal(providerCalled, false);
});
