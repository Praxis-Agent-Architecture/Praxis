import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeScanDescriptor,
  planCodeScan,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.scan.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.scan.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.scan.md",
  testFileUrl: import.meta.url,
});

test("planCodeScan creates a dry-run directory scan plan", async () => {
  const result = await planCodeScan({
    toolCallId: "scan-1",
    directoryPath: " src ",
    includeGlobs: ["**/*.ts", "**/*.ts"],
    excludeGlobs: ["node_modules/**"],
    requestedScopes: ["code.read"],
    allowedScopes: ["code.read"],
  });

  assert.equal(codeScanDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected scan dry-run plan");
  }

  assert.equal(result.plan.directoryPath, "src");
  assert.deepEqual(result.plan.includeGlobs, ["**/*.ts"]);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.scansFileSystemDirectly, false);
});

test("planCodeScan can use an injected scanner and truncate results", async () => {
  const result = await planCodeScan({
    directoryPath: ".",
    dryRun: false,
    maxEntries: 1,
    scanner: () => [
      { path: "src/a.ts", kind: "file", language: "typescript" },
      { path: "src/b.ts", kind: "file", language: "typescript" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected scan result");
  }

  assert.equal(result.plan.dispatch, "injected-scanner");
  assert.equal(result.output?.entries.length, 1);
  assert.equal(result.output?.truncated, true);
  assert.equal(result.output?.unsafeSideEffects, false);
});

test("planCodeScan rejects scope violations and invalid limits", async () => {
  const denied = await planCodeScan({
    directoryPath: "src",
    requestedScopes: ["code.scan"],
    allowedScopes: ["code.read"],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
  }

  const invalid = await planCodeScan({
    directoryPath: "src",
    maxEntries: 0,
  });

  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_MAX_ENTRIES");
  }
});
