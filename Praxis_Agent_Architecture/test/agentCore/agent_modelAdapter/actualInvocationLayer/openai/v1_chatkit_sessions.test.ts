import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENAI_V1_CHATKIT_SESSIONS_ENDPOINT,
  invokeOpenAiV1ChatkitSessions,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chatkit_sessions.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chatkit_sessions.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chatkit_sessions.md",
  testFileUrl: import.meta.url,
});

test("invokeOpenAiV1ChatkitSessions builds a dry-run provider envelope without calling the provider", async () => {
  const result = await invokeOpenAiV1ChatkitSessions({
    requestBody: { user: "user-1", metadata: { runtime: "agentCore" } },
    baseUrl: "https://mock.openai.local/",
    apiKey: "sk-test",
    trace: { correlationId: " corr-1 ", callerId: " runtime.modelAdapter " },
  });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.provider, "openai");
  assert.equal(result.envelope.endpoint, OPENAI_V1_CHATKIT_SESSIONS_ENDPOINT);
  assert.equal(result.envelope.url, "https://mock.openai.local/v1/chatkit/sessions");
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.authState, "provided");
  assert.equal(result.envelope.capabilitySignals.mockable, true);
  assert.equal(result.envelope.dryRun, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.envelope.trace, { correlationId: "corr-1", callerId: "runtime.modelAdapter" });
});

test("invokeOpenAiV1ChatkitSessions rejects invalid input and governance denial", async () => {
  const missing = await invokeOpenAiV1ChatkitSessions();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_REQUEST");

  const invalidBody = await invokeOpenAiV1ChatkitSessions({ requestBody: null });
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.error.code, "INVALID_REQUEST_BODY");

  const invalidTimeout = await invokeOpenAiV1ChatkitSessions({ requestBody: {}, timeoutMs: -1 });
  assert.equal(invalidTimeout.ok, false);
  assert.equal(invalidTimeout.error.code, "INVALID_TIMEOUT");

  const rejected = await invokeOpenAiV1ChatkitSessions({
    requestBody: {},
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});

test("invokeOpenAiV1ChatkitSessions uses mockCaller and classifies upstream failures", async () => {
  const success = await invokeOpenAiV1ChatkitSessions({
    requestBody: { user: "user-1" },
    apiKey: "sk-test",
    dryRun: false,
    mockCaller: (request) => {
      assert.equal(request.endpoint, OPENAI_V1_CHATKIT_SESSIONS_ENDPOINT);
      assert.equal(request.headers.authorization, "Bearer sk-test");
      return { status: 200, body: { id: "session_1", object: "chatkit.session" } };
    },
  });

  assert.equal(success.ok, true);
  assert.equal(success.envelope.status, 200);
  assert.deepEqual(success.envelope.rawResponse, { id: "session_1", object: "chatkit.session" });
  assert.equal(success.envelope.dryRun, false);

  const rateLimited = await invokeOpenAiV1ChatkitSessions({
    requestBody: {},
    dryRun: false,
    mockCaller: () => ({ status: 429, body: { error: "rate limited" } }),
  });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.error.code, "UPSTREAM_RATE_LIMITED");

  const drift = await invokeOpenAiV1ChatkitSessions({
    requestBody: {},
    dryRun: false,
    mockCaller: () => ({ status: 200 }),
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.error.code, "UPSTREAM_RESPONSE_DRIFT");

  const timeout = await invokeOpenAiV1ChatkitSessions({
    requestBody: {},
    dryRun: false,
    mockCaller: () => {
      throw Object.assign(new Error("late provider"), { code: "ETIMEDOUT" });
    },
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.error.code, "UPSTREAM_TIMEOUT");
});
