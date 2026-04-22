import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeDebugCollectLogsDescriptor,
  planCodeDebugCollectLogs,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugCollectLogs.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugCollectLogs.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugCollectLogs.md",
  testFileUrl: import.meta.url,
});

test("planCodeDebugCollectLogs creates a dry-run log collection envelope and storage plan", () => {
  const result = planCodeDebugCollectLogs({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    sources: [
      {
        kind: "debug-console",
        id: " console-1 ",
        label: " Debug Console ",
      },
      {
        kind: "file",
        path: " logs/test.log ",
      },
    ],
    maxEntries: 50,
    since: "2026-04-22T20:00:00.000Z",
    requestedScopes: ["debug:read", "logs:read"],
    allowedScopes: ["debug:read", "logs:read"],
  });

  assert.equal(codeDebugCollectLogsDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid log collection request must be accepted");
  }

  assert.equal(result.plan.toolName, "code.debugCollectLogs");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.sources.length, 2);
  assert.equal(result.plan.sources[0]?.id, "console-1");
  assert.equal(result.plan.sources[1]?.id, "logs/test.log");
  assert.equal(result.plan.maxEntries, 50);
  assert.equal(result.plan.redaction.secrets, true);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.collected, false);
  assert.equal(result.plan.storage.audit.persisted, false);
});

test("planCodeDebugCollectLogs rejects missing sources and real collection attempts", () => {
  const missingSources = planCodeDebugCollectLogs({
    runtimeId: "runtime-1",
    sessionId: "session-1",
  });
  assert.equal(missingSources.ok, false);
  if (missingSources.ok) {
    assert.fail("missing sources must be rejected");
  }
  assert.equal(missingSources.error.code, "MISSING_LOG_SOURCES");
  assert.equal(missingSources.error.boundary, "input");

  const realCollection = planCodeDebugCollectLogs({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    sources: [{ kind: "process", id: "pid-1" }],
    dryRun: false,
  });
  assert.equal(realCollection.ok, false);
  if (realCollection.ok) {
    assert.fail("real log collection must be rejected");
  }
  assert.equal(realCollection.error.code, "REAL_LOG_COLLECTION_NOT_ALLOWED");
  assert.equal(realCollection.error.boundary, "governance");
});

test("planCodeDebugCollectLogs rejects invalid source identifiers and limits", () => {
  const missingIdentifier = planCodeDebugCollectLogs({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    sources: [{ kind: "file" }],
  });
  assert.equal(missingIdentifier.ok, false);
  if (missingIdentifier.ok) {
    assert.fail("source without id or path must be rejected");
  }
  assert.equal(missingIdentifier.error.code, "MISSING_SOURCE_IDENTIFIER");

  const invalidLimit = planCodeDebugCollectLogs({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    sources: [{ kind: "test-run", id: "test-1" }],
    maxEntries: 0,
  });
  assert.equal(invalidLimit.ok, false);
  if (invalidLimit.ok) {
    assert.fail("invalid maxEntries must be rejected");
  }
  assert.equal(invalidLimit.error.code, "INVALID_LOG_LIMIT");
});
