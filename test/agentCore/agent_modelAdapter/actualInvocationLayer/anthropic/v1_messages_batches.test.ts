import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT,
  invokeAnthropicV1MessagesBatches,
} from "../../../../../src/modelAdapter/actualInvocationLayer/anthropic/v1_messages_batches.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/anthropic/v1_messages_batches.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages_batches.md",
  testFileUrl: import.meta.url,
});

test("v1_messages_batches builds dry-run envelopes for scoped batch operations", async () => {
  const result = await invokeAnthropicV1MessagesBatches({
    operation: "retrieve",
    batchId: "msgbatch_123",
    runtime: { traceId: "trace:batch" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT);
  assert.equal(result.envelope.operation, "retrieve");
  assert.equal(result.envelope.method, "GET");
  assert.equal(result.envelope.url, "https://api.anthropic.com/v1/messages/batches/msgbatch_123");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.capability.rawShape, "dry-run");
});

test("v1_messages_batches rejects missing operation, ids, and create bodies", async () => {
  const missingOperation = await invokeAnthropicV1MessagesBatches({});
  assert.equal(missingOperation.ok, false);
  if (missingOperation.ok) {
    return;
  }
  assert.equal(missingOperation.error.code, "MISSING_OPERATION");

  const missingBatchId = await invokeAnthropicV1MessagesBatches({ operation: "cancel" });
  assert.equal(missingBatchId.ok, false);
  if (missingBatchId.ok) {
    return;
  }
  assert.equal(missingBatchId.error.code, "MISSING_BATCH_ID");

  const missingBody = await invokeAnthropicV1MessagesBatches({ operation: "create" });
  assert.equal(missingBody.ok, false);
  if (missingBody.ok) {
    return;
  }
  assert.equal(missingBody.error.code, "MISSING_REQUEST_BODY");
});

test("v1_messages_batches wraps mock provider payloads and classifies timeout status", async () => {
  const ok = await invokeAnthropicV1MessagesBatches({
    operation: "create",
    dryRun: false,
    apiKey: "sk-ant-test",
    body: { requests: [{ custom_id: "request-1" }] },
    transport: (envelope) => {
      assert.equal(envelope.method, "POST");
      assert.equal(envelope.headers["x-api-key"], "sk-ant-test");
      return { statusCode: 200, body: { id: "msgbatch_123", type: "message_batch" } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "batch-object");

  const timeout = await invokeAnthropicV1MessagesBatches({
    operation: "list",
    dryRun: false,
    apiKey: "sk-ant-test",
    transport: () => ({ statusCode: 408, body: { error: { type: "timeout_error" } } }),
  });
  assert.equal(timeout.ok, false);
  if (timeout.ok) {
    return;
  }
  assert.equal(timeout.error.code, "PROVIDER_TIMEOUT");
  assert.equal(timeout.error.boundary, "timeout");
  assert.equal(timeout.error.statusCode, 408);
});
