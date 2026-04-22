import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeSearchRipgrepDescriptor,
  planCodeSearchRipgrep,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.search_Ripgrep.js";

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
    executor: ({ command }) => ({
      exitCode: 0,
      matches: [{ path: String(command.at(-1)), line: 1, text: "needle" }],
    }),
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
    assert.equal(failed.error.boundary, "execution");
  }
});
