import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { assemblePromptPack } from "../../../../src/agentCore/agent_executionEngine/promptPack/promptAssembler.js";
import { definePromptPack } from "../../../../src/agentCore/agent_executionEngine/promptPack/promptDefiner.js";
import {
  mapPromptMaterials,
  promptMapperDescriptor,
} from "../../../../src/agentCore/agent_executionEngine/promptPack/promptMapper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/promptPack/promptMapper.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/promptPack/promptMapper.md",
  testFileUrl: import.meta.url,
});

function createAssembledPack() {
  const defined = definePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    targetModel: "gpt-5.4",
    basicCorePromptText: "Praxis root head.",
    materials: [
      { id: "user", kind: "user", text: "Explain the current task.", source: "application", priority: 90 },
      {
        id: "tool-policy",
        kind: "tool",
        text: "Tool policy: ask before write.",
        source: "tool",
        priority: 80,
        trusted: true,
        metadata: { toolMaterialType: "policy" },
      },
      {
        id: "tool-declaration",
        kind: "tool",
        text: "Read files in the workspace.",
        source: "tool",
        priority: 79,
        trusted: true,
        metadata: {
          toolMaterialType: "declaration",
          toolName: "workspace_read",
          toolDescription: "Read a UTF-8 text file from the current workspace.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
            required: ["path"],
          },
        },
      },
      {
        id: "tool-result",
        kind: "tool",
        text: "{\"ok\":true}",
        source: "tool",
        priority: 78,
        trusted: true,
        metadata: {
          toolMaterialType: "result",
          toolName: "workspace_read",
          toolCallId: "call_123",
        },
      },
      { id: "memory", kind: "memory", text: "Remember PromptPack boundaries.", source: "memory", priority: 40 },
    ],
  });
  assert.equal(defined.ok, true);
  if (!defined.ok) {
    throw new Error("expected definition");
  }

  const assembled = assemblePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    targetModel: "gpt-5.4",
    materials: defined.definition.materials,
    ordering: "priority-desc",
  });
  assert.equal(assembled.ok, true);
  if (!assembled.ok) {
    throw new Error("expected assembly");
  }

  return assembled.promptPack;
}

test("mapPromptMaterials maps assembled PromptPack into OpenAI provider payload", () => {
  const result = mapPromptMaterials({
    runtimeId: "runtime",
    sessionId: "session",
    promptPack: createAssembledPack(),
    targetProvider: "openai",
  });

  assert.equal(promptMapperDescriptor.providerPayloadCreated, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected PromptPack to map");
  }

  assert.equal(result.mappedPack.kind, "praxis.promptPack.mapped");
  assert.equal(result.mappedPack.targetProvider, "openai");
  assert.equal(result.mappedPack.providerPayload.endpoint, "responses");
  assert.equal(result.mappedPack.providerPayload.body.model, "gpt-5.4");
  const input = result.mappedPack.providerPayload.body.input;
  assert.equal(Array.isArray(input), true);
  assert.deepEqual((input as Array<{ role?: string; type?: string }>).map((message) => message.role ?? message.type), [
    "developer",
    "developer",
    "user",
    "function_call_output",
  ]);
  assert.match(result.mappedPack.blocks.system, /Praxis root head/);
  assert.match(result.mappedPack.blocks.tool, /ask before write/);
  assert.match(result.mappedPack.blocks.user, /Explain the current task/);
  assert.equal(result.mappedPack.tools.declarations[0]?.name, "workspace_read");
  assert.equal(result.mappedPack.tools.results[0]?.callId, "call_123");
  const tools = result.mappedPack.providerPayload.body.tools as Array<Record<string, unknown>>;
  assert.equal(tools[0]?.name, "workspace_read");
});

test("mapPromptMaterials folds high-authority blocks for Anthropic and rejects missing target", () => {
  const anthropic = mapPromptMaterials({
    runtimeId: "runtime",
    sessionId: "session",
    promptPack: createAssembledPack(),
    targetProvider: "anthropic",
  });
  assert.equal(anthropic.ok, true);
  if (!anthropic.ok) {
    throw new Error("expected Anthropic mapping");
  }
  assert.equal(anthropic.mappedPack.providerPayload.endpoint, "messages");
  assert.match(String(anthropic.mappedPack.providerPayload.body.system), /Praxis root head/);
  assert.match(String(anthropic.mappedPack.providerPayload.body.system), /ask before write/);
  const anthropicTools = anthropic.mappedPack.providerPayload.body.tools as Array<Record<string, unknown>>;
  assert.equal(anthropicTools[0]?.name, "workspace_read");
  const messages = anthropic.mappedPack.providerPayload.body.messages as Array<{ content: unknown }>;
  assert.equal(Array.isArray(messages[0]?.content), true);
  assert.equal((messages[0]?.content as Array<{ type?: string }>)[0]?.type, "tool_result");

  const gemini = mapPromptMaterials({
    runtimeId: "runtime",
    sessionId: "session",
    promptPack: createAssembledPack(),
    targetProvider: "gemini",
  });
  assert.equal(gemini.ok, true);
  if (!gemini.ok) {
    throw new Error("expected Gemini mapping");
  }
  const config = gemini.mappedPack.providerPayload.body.config as { tools?: Array<{ functionDeclarations?: unknown[] }> };
  assert.equal(config.tools?.[0]?.functionDeclarations?.length, 1);
  const contents = gemini.mappedPack.providerPayload.body.contents as Array<{ parts: Array<Record<string, unknown>> }>;
  assert.equal("functionResponse" in contents[0]!.parts[1]!, true);

  const missing = mapPromptMaterials({
    runtimeId: "runtime",
    sessionId: "session",
    promptPack: createAssembledPack(),
  });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing target rejection");
  }
  assert.equal(missing.error.code, "MISSING_TARGET_PROVIDER");
});
