import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_ROLES_ENDPOINT,
  classifyOpenAIV1OrganizationRolesProviderError,
  createOpenAIV1OrganizationRolesInvocation,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_roles.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_roles.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_roles.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization roles builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationRolesInvocation({
    operation: " list ",
    query: { limit: 20 },
    runtime: { runtimeId: " runtime-1 ", traceId: "trace-roles" },
    requiredScopes: ["organization.roles.read"],
    allowedScopes: ["organization.roles.read"],
    mockResponse: { object: "list", data: [] },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_ROLES_ENDPOINT);
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.query.limit, "20");
  assert.equal(result.request.runtime.runtimeId, "runtime-1");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "organization-roles-list");
  assert.equal(result.capability.providerRawShapePromoted, false);
});

test("OpenAI v1 organization roles rejects scope drift before provider calls", () => {
  const result = createOpenAIV1OrganizationRolesInvocation({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["organization.roles.read"],
    allowedScopes: ["organization.users.read"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.equal(result.error.providerRawDetailExposed, false);
});

test("OpenAI v1 organization roles classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationRolesProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");
  assert.equal(classifyOpenAIV1OrganizationRolesProviderError({ code: "schema_mismatch" }), "RESPONSE_FORMAT_DRIFT");
});
