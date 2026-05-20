import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT,
  classifyOpenAIV1OrganizationUsageProviderError,
  createOpenAIV1OrganizationUsageInvocation,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_organization_usage.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_organization_usage.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_usage.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization usage builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationUsageInvocation({
    operation: " list ",
    query: { start_time: 1_700_000_000, limit: 50 },
    runtime: { runtimeId: " runtime-1 ", invocationId: "usage-1" },
    requiredScopes: ["organization.usage.read"],
    allowedScopes: ["organization.usage.read"],
    mockResponse: { object: "list", data: [] },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT);
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.query.start_time, "1700000000");
  assert.equal(result.request.runtime.invocationId, "usage-1");
  assert.equal(result.request.providerCallPlanned, false);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "organization-usage-list");
});

test("OpenAI v1 organization usage rejects response drift in mock envelopes", () => {
  const result = createOpenAIV1OrganizationUsageInvocation({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    mockResponse: "not an object",
    expectResponseObject: true,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(result.error.boundary, "response");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("OpenAI v1 organization usage classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationUsageProviderError({ status: 408 }), "PROVIDER_TIMEOUT");
  assert.equal(classifyOpenAIV1OrganizationUsageProviderError({ status: 503 }), "PROVIDER_UNAVAILABLE");
});
