import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_REALTIME_SESSIONS_ENDPOINT,
  invokeOpenAIV1RealtimeSessions,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_sessions.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_sessions.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_sessions.md",
  testFileUrl: import.meta.url,
});

test("openai v1 realtime sessions builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1RealtimeSessions({
    requestBody: { model: "gpt-realtime", modalities: ["text", "audio"] },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: { id: "sess_1" },
  });

  assert.ok(result.ok);
  assert.equal(result.request.endpoint, OPENAI_V1_REALTIME_SESSIONS_ENDPOINT);
  assert.equal(result.request.url, "https://api.openai.com/v1/realtime/sessions");
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("openai v1 realtime sessions uses injected caller for non dry-run calls", async () => {
  const result = await invokeOpenAIV1RealtimeSessions({
    requestBody: { model: "gpt-realtime" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: (request) => ({ id: "sess_live", endpoint: request.endpoint }),
    expectResponseObject: true,
  });

  assert.ok(result.ok);
  assert.equal(result.request.providerCallPlanned, true);
  assert.equal(result.response.mode, "caller");
  assert.deepEqual(result.response.raw, { id: "sess_live", endpoint: OPENAI_V1_REALTIME_SESSIONS_ENDPOINT });
  assert.equal(result.capability.rawShape, "realtime-session");
});

test("openai v1 realtime sessions rejects missing request body", async () => {
  const result = await invokeOpenAIV1RealtimeSessions();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_REQUEST_BODY");
  assert.equal(result.error.boundary, "input");
});
