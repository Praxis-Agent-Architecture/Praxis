import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_REALTIME_CLIENT_SECRETS_ENDPOINT,
  invokeOpenAIV1RealtimeClientSecrets,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_client_secrets.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_client_secrets.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_client_secrets.md",
  testFileUrl: import.meta.url,
});

test("openai v1 realtime client secrets builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1RealtimeClientSecrets({
    requestBody: { session: { model: "gpt-realtime" } },
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["realtime:client-secrets"],
    allowedScopes: ["realtime:client-secrets"],
    mockResponse: { client_secret: { value: "redacted" } },
  });

  assert.ok(result.ok);
  assert.equal(result.request.endpoint, OPENAI_V1_REALTIME_CLIENT_SECRETS_ENDPOINT);
  assert.equal(result.request.url, "https://api.openai.com/v1/realtime/client_secrets");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.deepEqual(result.response.raw, { client_secret: { value: "redacted" } });
  assert.equal(result.capability.rawShape, "mock");
});

test("openai v1 realtime client secrets rejects scopes outside the guard", async () => {
  const result = await invokeOpenAIV1RealtimeClientSecrets({
    requestBody: { session: { model: "gpt-realtime" } },
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["realtime:client-secrets"],
    allowedScopes: ["realtime:sessions"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
});

test("openai v1 realtime client secrets rejects missing request body", async () => {
  const result = await invokeOpenAIV1RealtimeClientSecrets();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_REQUEST_BODY");
  assert.equal(result.error.boundary, "input");
});
