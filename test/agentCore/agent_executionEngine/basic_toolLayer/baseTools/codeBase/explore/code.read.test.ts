import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeReadDescriptor,
  type CodeReadProvider,
  planCodeRead,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.read.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.read.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/explore/code.read.md",
  testFileUrl: import.meta.url,
});

test("planCodeRead creates a governed dry-run read plan", async () => {
  const result = await planCodeRead({
    toolCallId: "read-1",
    targetPath: " src/index.ts ",
    range: { startLine: 1, endLine: 3 },
    requestedScopes: ["code.read"],
    allowedScopes: ["code.read"],
  });

  assert.equal(codeReadDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected read dry-run plan");
  }

  assert.equal(result.plan.targetPath, "src/index.ts");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.readsFileSystemDirectly, false);
  assert.equal(result.output, undefined);
  assert.equal(result.audit.unsafeSideEffects, false);
});

test("planCodeRead can use an injected reader envelope without direct fs access", async () => {
  const result = await planCodeRead({
    targetPath: "src/index.ts",
    dryRun: false,
    maxBytes: 32,
    reader: (({ targetPath }) => ({
      content: `read:${targetPath}`,
      encoding: "utf8",
    })) satisfies CodeReadProvider,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected injected read result");
  }

  assert.equal(result.plan.dispatch, "injected-reader");
  assert.equal(result.output?.content, "read:src/index.ts");
  assert.equal(result.output?.unsafeSideEffects, false);
});

test("planCodeRead keeps range semantics in storage and hides provider failure detail", async () => {
  let providerSawRange = false;
  const ranged = await planCodeRead({
    targetPath: "src/index.ts",
    range: { startLine: 2, endLine: 3 },
    dryRun: false,
    reader: ((request) => {
      providerSawRange = "range" in request;
      return {
        content: ["line1", "line2", "line3", "line4"].join("\n"),
        encoding: "utf8",
      };
    }) satisfies CodeReadProvider,
  });

  assert.equal(ranged.ok, true);
  if (!ranged.ok) throw new Error("expected storage-owned ranged read");
  assert.equal(providerSawRange, false);
  assert.equal(ranged.output?.content, "line2\nline3");

  const failed = await planCodeRead({
    targetPath: "src/secret.ts",
    dryRun: false,
    reader: (() => {
      throw new Error("leaked /tmp/private/path TOKEN=abc");
    }) satisfies CodeReadProvider,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "READER_REJECTED");
    assert.equal(failed.error.message, "code.read provider rejected the request");
    assert.equal(failed.error.message.includes("/tmp/private"), false);
    assert.equal(failed.error.internalDetailExposed, false);
  }
});

test("planCodeRead rejects invalid ranges and missing injected readers", async () => {
  const invalidRange = await planCodeRead({
    targetPath: "src/index.ts",
    range: { startLine: 5, endLine: 4 },
  });

  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_RANGE");
  }

  const noReader = await planCodeRead({
    targetPath: "src/index.ts",
    dryRun: false,
  });

  assert.equal(noReader.ok, false);
  if (!noReader.ok) {
    assert.equal(noReader.error.code, "READER_NOT_INJECTED");
    assert.equal(noReader.error.boundary, "provider");
  }
});

test("planCodeRead rejects malformed JSON without throwing raw TypeError", async () => {
  const malformed = await planCodeRead(null);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_REQUEST");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
    assert.equal(malformed.error.internalDetailExposed, false);
  }

  const badTarget = await planCodeRead({ targetPaths: [null] });
  assert.equal(badTarget.ok, false);
  if (!badTarget.ok) {
    assert.equal(badTarget.error.code, "INVALID_TARGETS");
  }

  const denied = await planCodeRead({
    targetPath: "src/index.ts",
    context: { guard: { allowed: false, reason: "blocked" } },
    dryRun: false,
    reader: (() => {
      throw new Error("should not be called");
    }) satisfies CodeReadProvider,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
  }
});
