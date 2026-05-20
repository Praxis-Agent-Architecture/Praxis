import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_ADMIN_API_KEYS_ENDPOINT,
  classifyOpenAIV1OrganizationAdminApiKeysProviderError,
  invokeOpenAIV1OrganizationAdminApiKeys,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_admin_api_keys.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_admin_api_keys.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_admin_api_keys.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization admin api keys builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1OrganizationAdminApiKeys({
    operation: "list",
    method: "GET",
    query: { limit: 20 },
    runtime: { runtimeId: "runtime-1", invocationId: "invoke-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.provider, "openai");
  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_ADMIN_API_KEYS_ENDPOINT);
  assert.equal(result.request.query.limit, "20");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.operation, "list");
});

test("OpenAI v1 organization admin api keys rejects missing operation", async () => {
  const result = await invokeOpenAIV1OrganizationAdminApiKeys({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 organization admin api keys invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1OrganizationAdminApiKeys({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "key_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/organization/admin/api/keys/key_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "key_123", object: "organization.admin_api_key" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "admin-api-key-object");
});

test("OpenAI v1 organization admin api keys classifies provider auth failures", () => {
  assert.equal(classifyOpenAIV1OrganizationAdminApiKeysProviderError({ statusCode: 403 }), "PROVIDER_AUTH_FAILED");
});
