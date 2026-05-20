import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { exposeReplyEvent } from "../../../../../src/executionEngine/coreLogic/eventExposurePlane/replyEvent.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/replyEvent.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/replyEvent.md",
  testFileUrl: import.meta.url,
});

test("exposeReplyEvent returns a dry-run reply event record for subscribers", () => {
  const result = exposeReplyEvent({
    sessionId: " session-1 ",
    replyId: " reply-1 ",
    source: "main-loop",
    reply: { kind: "text", content: "hello", format: " plain " },
    subscribers: [" ui ", "debug", "ui"],
    trace: { correlationId: "corr-1", callerId: "mainLoop" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.event.eventId, "session-1:reply:reply-1");
  assert.equal(result.event.type, "agent.reply");
  assert.equal(result.event.reply.format, "plain");
  assert.deepEqual(result.event.subscribers, ["ui", "debug"]);
  assert.equal(result.event.trace.sessionId, "session-1");
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
});

test("exposeReplyEvent returns classified failures for missing input and governance rejection", () => {
  const missingReply = exposeReplyEvent({
    sessionId: "session-1",
    replyId: "reply-1",
  });
  assert.equal(missingReply.ok, false);
  assert.equal(missingReply.error.code, "MISSING_REPLY_PAYLOAD");
  assert.equal(missingReply.error.boundary, "input");

  const rejected = exposeReplyEvent({
    sessionId: "session-1",
    replyId: "reply-1",
    reply: { kind: "status", content: "blocked" },
    governance: { accepted: false, reason: "subscriber scope denied" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
