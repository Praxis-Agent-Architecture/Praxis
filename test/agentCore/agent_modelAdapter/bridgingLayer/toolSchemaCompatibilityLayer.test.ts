import assert from "node:assert/strict";
import test from "node:test";

import {
  createProviderToolMappings,
  lowerPraxisToolsForProvider,
  lowerProviderToolResult,
  normalizeProviderInputSchema,
  raiseProviderToolCalls,
} from "../../../../src/agentCore/agent_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";
import {
  tool,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";

const fixtureTools = [
  tool("code.read", {
    family: "codeBase",
    group: "explore",
    description: "Read a UTF-8 workspace file and return its contents.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
      },
      required: ["path", "missingKey"],
    },
  }),
  tool("shell.commandExecution", {
    family: "shellBase",
    group: "shellExecution",
    description: "Execute a governed shell command through the runtime shell port.",
    inputSchema: {},
  }),
  tool("git.getRepositoryStatus", {
    family: "gitBase",
    group: "repository",
    description: "Read git repository status without changing files.",
    inputSchema: {},
  }),
];

test("toolSchemaCompatibilityLayer lowers Praxis tools to OpenAI, Claude, and Gemini shapes", () => {
  const openai = lowerPraxisToolsForProvider({ providerFamily: "openaiResponses", tools: fixtureTools });
  const anthropic = lowerPraxisToolsForProvider({ providerFamily: "anthropicMessages", tools: fixtureTools });
  const gemini = lowerPraxisToolsForProvider({ providerFamily: "geminiGenerateContent", tools: fixtureTools });

  assert.deepEqual((openai.providerPayload as { tools?: unknown }).tools, openai.tools);
  assert.equal(openai.tools[0]?.type, "function");
  assert.equal(openai.tools[0]?.name, "praxis_tool_code_read");
  assert.equal(openai.tools[0]?.strict, false);
  assert.deepEqual((openai.tools[0]?.parameters as { required?: string[] }).required, ["path"]);

  assert.equal(anthropic.tools[0]?.name, "praxis_tool_code_read");
  assert.ok((anthropic.tools[0] as { input_schema?: unknown }).input_schema);
  assert.deepEqual((anthropic.tools[anthropic.tools.length - 1] as { cache_control?: unknown }).cache_control, { type: "ephemeral" });

  const geminiPayload = gemini.providerPayload as { config?: { tools?: { functionDeclarations?: unknown[] }[] } };
  assert.equal(geminiPayload.config?.tools?.[0]?.functionDeclarations?.length, 6);
  assert.equal((geminiPayload.config?.tools?.[0]?.functionDeclarations?.[0] as { name?: string }).name, "praxis_tool_code_read");
  assert.equal(openai.tools.some((item) => item.name === "praxis_expand_tool_context"), true);
  const expandTool = openai.tools.find((item) => item.name === "praxis_expand_tool_context") as { parameters?: { required?: string[]; properties?: { targetKind?: { enum?: string[] } } } } | undefined;
  assert.deepEqual(expandTool?.parameters?.required, ["targetKind", "toolId"]);
  assert.deepEqual(expandTool?.parameters?.properties?.targetKind?.enum, ["tool"]);
});

test("toolSchemaCompatibilityLayer keeps colliding provider names reversible", () => {
  const selectedTools = [
    tool("code.read", { family: "codeBase", group: "explore" }),
    tool("code_read", { family: "codeBase", group: "explore" }),
  ];
  const mappings = createProviderToolMappings(selectedTools);
  assert.deepEqual(mappings, [
    { providerName: "praxis_tool_code_read", toolId: "code.read" },
    { providerName: "praxis_tool_code_read_2", toolId: "code_read" },
  ]);

  const calls = raiseProviderToolCalls({
    providerFamily: "openaiResponses",
    mappings,
    raw: {
      output: [
        { type: "function_call", call_id: "call-1", name: "praxis_tool_code_read_2", arguments: "{}" },
      ],
    },
  });
  assert.equal(calls[0]?.toolId, "code_read");
});

test("toolSchemaCompatibilityLayer can expose only expanded tools while keeping runtime decision tools", () => {
  const mappings = createProviderToolMappings(fixtureTools);
  const filtered = lowerPraxisToolsForProvider({
    providerFamily: "openaiResponses",
    tools: fixtureTools,
    mappings,
    visibleToolIds: ["shell.commandExecution"],
  });

  assert.deepEqual(filtered.mappings, mappings);
  assert.equal(filtered.tools.some((item) => item.name === "praxis_tool_shell_commandExecution"), true);
  assert.equal(filtered.tools.some((item) => item.name === "praxis_tool_code_read"), false);
  assert.equal(filtered.tools.some((item) => item.name === "praxis_expand_tool_context"), true);
  assert.equal(filtered.cacheHintPlan.providerHints.exposedConcreteToolCount, 1);
  assert.equal(filtered.cacheHintPlan.providerHints.foldedConcreteToolCount, 2);
});

