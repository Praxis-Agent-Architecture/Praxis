import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createMockTransport, createOpenAICompatibleProvider, createRaxModelClient } from "../../../../src/modelAdapter/index.js";
import { invokeRaxModelThroughRuntime } from "../../../../src/runtimeImplementation/runtime.modelAdapter/raxModelRequestRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.modelAdapter/raxModelRequestRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/raxModelRequestRuntime.md",
  testFileUrl: import.meta.url,
});

function createMockClient() {
  const provider = createOpenAICompatibleProvider({
    id: "mock-openai",
    baseUrl: "https://mock-openai.local",
  });
  return createRaxModelClient([{
    ...provider.routes[0]!,
    transport: createMockTransport([
      {
        choices: [{ delta: { content: "hello" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      },
    ]),
  }]);
}

test("invokeRaxModelThroughRuntime prepares redacted provider requests", async () => {
  const result = await invokeRaxModelThroughRuntime({
    runtimeId: "runtime-1",
    invocationId: "invocation-1",
    mode: "prepare",
    client: createMockClient(),
    request: {
      model: {
        provider: "mock-openai",
        model: "gpt-test",
        route: "mock-openai",
        auth: { type: "api_key", value: "sk-test", header: "Authorization" },
      },
      messages: [{ role: "user", content: "hello" }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.invocationId, "invocation-1");
  assert.equal(result.prepared?.protocolId, "openai.compatible_chat");
  assert.equal(result.prepared?.redacted.headers.Authorization, "Bearer [redacted]");
  assert.equal(result.response, undefined);
});

test("invokeRaxModelThroughRuntime streams and generates through an injected client", async () => {
  const streamResult = await invokeRaxModelThroughRuntime({
    runtimeId: "runtime-1",
    invocationId: "stream-1",
    mode: "stream",
    client: createMockClient(),
    request: {
      model: { provider: "mock-openai", model: "gpt-test", route: "mock-openai", auth: { type: "none" } },
      messages: [{ role: "user", content: "hello" }],
    },
  });

  assert.equal(streamResult.ok, true);
  if (!streamResult.ok) return;
  assert.equal(streamResult.response, undefined);
  assert.equal(streamResult.events.some((event) => event.type === "text.delta"), true);

  const generateResult = await invokeRaxModelThroughRuntime({
    runtimeId: "runtime-1",
    invocationId: "generate-1",
    mode: "generate",
    client: createMockClient(),
    request: {
      model: { provider: "mock-openai", model: "gpt-test", route: "mock-openai", auth: { type: "none" } },
      messages: [{ role: "user", content: "hello" }],
    },
  });

  assert.equal(generateResult.ok, true);
  if (!generateResult.ok) return;
  assert.equal(generateResult.response?.text, "hello");
  assert.equal(generateResult.response?.usage?.totalTokens, 3);
});

test("invokeRaxModelThroughRuntime wraps provider failures as runtime errors", async () => {
  const result = await invokeRaxModelThroughRuntime({
    runtimeId: "runtime-1",
    invocationId: "broken-1",
    mode: "generate",
    client: createRaxModelClient([]),
    request: {
      model: { provider: "missing", model: "missing-model", route: "missing" },
      messages: [{ role: "user", content: "hello" }],
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "route_not_found");
    assert.match(result.error.message, /No model route registered/u);
  }
});
