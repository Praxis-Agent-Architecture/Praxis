import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_INVITES_ENDPOINT,
  classifyOpenAIV1OrganizationInvitesProviderError,
  createOpenAIV1OrganizationInvitesInvocation,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_invites.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_invites.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_invites.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization invites builds a dry-run provider envelope", () => {
  const result = createOpenAIV1OrganizationInvitesInvocation({
    operation: " create ",
    method: "POST",
    body: { email: "dev@example.com", role: "reader" },
    runtime: { runtimeId: " runtime-1 ", callerId: "adapter-test" },
    requiredScopes: ["organization.invites.write"],
    allowedScopes: ["organization.invites.write"],
    mockResponse: { id: "invite_123", object: "organization.invite" },
    expectResponseObject: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_INVITES_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.runtime.runtimeId, "runtime-1");
  assert.equal(result.request.runtime.callerId, "adapter-test");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.deepEqual(result.response.raw, { id: "invite_123", object: "organization.invite" });
  assert.equal(result.capability.rawShape, "organization-invite-object");
});

test("OpenAI v1 organization invites keeps contract rejection explainable", () => {
  const result = createOpenAIV1OrganizationInvitesInvocation({
    operation: "create",
    method: "POST",
    runtime: { runtimeId: "runtime-1" },
    contract: { accepted: false, reason: "invite creation is outside this invocation contract" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "CONTRACT_REJECTED");
  assert.equal(result.error.message, "invite creation is outside this invocation contract");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("OpenAI v1 organization invites classifies provider failures", () => {
  assert.equal(classifyOpenAIV1OrganizationInvitesProviderError({ status: 500 }), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyOpenAIV1OrganizationInvitesProviderError({ status: 403 }), "PROVIDER_AUTH_FAILED");
});
