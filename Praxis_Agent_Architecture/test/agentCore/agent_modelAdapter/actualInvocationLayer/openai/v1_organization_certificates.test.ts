import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_CERTIFICATES_ENDPOINT,
  classifyOpenAIV1OrganizationCertificatesProviderError,
  invokeOpenAIV1OrganizationCertificates,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_certificates.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_certificates.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_certificates.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization certificates builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1OrganizationCertificates({
    operation: "list",
    method: "GET",
    query: { limit: 10 },
    runtime: { runtimeId: "runtime-1", invocationId: "invoke-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.provider, "openai");
  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_CERTIFICATES_ENDPOINT);
  assert.equal(result.request.query.limit, "10");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.operation, "list");
});

test("OpenAI v1 organization certificates rejects missing runtime id", async () => {
  const result = await invokeOpenAIV1OrganizationCertificates({ operation: "list" });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 organization certificates invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1OrganizationCertificates({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "cert_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/organization/certificates/cert_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "cert_123", object: "organization.certificate" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "certificate-object");
});

test("OpenAI v1 organization certificates classifies provider unavailability", () => {
  assert.equal(classifyOpenAIV1OrganizationCertificatesProviderError({ status: 502 }), "PROVIDER_UNAVAILABLE");
});