test("toolSchemaCompatibilityLayer keeps provider schemas compact and deterministically ordered", () => {
  const noisyTools = [
    tool("mcp.listTools", {
      family: "mcpBase",
      group: "catalog",
      description: "List MCP tools. ".repeat(80),
    }),
    tool("shell.commandExecution", {
      family: "shellBase",
      group: "shellExecution",
      description: "Execute shell commands.",
    }),
    tool("code.read", {
      family: "codeBase",
      group: "explore",
      description: "Read files.",
    }),
  ];

  const first = lowerPraxisToolsForProvider({ providerFamily: "openaiResponses", tools: noisyTools });
  const second = lowerPraxisToolsForProvider({ providerFamily: "openaiResponses", tools: [...noisyTools].reverse() });

  assert.deepEqual(first.tools.map((item) => item.name), [
    "praxis_tool_code_read",
    "praxis_tool_shell_commandExecution",
    "praxis_tool_mcp_listTools",
    "praxis_ephemeral_procedure",
    "praxis_request_approval",
    "praxis_expand_tool_context",
  ]);
  assert.equal(first.declarationHash, second.declarationHash);
  const mcpDeclaration = first.tools.find((item) => item.name === "praxis_tool_mcp_listTools") as { description?: string } | undefined;
  assert.ok((mcpDeclaration?.description?.length ?? 0) <= 320);
  assert.match(mcpDeclaration?.description ?? "", /^toolId=mcp\.listTools; family=mcpBase; group=catalog;/u);
});

test("toolSchemaCompatibilityLayer normalizes loose schemas and raises provider fixtures", () => {
  assert.deepEqual(normalizeProviderInputSchema(true), { type: "object", properties: {} });
  assert.deepEqual(normalizeProviderInputSchema("raw"), {
    type: "object",
    properties: { input: "raw" },
    required: ["input"],
      additionalProperties: false,
  });
  assert.deepEqual(normalizeProviderInputSchema({
    type: "object",
    properties: {
      target: {
        type: "object",
        properties: {
          availableDevices: { type: "array" },
        },
      },
    },
  }), {
    type: "object",
    properties: {
      target: {
        type: "object",
        properties: {
          availableDevices: { type: "array", items: { type: "string" } },
        },
      },
    },
  });

  const mappings = [{ providerName: "praxis_tool_code_read", toolId: "code.read" }];
  const claudeCalls = raiseProviderToolCalls({
    providerFamily: "anthropicMessages",
    mappings,
    raw: {
      content: [
        { type: "tool_use", id: "toolu-1", name: "praxis_tool_code_read", input: { path: "README.md" } },
      ],
    },
  });
  assert.equal(claudeCalls[0]?.toolId, "code.read");
  assert.deepEqual(claudeCalls[0]?.arguments, { path: "README.md" });

  const geminiCalls = raiseProviderToolCalls({
    providerFamily: "geminiGenerateContent",
    mappings,
    raw: {
      functionCalls: [{ id: "gemini-call-1", name: "praxis_tool_code_read", args: { path: "README.md" } }],
    },
  });
  assert.equal(geminiCalls[0]?.callId, "gemini-call-1");

  const malformed = raiseProviderToolCalls({
    providerFamily: "openaiResponses",
    mappings,
    raw: {
      output: [
        { type: "function_call", call_id: "bad", name: "praxis_tool_code_read", arguments: "[]" },
      ],
    },
  });
  assert.equal(malformed[0]?.malformedArguments, "provider tool arguments must decode to an object");
});

test("toolSchemaCompatibilityLayer lowers provider tool results", () => {
  const result = {
    callId: "call-1",
    providerName: "praxis_tool_code_read",
    toolId: "code.read",
    content: [{ type: "text" as const, text: "hello" }],
    isError: true,
  };

  assert.deepEqual(lowerProviderToolResult({ providerFamily: "openaiResponses", result }), {
    type: "function_call_output",
    call_id: "call-1",
    output: "hello",
  });
  assert.deepEqual(lowerProviderToolResult({ providerFamily: "anthropicMessages", result }), {
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: "call-1",
      content: [{ type: "text", text: "hello" }],
      is_error: true,
    }],
  });
  assert.deepEqual(lowerProviderToolResult({ providerFamily: "geminiGenerateContent", result }), {
    role: "user",
    parts: [{
      functionResponse: {
        id: "call-1",
        name: "praxis_tool_code_read",
        response: { result: "hello", isError: true },
      },
    }],
  });
});
