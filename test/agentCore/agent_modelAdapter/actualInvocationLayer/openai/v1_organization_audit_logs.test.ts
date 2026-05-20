import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ORGANIZATION_AUDIT_LOGS_ENDPOINT,
  classifyOpenAIV1OrganizationAuditLogsProviderError,
  invokeOpenAIV1OrganizationAuditLogs,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_audit_logs.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_organization_audit_logs.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_organization_audit_logs.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 organization audit logs builds a dry-run list envelope", async () => {
  const result = await invokeOpenAIV1OrganizationAuditLogs({
    query: { limit: 5 },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_ORGANIZATION_AUDIT_LOGS_ENDPOINT);
  assert.equal(result.request.operation, "list-audit-logs");
  assert.equal(result.request.query.limit, "5");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 organization audit logs rejects governance denial", async () => {
  const result = await invokeOpenAIV1OrganizationAuditLogs({
    runtime: { runtimeId: "runtime-1" },
    governance: { accepted: false, reason: "audit scope denied" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
});

test("OpenAI v1 organization audit logs invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1OrganizationAuditLogs({
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { object: "list", data: [{ id: "audit_1" }] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "audit-log-list");
});

test("OpenAI v1 organization audit logs classifies provider timeouts", () => {
  assert.equal(classifyOpenAIV1OrganizationAuditLogsProviderError({ name: "TimeoutError" }), "PROVIDER_TIMEOUT");
});
