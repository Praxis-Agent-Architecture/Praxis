import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_UPLOADS_ENDPOINT,
  classifyOpenAIV1UploadsProviderError,
  invokeOpenAIV1Uploads,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_uploads.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_uploads.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_uploads.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 uploads builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Uploads({
    operation: "create",
    body: { purpose: "assistants", bytes: 128 },
    runtime: { runtimeId: "runtime-1", invocationId: "uploads-1" },
    mockResponse: { id: "upload_1", object: "upload" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_UPLOADS_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 uploads rejects scope denials with a scope boundary", async () => {
  const result = await invokeOpenAIV1Uploads({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["uploads:create", "files:write"],
    allowedScopes: ["uploads:create"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
});

test("OpenAI v1 uploads invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Uploads({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "upload_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/uploads/upload_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "upload_123", object: "upload" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "upload-object");
});

test("OpenAI v1 uploads classifies response format drift", () => {
  assert.equal(classifyOpenAIV1UploadsProviderError({ code: "schema_mismatch" }), "RESPONSE_FORMAT_DRIFT");
});
