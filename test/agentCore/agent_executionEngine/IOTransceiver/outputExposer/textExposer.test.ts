import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeTextOutput } from "../../../../../src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/textExposer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/textExposer.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/outputExposer/textExposer.md",
  testFileUrl: import.meta.url,
});

test("exposeTextOutput creates a dry-run text envelope for application subscribers", () => {
  const result = exposeTextOutput({
    outputId: " out-1 ",
    sessionId: " session-1 ",
    runtimeId: " runtime-1 ",
    text: " hello from agent ",
    requestedScopes: ["output.read", "output.read"],
    allowedScopes: ["output.read"],
    events: ["mainLoop.reply.chunk"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.outputId, "out-1");
  assert.equal(result.exposed.modality, "text");
  assert.equal(result.exposed.context.sessionId, "session-1");
  assert.equal(result.exposed.payload.kind, "plain");
  assert.equal(result.exposed.payload.text, "hello from agent");
  assert.equal(result.exposed.dispatch, "dry-run");
  assert.equal(result.exposed.providerRawShapeExposed, false);
  assert.deepEqual(result.exposed.scopes, ["output.read"]);
  assert.ok(result.exposed.events.includes("output.text.exposed"));
});

test("exposeTextOutput preserves structured streaming boundaries", () => {
  const result = exposeTextOutput({
    outputId: "out-structured",
    sessionId: "session-1",
    streamId: "stream-1",
    sequence: 2,
    stage: "partial",
    structured: { answer: 42 },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.mode, "stream");
  assert.equal(result.exposed.stage, "partial");
  assert.equal(result.exposed.streamId, "stream-1");
  assert.equal(result.exposed.sequence, 2);
  assert.deepEqual(result.exposed.payload.structured, { answer: 42 });
});

test("exposeTextOutput rejects empty input and governance or scope failures", () => {
  const missing = exposeTextOutput();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_OUTPUT_ID");
    assert.equal(missing.error.boundary, "input");
    assert.equal(missing.error.publicSafe, true);
  }

  const noPayload = exposeTextOutput({ outputId: "out-1", sessionId: "session-1" });
  assert.equal(noPayload.ok, false);
  if (!noPayload.ok) {
    assert.equal(noPayload.error.code, "MISSING_PAYLOAD");
  }

  const rejected = exposeTextOutput({
    outputId: "out-1",
    sessionId: "session-1",
    text: "blocked",
    governance: { accepted: false, reason: "output hidden by policy" },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(rejected.error.boundary, "governance");
  }

  const scopeDenied = exposeTextOutput({
    outputId: "out-1",
    sessionId: "session-1",
    text: "blocked",
    requestedScopes: ["output.private"],
    allowedScopes: ["output.read"],
  });
  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
    assert.equal(scopeDenied.error.boundary, "scope");
  }
});
