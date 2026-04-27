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
    depth: 2,
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

test("planCodeScan applies depth and glob semantics in storage and hides provider failure detail", async () => {
  const filtered = await planCodeScan({
    directoryPath: "src",
    dryRun: false,
    maxEntries: 10,
    depth: 2,
    includeGlobs: ["**/*.ts"],
    excludeGlobs: ["**/*.test.ts"],
    scanner: () => [
      { path: "src/index.ts", kind: "file" },
      { path: "src/a/b.ts", kind: "file" },
      { path: "src/a/b/c.ts", kind: "file" },
      { path: "src/a/b.test.ts", kind: "file" },
      { path: "src/readme.md", kind: "file" },
    ],
  });

  assert.equal(filtered.ok, true);
  if (!filtered.ok) throw new Error("expected filtered scan result");
  assert.deepEqual(filtered.output?.entries.map((entry) => entry.path), ["src/index.ts", "src/a/b.ts"]);

  const failed = await planCodeScan({
    directoryPath: "src",
    dryRun: false,
    scanner: () => {
      throw new Error("leaked /tmp/private/path TOKEN=abc");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "SCANNER_REJECTED");
    assert.equal(failed.error.message, "code.scan provider rejected the request");
    assert.equal(failed.error.message.includes("/tmp/private"), false);
    assert.equal(failed.error.internalDetailExposed, false);
  }
});

test("planCodeScan defaults to first-level entries", async () => {
  const result = await planCodeScan({
    directoryPath: "src",
    dryRun: false,
    scanner: () => [
      { path: "src/agentCore/", kind: "directory" },
      { path: "src/agentCore/agent_executionEngine/", kind: "directory" },
      { path: "src/DSLCore/", kind: "directory" },
      { path: "src/DSLCore/DSL_runtimeImplementation/", kind: "directory" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected first-level scan result");
  assert.deepEqual(result.output?.entries.map((entry) => entry.path), ["src/agentCore/", "src/DSLCore/"]);
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

test("planCodeScan rejects malformed JSON without provider dispatch", async () => {
  const malformed = await planCodeScan(null);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_REQUEST");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
    assert.equal(malformed.error.internalDetailExposed, false);
  }

  const badGlob = await planCodeScan({ directoryPath: "src", includeGlobs: [null] });
  assert.equal(badGlob.ok, false);
  if (!badGlob.ok) {
    assert.equal(badGlob.error.code, "INVALID_GLOB");
  }

  let providerCalled = false;
  const denied = await planCodeScan({
    directoryPath: "src",
    dryRun: false,
    context: { guard: { allowed: false, reason: "blocked" } },
    scanner: (() => {
      providerCalled = true;
      return [];
    }),
  });
  assert.equal(denied.ok, false);
  assert.equal(providerCalled, false);
});
