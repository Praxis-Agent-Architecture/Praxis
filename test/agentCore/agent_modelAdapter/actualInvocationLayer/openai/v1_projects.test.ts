import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_PROJECTS_ENDPOINT,
  classifyOpenAIV1ProjectsProviderError,
  createOpenAIV1ProjectsInvocation,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_projects.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_projects.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_projects.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 projects builds a dry-run provider envelope", () => {
  const result = createOpenAIV1ProjectsInvocation({
    operation: " retrieve ",
    method: "GET",
    pathSuffix: "proj_123",
    query: { include_archived: false },
    runtime: { runtimeId: " runtime-1 ", invocationId: "project-invoke-1" },
    requiredScopes: ["projects.read"],
    allowedScopes: ["projects.read"],
    mockResponse: { id: "proj_123", object: "project" },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_PROJECTS_ENDPOINT);
  assert.equal(result.request.url.endsWith("/v1/projects/proj_123"), true);
  assert.equal(result.request.query.include_archived, "false");
  assert.equal(result.request.runtime.invocationId, "project-invoke-1");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "project-object");
});

test("OpenAI v1 projects keeps governance rejection explainable", () => {
  const result = createOpenAIV1ProjectsInvocation({
    operation: "archive",
    method: "POST",
    runtime: { runtimeId: "runtime-1" },
    governance: { accepted: false, reason: "project mutation is outside this runtime policy" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.message, "project mutation is outside this runtime policy");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("OpenAI v1 projects classifies provider failures", () => {
  assert.equal(classifyOpenAIV1ProjectsProviderError({ status: 404 }), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyOpenAIV1ProjectsProviderError({ status: 403 }), "PROVIDER_AUTH_FAILED");
});
