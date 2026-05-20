import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_PROJECTS_ENDPOINT,
  classifyOpenAIV1OrganizationProjectsProviderError,
  createOpenAIV1OrganizationProjectsInvocation,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_organization_projects.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_organization_projects.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_projects.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization projects builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationProjectsInvocation({
    operation: " retrieve ",
    method: "GET",
    pathSuffix: "proj_123",
    query: { include_archived: false },
    runtime: { runtimeId: " runtime-1 ", invocationId: "project-invoke-1" },
    requiredScopes: ["organization.projects.read"],
    allowedScopes: ["organization.projects.read"],
    mockResponse: { id: "proj_123", object: "organization.project" },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_PROJECTS_ENDPOINT);
  assert.equal(result.request.url.endsWith("/v1/organization/projects/proj_123"), true);
  assert.equal(result.request.query.include_archived, "false");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "organization-project-object");
});

test("OpenAI v1 organization projects rejects response drift in mock envelopes", () => {
  const result = createOpenAIV1OrganizationProjectsInvocation({
    operation: "retrieve",
    pathSuffix: "proj_123",
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
  assert.equal(result.error.providerRawDetailExposed, false);
});

test("OpenAI v1 organization projects classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationProjectsProviderError({ status: 408 }), "PROVIDER_TIMEOUT");
  assert.equal(classifyOpenAIV1OrganizationProjectsProviderError({ status: 404 }), "PROVIDER_UNAVAILABLE");
});
