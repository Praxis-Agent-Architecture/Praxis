import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_GROUPS_ENDPOINT,
  classifyOpenAIV1OrganizationGroupsProviderError,
  createOpenAIV1OrganizationGroupsInvocation,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_groups.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_groups.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_groups.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization groups builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationGroupsInvocation({
    operation: " create ",
    method: "POST",
    body: { name: "platform" },
    runtime: { runtimeId: " runtime-1 ", traceId: "trace-1" },
    requiredScopes: ["organization.groups.write"],
    allowedScopes: ["organization.groups.write"],
    mockResponse: { id: "grp_123", object: "organization.group" },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_GROUPS_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.deepEqual(result.request.body, { name: "platform" });
  assert.equal(result.request.runtime.runtimeId, "runtime-1");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "organization-group-object");
});

test("OpenAI v1 organization groups rejects live provider calls in first-round implementation", () => {
  const result = createOpenAIV1OrganizationGroupsInvocation({
    operation: "delete",
    method: "DELETE",
    pathSuffix: "grp_123",
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

test("OpenAI v1 organization groups classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationGroupsProviderError({ statusCode: 401 }), "PROVIDER_AUTH_FAILED");
  assert.equal(classifyOpenAIV1OrganizationGroupsProviderError({ code: "schema_mismatch" }), "RESPONSE_FORMAT_DRIFT");
});
