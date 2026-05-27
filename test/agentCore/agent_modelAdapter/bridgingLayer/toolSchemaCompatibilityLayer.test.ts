import assert from "node:assert/strict";
import test from "node:test";

import {
  createProviderToolMappings,
  lowerPraxisToolsForProvider,
  lowerProviderToolResult,
  normalizeProviderInputSchema,
  raiseProviderToolCalls,
} from "../../../../src/modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";
import {
  tool,
} from "../../../../src/runtimeImplementation/runtimeAgentManifest.js";
import {
  basetool,
} from "../../../../src/basetool/index.js";

const fixtureTools = [
  tool("file.read", {
    family: "coreBase",
    group: "file",
    description: "Read a UTF-8 workspace file and return its contents.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
      },
      required: ["path", "missingKey"],
    },
  }),
  tool("shell.run", {
    family: "coreBase",
    group: "shell",
    description: "Execute a governed shell command through the runtime shell port.",
    inputSchema: {},
  }),
  tool("web.search", {
    family: "coreBase",
    group: "web",
    description: "Search the web through the governed runtime web-search port.",
    inputSchema: {},
  }),
];

test("toolSchemaCompatibilityLayer lowers Praxis tools to OpenAI, Claude, and Gemini shapes", () => {
  const openai = lowerPraxisToolsForProvider({ providerFamily: "openaiResponses", tools: fixtureTools });
  const anthropic = lowerPraxisToolsForProvider({ providerFamily: "anthropicMessages", tools: fixtureTools });
  const gemini = lowerPraxisToolsForProvider({ providerFamily: "geminiGenerateContent", tools: fixtureTools });

  assert.deepEqual((openai.providerPayload as { tools?: unknown }).tools, openai.tools);
  assert.equal(openai.tools[0]?.type, "function");
  assert.equal(openai.tools[0]?.name, "praxis_tool_file_read");
  assert.equal(openai.tools[0]?.strict, false);
  assert.deepEqual((openai.tools[0]?.parameters as { required?: string[] }).required, ["path"]);

  assert.equal(anthropic.tools[0]?.name, "praxis_tool_file_read");
  assert.ok((anthropic.tools[0] as { input_schema?: unknown }).input_schema);
  assert.deepEqual((anthropic.tools[anthropic.tools.length - 1] as { cache_control?: unknown }).cache_control, { type: "ephemeral" });

  const geminiPayload = gemini.providerPayload as { config?: { tools?: { functionDeclarations?: unknown[] }[] } };
  assert.equal(geminiPayload.config?.tools?.[0]?.functionDeclarations?.length, 6);
  assert.equal((geminiPayload.config?.tools?.[0]?.functionDeclarations?.[0] as { name?: string }).name, "praxis_tool_file_read");
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
    tool("file.read", { family: "coreBase", group: "file" }),
    tool("file_read", { family: "coreBase", group: "file" }),
  ];
  const mappings = createProviderToolMappings(selectedTools);
  assert.deepEqual(mappings, [
    { providerName: "praxis_tool_file_read", toolId: "file.read" },
    { providerName: "praxis_tool_file_read_2", toolId: "file_read" },
  ]);

  const calls = raiseProviderToolCalls({
    providerFamily: "openaiResponses",
    mappings,
    raw: {
      output: [
        { type: "function_call", call_id: "call-1", name: "praxis_tool_file_read_2", arguments: "{}" },
      ],
    },
  });
  assert.equal(calls[0]?.toolId, "file_read");
});

test("toolSchemaCompatibilityLayer supports OpenAI chat completions tool shape and calls", () => {
  const lowered = lowerPraxisToolsForProvider({ providerFamily: "openaiChatCompletions", tools: fixtureTools });

  assert.deepEqual((lowered.providerPayload as { tools?: unknown }).tools, lowered.tools);
  assert.equal(lowered.tools[0]?.type, "function");
  assert.equal((lowered.tools[0] as { function?: { name?: string } }).function?.name, "praxis_tool_file_read");
  assert.deepEqual(
    ((lowered.tools[0] as { function?: { parameters?: { required?: string[] } } }).function?.parameters?.required),
    ["path"],
  );

  const mappings = [{ providerName: "praxis_tool_file_read", toolId: "file.read" }];
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
              name: "praxis_tool_file_read",
              arguments: "{\"path\":\"README.md\"}",
            },
          }],
        },
      }],
    },
  });

  assert.equal(calls[0]?.callId, "call-1");
  assert.equal(calls[0]?.toolId, "file.read");
  assert.deepEqual(calls[0]?.arguments, { path: "README.md" });
});

test("toolSchemaCompatibilityLayer exposes patch.apply as the preferred write contract", () => {
  const overwriteTool = basetool.core.patchApply();
  const lowered = lowerPraxisToolsForProvider({ providerFamily: "openaiChatCompletions", tools: [overwriteTool] });
  const providerTool = lowered.tools.find((item) =>
    (item as { function?: { name?: string } }).function?.name === "praxis_tool_patch_apply"
  ) as { function?: { description?: string; parameters?: { required?: string[]; properties?: Record<string, { description?: string }> } } } | undefined;

  assert.match(providerTool?.function?.description ?? "", /Codex-style patch/u);
  assert.deepEqual(providerTool?.function?.parameters?.required, ["patch"]);
  assert.match(providerTool?.function?.parameters?.properties?.patch?.description ?? "", /Begin Patch/u);
});

