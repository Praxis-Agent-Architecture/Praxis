import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_COSTS_ENDPOINT,
  classifyOpenAIV1OrganizationCostsProviderError,
  createOpenAIV1OrganizationCostsInvocation,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_costs.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_costs.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_costs.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization costs builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationCostsInvocation({
    operation: " list ",
    query: { start_time: 1_700_000_000, limit: 20 },
    runtime: { runtimeId: " runtime-1 ", invocationId: "invoke-1" },
    requiredScopes: ["organization.costs.read"],
    allowedScopes: ["organization.costs.read"],
    mockResponse: { object: "list", data: [] },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_COSTS_ENDPOINT);
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.query.start_time, "1700000000");
  assert.equal(result.request.runtime.runtimeId, "runtime-1");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.request.providerCallPlanned, false);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.providerRawShapePromoted, false);
});

test("OpenAI v1 organization costs rejects scope drift before provider side effects", () => {
  const result = createOpenAIV1OrganizationCostsInvocation({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["organization.costs.read"],
    allowedScopes: ["organization.projects.read"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.equal(result.error.providerRawDetailExposed, false);
});

test("OpenAI v1 organization costs classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationCostsProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");
  assert.equal(classifyOpenAIV1OrganizationCostsProviderError({ name: "AbortError" }), "PROVIDER_TIMEOUT");
});
