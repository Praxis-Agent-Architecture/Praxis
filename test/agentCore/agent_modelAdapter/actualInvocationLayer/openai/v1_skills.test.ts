import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_SKILLS_ENDPOINT,
  classifyOpenAIV1SkillsProviderError,
  invokeOpenAIV1Skills,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_skills.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_skills.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_skills.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 skills builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Skills({
    operation: "list",
    query: { limit: 10 },
    runtime: { runtimeId: "runtime-1", invocationId: "skills-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_SKILLS_ENDPOINT);
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.query.limit, "10");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 skills rejects missing runtime as an input boundary error", async () => {
  const result = await invokeOpenAIV1Skills({ operation: "list" });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 skills invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Skills({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "skill_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/skills/skill_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "skill_123", object: "skill" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "skill-object");
});

test("OpenAI v1 skills classifies provider auth failures", () => {
  assert.equal(classifyOpenAIV1SkillsProviderError({ statusCode: 403 }), "PROVIDER_AUTH_FAILED");
});
