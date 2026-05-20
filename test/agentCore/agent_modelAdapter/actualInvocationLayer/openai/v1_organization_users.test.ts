import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_USERS_ENDPOINT,
  classifyOpenAIV1OrganizationUsersProviderError,
  createOpenAIV1OrganizationUsersInvocation,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_organization_users.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_organization_users.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_users.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization users builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationUsersInvocation({
    operation: " update ",
    method: "PATCH",
    pathSuffix: "user_123",
    body: { role: "owner" },
    runtime: { runtimeId: " runtime-1 ", callerId: "adapter-test" },
    requiredScopes: ["organization.users.write"],
    allowedScopes: ["organization.users.write"],
    mockResponse: { id: "user_123", object: "organization.user" },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_USERS_ENDPOINT);
  assert.equal(result.request.method, "PATCH");
  assert.equal(result.request.url.endsWith("/v1/organization/users/user_123"), true);
  assert.deepEqual(result.request.body, { role: "owner" });
  assert.equal(result.request.runtime.callerId, "adapter-test");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.capability.rawShape, "organization-user-object");
});

test("OpenAI v1 organization users rejects live provider calls in first-round implementation", () => {
  const result = createOpenAIV1OrganizationUsersInvocation({
    operation: "delete",
    method: "DELETE",
    pathSuffix: "user_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "REAL_PROVIDER_CALL_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.equal(result.request?.providerCallPlanned, false);
});

test("OpenAI v1 organization users classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationUsersProviderError({ statusCode: 401 }), "PROVIDER_AUTH_FAILED");
  assert.equal(classifyOpenAIV1OrganizationUsersProviderError({ name: "AbortError" }), "PROVIDER_TIMEOUT");
});
