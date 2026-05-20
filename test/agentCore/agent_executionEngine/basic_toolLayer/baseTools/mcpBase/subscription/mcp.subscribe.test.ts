import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpSubscribeDescriptor,
  planMcpSubscribe,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.subscribe.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.subscribe.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/subscription/mcp.subscribe.md",
  testFileUrl: import.meta.url,
});

test("planMcpSubscribe creates a guarded dry-run subscription envelope", () => {
  const result = planMcpSubscribe({
    target: {
      serverId: "events",
      subjectType: "resource",
      subject: "file:///repo/README.md",
      eventKinds: ["changed", "changed", "deleted"],
      replayPolicy: "latest",
    },
    context: {
      invocationId: "subscribe-1",
      requestedScopes: ["mcp:events"],
      allowedScopes: ["mcp:events"],
      grantedPermissions: ["mcp:subscription:write"],
    },
  });

  assert.equal(mcpSubscribeDescriptor.defaultDryRun, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.subscribe");
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.deepEqual(result.output.target.eventKinds, ["changed", "deleted"]);
  assert.equal(result.output.subscriptionEnvelope.state, "planned");
  assert.equal(result.output.subscriptionEnvelope.replayPolicy, "latest");
  assert.match(result.output.subscriptionEnvelope.subscriptionId, /^subscribe-1:events:resource:/);
});

test("planMcpSubscribe rejects missing and invalid target fields", () => {
  const missingServer = planMcpSubscribe({
    target: { subjectType: "resource", subject: "file:///repo/README.md" },
  });

  assert.equal(missingServer.ok, false);
  if (!missingServer.ok) {
    assert.equal(missingServer.error.code, "MISSING_SERVER_ID");
  }

  const invalidType = planMcpSubscribe({
    target: { serverId: "events", subjectType: "channel" as "event", subject: "build" },
  });

  assert.equal(invalidType.ok, false);
  if (!invalidType.ok) {
    assert.equal(invalidType.error.code, "INVALID_SUBJECT_TYPE");
  }

  const invalidReplay = planMcpSubscribe({
    target: {
      serverId: "events",
      subjectType: "event",
      subject: "build",
      replayPolicy: "all" as "latest",
    },
  });

  assert.equal(invalidReplay.ok, false);
  if (!invalidReplay.ok) {
    assert.equal(invalidReplay.error.code, "INVALID_REPLAY_POLICY");
  }
});

test("planMcpSubscribe blocks denied scope, missing permission, and real execution", () => {
  const scoped = planMcpSubscribe({
    target: { serverId: "events", subjectType: "event", subject: "build" },
    context: { requestedScopes: ["mcp:private"], allowedScopes: ["mcp:events"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_DENIED");
  }

  const permission = planMcpSubscribe({
    target: { serverId: "events", subjectType: "event", subject: "build" },
    context: { grantedPermissions: ["mcp:resource:read" as "mcp:subscription:write"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpSubscribe({
    target: { serverId: "events", subjectType: "event", subject: "build" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planMcpSubscribe rejects malformed JSON without raw TypeError", () => {
  for (const input of [null, [], 1, { target: null }, { target: { serverId: 1 } }, { target: { serverId: "events", subjectType: "resource", subject: [] } }, { target: { serverId: "events", subjectType: "resource", subject: "file:///repo/README.md", eventKinds: [null] } }]) {
    const result = planMcpSubscribe(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.publicSafe, true);
    }
  }
});