test("toolSchemaCompatibilityLayer raises fragmented OpenAI chat completions streaming tool calls", () => {
  const calls = raiseProviderToolCalls({
    providerFamily: "openaiChatCompletions",
    mappings: [{ providerName: "praxis_tool_file_read", toolId: "file.read" }],
    raw: [
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "chat-stream-call-1",
              type: "function",
              function: { name: "praxis_tool_file_read", arguments: "{\"path\":" },
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
  assert.equal(calls[0]?.toolId, "file.read");
  assert.deepEqual(calls[0]?.arguments, { path: "README.md" });
});

test("toolSchemaCompatibilityLayer raises fragmented Anthropic messages streaming tool calls", () => {
  const calls = raiseProviderToolCalls({
    providerFamily: "anthropicMessages",
    mappings: [{ providerName: "praxis_tool_file_search", toolId: "file.search" }],
    raw: [
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"I will scan first.\"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":2,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"praxis_tool_file_search\",\"input\":{}}}",
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
  assert.equal(calls[0]?.toolId, "file.search");
  assert.deepEqual(calls[0]?.arguments, { directoryPath: ".", maxEntries: 50 });
});

test("toolSchemaCompatibilityLayer can expose only expanded tools while keeping runtime decision tools", () => {
  const mappings = createProviderToolMappings(fixtureTools);
  const filtered = lowerPraxisToolsForProvider({
    providerFamily: "openaiResponses",
    tools: fixtureTools,
    mappings,
    visibleToolIds: ["shell.run"],
  });

  assert.deepEqual(filtered.mappings, mappings);
  assert.equal(filtered.tools.some((item) => item.name === "praxis_tool_shell_run"), true);
  assert.equal(filtered.tools.some((item) => item.name === "praxis_tool_file_read"), false);
  assert.equal(filtered.tools.some((item) => item.name === "praxis_expand_tool_context"), true);
  assert.equal(filtered.cacheHintPlan.providerHints.exposedConcreteToolCount, 1);
  assert.equal(filtered.cacheHintPlan.providerHints.foldedConcreteToolCount, 2);
});

test("toolSchemaCompatibilityLayer keeps provider schemas compact and deterministically ordered", () => {
  const noisyTools = [
    tool("mcp.resources", {
      family: "coreBase",
      group: "mcp",
      description: "List or read MCP resources. ".repeat(80),
    }),
    tool("shell.run", {
      family: "coreBase",
      group: "shell",
      description: "Execute shell commands.",
    }),
    tool("file.read", {
      family: "coreBase",
      group: "file",
      description: "Read files.",
    }),
  ];

  const first = lowerPraxisToolsForProvider({ providerFamily: "openaiResponses", tools: noisyTools });
  const second = lowerPraxisToolsForProvider({ providerFamily: "openaiResponses", tools: [...noisyTools].reverse() });

  assert.deepEqual(first.tools.map((item) => item.name), [
    "praxis_tool_file_read",
    "praxis_tool_shell_run",
    "praxis_tool_mcp_resources",
    "praxis_ephemeral_procedure",
    "praxis_request_approval",
    "praxis_expand_tool_context",
  ]);
  assert.equal(first.declarationHash, second.declarationHash);
  const mcpDeclaration = first.tools.find((item) => item.name === "praxis_tool_mcp_resources") as { description?: string } | undefined;
  assert.ok((mcpDeclaration?.description?.length ?? 0) <= 320);
  assert.match(mcpDeclaration?.description ?? "", /^toolId=mcp\.resources; family=coreBase; group=mcp;/u);
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

  const mappings = [{ providerName: "praxis_tool_file_read", toolId: "file.read" }];
  const claudeCalls = raiseProviderToolCalls({
    providerFamily: "anthropicMessages",
    mappings,
    raw: {
      content: [
        { type: "tool_use", id: "toolu-1", name: "praxis_tool_file_read", input: { path: "README.md" } },
      ],
    },
  });
  assert.equal(claudeCalls[0]?.toolId, "file.read");
  assert.deepEqual(claudeCalls[0]?.arguments, { path: "README.md" });

  const geminiCalls = raiseProviderToolCalls({
    providerFamily: "geminiGenerateContent",
    mappings,
    raw: {
      functionCalls: [{ id: "gemini-call-1", name: "praxis_tool_file_read", args: { path: "README.md" } }],
    },
  });
  assert.equal(geminiCalls[0]?.callId, "gemini-call-1");

  const malformed = raiseProviderToolCalls({
    providerFamily: "openaiResponses",
    mappings,
    raw: {
      output: [
        { type: "function_call", call_id: "bad", name: "praxis_tool_file_read", arguments: "[]" },
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
                "{\"stepId\":\"write\",\"baseToolId\":\"patch.apply\",",
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
    baseToolId: "patch.apply",
    input: { targetPath: "index.html", content: "<button data-x=\"1\">ok</button>" },
    riskLevel: "low",
    dependsOn: [],
  }]);
});

test("toolSchemaCompatibilityLayer repairs DeepSeek Anthropic procedure riskLevel drift", () => {
  const malformedArguments = [
    "{\"procedureId\":\"build\",\"purpose\":\"build app\",\"steps\":[",
    "{\"stepId\":\"write\",\"baseToolId\":\"patch.apply\",",
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
    baseToolId: "patch.apply",
    input: { workspaceRoot: ".", targetPath: "server.js", content: "console.log(1)" },
    riskLevel: "low",
  }]);
});

test("toolSchemaCompatibilityLayer lowers provider tool results", () => {
  const result = {
    callId: "call-1",
    providerName: "praxis_tool_file_read",
    toolId: "file.read",
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
        name: "praxis_tool_file_read",
        response: { result: "hello", isError: true },
      },
    }],
  });
});
