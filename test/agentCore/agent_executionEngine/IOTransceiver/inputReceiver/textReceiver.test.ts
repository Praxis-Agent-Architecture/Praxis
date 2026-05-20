import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  receiveTextInput,
  textInputReceiverDescriptor,
} from "../../../../../src/executionEngine/IOTransceiver/inputReceiver/textReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/IOTransceiver/inputReceiver/textReceiver.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/inputReceiver/textReceiver.md",
  testFileUrl: import.meta.url,
});

test("receiveTextInput normalizes user intent for promptPack handoff", () => {
  const result = receiveTextInput({
    runtimeId: " runtime:alpha ",
    sessionId: " session:one ",
    source: "application",
    text: "  Build the next prompt pack  ",
    contextRefs: [" cmp:context ", "cmp:context", " memory:one "],
    requestedScopes: ["input"],
    allowedScopes: ["input", "runtime"],
    inputBoundary: { minCharacters: 5, maxCharacters: 80 },
  });

  assert.equal(textInputReceiverDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected text input to be accepted");
  }

  assert.equal(result.input.kind, "text");
  assert.equal(result.input.runtimeId, "runtime:alpha");
  assert.equal(result.input.sessionId, "session:one");
  assert.equal(result.input.rawText, "  Build the next prompt pack  ");
  assert.equal(result.input.normalizedText, "Build the next prompt pack");
  assert.deepEqual(result.input.contextRefs, ["cmp:context", "memory:one"]);
  assert.equal(result.input.promptPackHandoff, "pending");
  assert.equal(result.input.providerPayloadCreated, false);
  assert.equal(result.input.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["input.text.received"]);
});

test("receiveTextInput rejects missing and out-of-bound text with public errors", () => {
  const missingRuntime = receiveTextInput();
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime rejection");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");
  assert.equal(missingRuntime.error.safeForRuntimeInspection, true);

  const empty = receiveTextInput({ runtimeId: "runtime", sessionId: "session", text: "   " });
  assert.equal(empty.ok, false);
  if (empty.ok) {
    throw new Error("expected empty text rejection");
  }
  assert.equal(empty.error.code, "EMPTY_TEXT");

  const tooLong = receiveTextInput({
    runtimeId: "runtime",
    sessionId: "session",
    text: "too long",
    inputBoundary: { maxCharacters: 3 },
  });
  assert.equal(tooLong.ok, false);
  if (tooLong.ok) {
    throw new Error("expected length rejection");
  }
  assert.equal(tooLong.error.code, "TEXT_TOO_LONG");
});

test("receiveTextInput reports governance and scope failures without provider binding", () => {
  const governanceRejected = receiveTextInput({
    runtimeId: "runtime",
    sessionId: "session",
    text: "hello",
    governance: { accepted: false, reason: "text intake denied" },
  });

  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.message, "text intake denied");
  assert.equal(governanceRejected.error.boundary, "governance");

  const scopeRejected = receiveTextInput({
    runtimeId: "runtime",
    sessionId: "session",
    text: "hello",
    requestedScopes: ["private-context"],
    allowedScopes: ["input"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
