import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_AGENTS_ENDPOINT,
  invokeAnthropicV1Agents,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_agents.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_agents.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_agents.md",
  testFileUrl: import.meta.url,
});

test("Anthropic v1 agents builds a dry-run provider envelope", async () => {
  const result = await invokeAnthropicV1Agents({
    operation: "list",
    runtime: { runtimeId: "runtime-1", correlationId: "corr-1" },
    requiredScopes: ["model:invoke"],
    mockResponse: { data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, ANTHROPIC_V1_AGENTS_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/agents");
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.dryRun, true);
  assert.equal(result.response.mode, "mock");
  assert.deepEqual(result.response.raw, { data: [] });
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.request.unsafeSideEffects, false);
});

test("Anthropic v1 agents rejects empty input before provider access", async () => {
  const result = await invokeAnthropicV1Agents();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("Anthropic v1 agents rejects scopes outside the invocation boundary", async () => {
  const result = await invokeAnthropicV1Agents({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["model:invoke", "admin:agents"],
    allowedScopes: ["model:invoke"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
});
