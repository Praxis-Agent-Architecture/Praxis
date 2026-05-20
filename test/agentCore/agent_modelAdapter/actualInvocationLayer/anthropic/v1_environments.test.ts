import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_ENVIRONMENTS_ENDPOINT,
  invokeAnthropicV1Environments,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_environments.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_environments.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_environments.md",
  testFileUrl: import.meta.url,
});

test("Anthropic v1 environments builds a dry-run provider envelope", async () => {
  const result = await invokeAnthropicV1Environments({
    operation: "list",
    runtime: { runtimeId: "runtime-1", callerId: "model-adapter" },
    pathSuffix: "env_123",
    query: { limit: 10, cursor: undefined },
    mockResponse: { id: "env_123" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, ANTHROPIC_V1_ENVIRONMENTS_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/environments/env_123");
  assert.equal(result.request.query.limit, "10");
  assert.equal(result.response.mode, "mock");
  assert.deepEqual(result.response.raw, { id: "env_123" });
});

test("Anthropic v1 environments rejects empty input before provider access", async () => {
  const result = await invokeAnthropicV1Environments();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("Anthropic v1 environments rejects unavailable auth envelopes", async () => {
  const result = await invokeAnthropicV1Environments({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    auth: { kind: "api-key", present: false },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "AUTH_REJECTED");
  assert.equal(result.error.boundary, "auth");
});
