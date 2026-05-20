import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_SESSIONS_ENDPOINT,
  invokeAnthropicV1Sessions,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_sessions.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_sessions.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_sessions.md",
  testFileUrl: import.meta.url,
});

test("v1_sessions builds dry-run envelopes for session retrieval", async () => {
  const result = await invokeAnthropicV1Sessions({
    operation: "retrieve",
    sessionId: "session_123",
    runtime: { invocationId: "invoke:sessions" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, ANTHROPIC_V1_SESSIONS_ENDPOINT);
  assert.equal(result.envelope.operation, "retrieve");
  assert.equal(result.envelope.method, "GET");
  assert.equal(result.envelope.url, "https://api.anthropic.com/v1/sessions/session_123");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.response.kind, "dry-run");
});

test("v1_sessions rejects missing operation, ids, and create bodies", async () => {
  const missingOperation = await invokeAnthropicV1Sessions({});
  assert.equal(missingOperation.ok, false);
  if (missingOperation.ok) {
    return;
  }
  assert.equal(missingOperation.error.code, "MISSING_OPERATION");

  const missingSessionId = await invokeAnthropicV1Sessions({ operation: "delete" });
  assert.equal(missingSessionId.ok, false);
  if (missingSessionId.ok) {
    return;
  }
  assert.equal(missingSessionId.error.code, "MISSING_SESSION_ID");

  const missingBody = await invokeAnthropicV1Sessions({ operation: "create" });
  assert.equal(missingBody.ok, false);
  if (missingBody.ok) {
    return;
  }
  assert.equal(missingBody.error.code, "MISSING_REQUEST_BODY");
});

test("v1_sessions wraps mock provider payloads and classifies unavailable providers", async () => {
  const ok = await invokeAnthropicV1Sessions({
    operation: "create",
    dryRun: false,
    apiKey: "sk-ant-test",
    body: { ttl_seconds: 300 },
    transport: (envelope) => {
      assert.equal(envelope.method, "POST");
      assert.equal(envelope.providerCallPlanned, true);
      return { statusCode: 200, body: { id: "session_123", type: "session" } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "session-object");

  const unavailable = await invokeAnthropicV1Sessions({
    operation: "list",
    dryRun: false,
    apiKey: "sk-ant-test",
    transport: () => ({ statusCode: 503, body: { error: { type: "overloaded_error" } } }),
  });
  assert.equal(unavailable.ok, false);
  if (unavailable.ok) {
    return;
  }
  assert.equal(unavailable.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(unavailable.error.boundary, "provider");
  assert.equal(unavailable.error.statusCode, 503);
});
