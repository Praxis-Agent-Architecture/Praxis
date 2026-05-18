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
import {
  codeOverwriteBaseToolDefinition,
} from "../../../../src/storagePool/baseToolStorage/codeBase/edit/code.overwrite/bestPractice.js";

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

  const procedureTool = openai.tools.find((item) => item.name === "praxis_ephemeral_procedure") as {
    parameters?: {
      properties?: {
        steps?: {
          items?: {
            properties?: {
              input?: { description?: string };
            };
          };
        };
      };
    };
  } | undefined;
  assert.match(procedureTool?.parameters?.properties?.steps?.items?.properties?.input?.description ?? "", /workspaceRoot/u);
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

test("toolSchemaCompatibilityLayer supports OpenAI chat completions tool shape and calls", () => {
  const lowered = lowerPraxisToolsForProvider({ providerFamily: "openaiChatCompletions", tools: fixtureTools });

  assert.deepEqual((lowered.providerPayload as { tools?: unknown }).tools, lowered.tools);
  assert.equal(lowered.tools[0]?.type, "function");
  assert.equal((lowered.tools[0] as { function?: { name?: string } }).function?.name, "praxis_tool_code_read");
  assert.deepEqual(
    ((lowered.tools[0] as { function?: { parameters?: { required?: string[] } } }).function?.parameters?.required),
    ["path"],
  );

  const mappings = [{ providerName: "praxis_tool_code_read", toolId: "code.read" }];
  const calls = raiseProviderToolCalls({
    providerFamily: "openaiChatCompletions",
    mappings,
    raw: {
      choices: [{
        message: {
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: {
              name: "praxis_tool_code_read",
              arguments: "{\"path\":\"README.md\"}",
            },
          }],
        },
      }],
    },
  });

  assert.equal(calls[0]?.callId, "call-1");
  assert.equal(calls[0]?.toolId, "code.read");
  assert.deepEqual(calls[0]?.arguments, { path: "README.md" });
});

test("toolSchemaCompatibilityLayer exposes code.overwrite workspaceRoot contract clearly", () => {
  const overwriteTool = tool("code.overwrite", {
    family: "codeBase",
    group: "edit",
    description: codeOverwriteBaseToolDefinition.description,
    inputSchema: codeOverwriteBaseToolDefinition.inputSchema.schema as Readonly<Record<string, unknown>>,
  });
  const lowered = lowerPraxisToolsForProvider({ providerFamily: "openaiChatCompletions", tools: [overwriteTool] });
  const providerTool = lowered.tools.find((item) =>
    (item as { function?: { name?: string } }).function?.name === "praxis_tool_code_overwrite"
  ) as { function?: { description?: string; parameters?: { required?: string[]; properties?: Record<string, { description?: string }> } } } | undefined;

  assert.match(providerTool?.function?.description ?? "", /workspaceRoot/u);
  assert.deepEqual(providerTool?.function?.parameters?.required, ["workspaceRoot", "targetPath", "content"]);
  assert.match(providerTool?.function?.parameters?.properties?.workspaceRoot?.description ?? "", /scope auditing/u);
});

test("toolSchemaCompatibilityLayer raises fragmented OpenAI chat completions streaming tool calls", () => {
  const calls = raiseProviderToolCalls({
    providerFamily: "openaiChatCompletions",
    mappings: [{ providerName: "praxis_tool_code_read", toolId: "code.read" }],
    raw: [
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "chat-stream-call-1",
              type: "function",
              function: { name: "praxis_tool_code_read", arguments: "{\"path\":" },
            }],
          },
        }],
      })}`,
      "",
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: "\"README.md\"}" },
            }],
          },
        }],
      })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.callId, "chat-stream-call-1");
  assert.equal(calls[0]?.toolId, "code.read");
  assert.deepEqual(calls[0]?.arguments, { path: "README.md" });
});

test("toolSchemaCompatibilityLayer raises fragmented Anthropic messages streaming tool calls", () => {
  const calls = raiseProviderToolCalls({
    providerFamily: "anthropicMessages",
    mappings: [{ providerName: "praxis_tool_code_scan", toolId: "code.scan" }],
    raw: [
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"I will scan first.\"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":2,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"praxis_tool_code_scan\",\"input\":{}}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":2,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"directoryPath\\\":\"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":2,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\".\\\", \\\"maxEntries\\\": 50}\"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":2}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.callId, "call_1");
  assert.equal(calls[0]?.toolId, "code.scan");
  assert.deepEqual(calls[0]?.arguments, { directoryPath: ".", maxEntries: 50 });
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

test("toolSchemaCompatibilityLayer repairs common DeepSeek ephemeral procedure step field drift", () => {
  const repaired = raiseProviderToolCalls({
    providerFamily: "openaiChatCompletions",
    raw: {
      choices: [{
        message: {
          tool_calls: [{
            id: "call-procedure",
            type: "function",
            function: {
              name: "praxis_ephemeral_procedure",
              arguments: [
                "{\"procedureId\":\"build\",\"purpose\":\"build app\",\"steps\":[",
                "{\"stepId\":\"write\",\"baseToolId\":\"code.overwrite\",",
                "\"input\":{\"targetPath\":\"index.html\",\"content\":\"<button data-x=\\\"1\\\">ok</button>\"},",
                "\"riskLevel\":\"low\"}, \"dependsOn\": []}]}",
              ].join(""),
            },
          }],
        },
      }],
    },
  });

  assert.equal(repaired[0]?.malformedArguments, undefined);
  assert.equal(repaired[0]?.providerName, "praxis_ephemeral_procedure");
  assert.deepEqual(repaired[0]?.arguments.steps, [{
    stepId: "write",
    baseToolId: "code.overwrite",
    input: { targetPath: "index.html", content: "<button data-x=\"1\">ok</button>" },
    riskLevel: "low",
    dependsOn: [],
  }]);
});

test("toolSchemaCompatibilityLayer repairs DeepSeek Anthropic procedure riskLevel drift", () => {
  const malformedArguments = [
    "{\"procedureId\":\"build\",\"purpose\":\"build app\",\"steps\":[",
    "{\"stepId\":\"write\",\"baseToolId\":\"code.overwrite\",",
    "\"input\":{\"workspaceRoot\":\".\",\"targetPath\":\"server.js\",\"content\":\"console.log(1)\"}},",
    "\"riskLevel\":\"low\"}]}",
  ].join("");

  const repaired = raiseProviderToolCalls({
    providerFamily: "anthropicMessages",
    raw: [
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call-risk\",\"name\":\"praxis_ephemeral_procedure\",\"input\":{}}}",
      "",
      "event: content_block_delta",
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: malformedArguments } })}`,
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
    ].join("\n"),
  });

  assert.equal(repaired[0]?.malformedArguments, undefined);
  assert.deepEqual(repaired[0]?.arguments.steps, [{
    stepId: "write",
    baseToolId: "code.overwrite",
    input: { workspaceRoot: ".", targetPath: "server.js", content: "console.log(1)" },
    riskLevel: "low",
  }]);
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
  assert.deepEqual(lowerProviderToolResult({ providerFamily: "openaiChatCompletions", result }), {
    role: "tool",
    tool_call_id: "call-1",
    content: "hello",
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
