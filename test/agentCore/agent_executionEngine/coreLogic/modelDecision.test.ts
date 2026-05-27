import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { interpretModelDecision } from "../../../../src/executionEngine/coreLogic/modelDecision.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/modelDecision.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/modelDecision.md",
  testFileUrl: import.meta.url,
});

test("interpretModelDecision normalizes provider text into finalOutput", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision",
    turnIndex: 0,
    raw: {
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "final answer" }],
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0]?.kind, "finalOutput");
  assert.equal(result.decisions[0]?.finalOutput, "final answer");
});

test("interpretModelDecision does not expose raw Responses protocol as finalOutput", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-sse-protocol",
    turnIndex: 0,
    raw: [
      "event: response.created",
      "data: {\"type\":\"response.created\",\"response\":{\"instructions\":\"Praxis BaseTool calling protocol:\",\"tools\":[{\"name\":\"praxis_tool_shell_run\"}]}}",
      "",
      "event: response.output_item.done",
      "data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"reasoning\",\"summary\":[]}}",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0]?.kind, "continue");
  assert.equal(result.decisions[0]?.finalOutput, undefined);
});

test("interpretModelDecision maps function calls through provider tool mappings", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-tool",
    turnIndex: 1,
    providerToolMappings: [{ providerName: "praxis_tool_file_read", toolId: "file.read" }],
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_tool_file_read",
        call_id: "call-1",
        arguments: "{\"targetPath\":\"notes.txt\"}",
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "toolCall");
  assert.equal(result.decisions[0]?.toolCall?.toolId, "file.read");
  assert.deepEqual(result.decisions[0]?.toolCall?.arguments, { targetPath: "notes.txt" });
});

test("interpretModelDecision reads OpenAI chat completions text and tool calls", () => {
  const textResult = interpretModelDecision({
    sessionId: "session-decision-chat-text",
    turnIndex: 1,
    providerFamily: "openaiChatCompletions",
    raw: {
      choices: [{ message: { role: "assistant", content: "chat final" } }],
    },
  });

  assert.equal(textResult.ok, true);
  if (!textResult.ok) return;
  assert.equal(textResult.decisions[0]?.kind, "finalOutput");
  assert.equal(textResult.decisions[0]?.finalOutput, "chat final");

  const toolResult = interpretModelDecision({
    sessionId: "session-decision-chat-tool",
    turnIndex: 2,
    providerFamily: "openaiChatCompletions",
    providerToolMappings: [{ providerName: "praxis_tool_file_read", toolId: "file.read" }],
    raw: {
      choices: [{
        message: {
          tool_calls: [{
            id: "chat-call-1",
            type: "function",
            function: { name: "praxis_tool_file_read", arguments: "{\"path\":\"README.md\"}" },
          }],
        },
      }],
    },
  });

  assert.equal(toolResult.ok, true);
  if (!toolResult.ok) return;
  assert.equal(toolResult.decisions[0]?.kind, "toolCall");
  assert.equal(toolResult.decisions[0]?.toolCall?.toolId, "file.read");
  assert.deepEqual(toolResult.decisions[0]?.toolCall?.arguments, { path: "README.md" });
});

test("interpretModelDecision reads streamed OpenAI chat completions text and fragmented tool calls", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-chat-stream",
    turnIndex: 3,
    providerFamily: "openaiChatCompletions",
    providerToolMappings: [{ providerName: "praxis_tool_file_read", toolId: "file.read" }],
    raw: [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "I will inspect. " } }] })}`,
      "",
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

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "toolCall");
  assert.equal(result.decisions[0]?.preambleText, "I will inspect.");
  assert.equal(result.decisions[0]?.toolCall?.toolId, "file.read");
  assert.deepEqual(result.decisions[0]?.toolCall?.arguments, { path: "README.md" });
});

test("interpretModelDecision joins streamed OpenAI chat completions text without inserting line breaks", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-chat-stream-text",
    turnIndex: 4,
    providerFamily: "openaiChatCompletions",
    raw: [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "All " } }] })}`,
      "",
      `data: ${JSON.stringify({ choices: [{ delta: { content: "project " } }] })}`,
      "",
      `data: ${JSON.stringify({ choices: [{ delta: { content: "files are ready." } }] })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "finalOutput");
  assert.equal(result.decisions[0]?.finalOutput, "All project files are ready.");
});

test("interpretModelDecision reads Anthropic messages text content", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-anthropic-text",
    turnIndex: 1,
    providerFamily: "anthropicMessages",
    raw: {
      id: "msg_1",
      content: [{ type: "text", text: "anthropic final" }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "finalOutput");
  assert.equal(result.decisions[0]?.finalOutput, "anthropic final");
});

test("interpretModelDecision reads streamed Anthropic messages text", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-anthropic-stream-text",
    turnIndex: 2,
    providerFamily: "anthropicMessages",
    raw: [
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"All \"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"done.\"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "finalOutput");
  assert.equal(result.decisions[0]?.finalOutput, "All done.");
});

test("interpretModelDecision reads streamed Anthropic tool calls with visible preamble", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-anthropic-stream-tool",
    turnIndex: 3,
    providerFamily: "anthropicMessages",
    providerToolMappings: [{ providerName: "praxis_tool_file_search", toolId: "file.search" }],
    raw: [
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"I will inspect. \"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"praxis_tool_file_search\",\"input\":{}}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"directoryPath\\\":\"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\".\\\", \\\"maxEntries\\\": 50}\"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":1}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "toolCall");
  assert.equal(result.decisions[0]?.preambleText, "I will inspect.");
  assert.equal(result.decisions[0]?.toolCall?.toolId, "file.search");
  assert.deepEqual(result.decisions[0]?.toolCall?.arguments, { directoryPath: ".", maxEntries: 50 });
});

test("interpretModelDecision converts malformed provider tool arguments into fail decision", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-malformed-tool",
    turnIndex: 1,
    providerToolMappings: [{ providerName: "praxis_tool_file_read", toolId: "file.read" }],
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_tool_file_read",
        call_id: "call-bad-json",
        arguments: "{\"targetPath\":",
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "fail");
  assert.equal(result.decisions[0]?.failure?.code, "MALFORMED_PROVIDER_TOOL_ARGUMENTS");
});

test("interpretModelDecision accepts repaired OpenAI chat completions ephemeral procedure arguments", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-repaired-procedure",
    turnIndex: 1,
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

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "ephemeralProcedurePlan");
  assert.equal(result.decisions[0]?.ephemeralProcedurePlan?.steps[0]?.stepId, "write");
  assert.deepEqual(result.decisions[0]?.ephemeralProcedurePlan?.steps[0]?.dependsOn, []);
});

test("interpretModelDecision converts provider failures into fail decision", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-provider-failure",
    turnIndex: 1,
    raw: {
      error: {
        code: "upstream_timeout",
        message: "provider timed out",
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "fail");
  assert.equal(result.decisions[0]?.failure?.code, "upstream_timeout");
});

test("interpretModelDecision recognizes EphemeralProcedure as a runtime decision", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-procedure",
    turnIndex: 2,
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_ephemeral_procedure",
        call_id: "procedure-call",
        arguments: JSON.stringify({
          procedureId: "procedure-1",
          purpose: "read one file through existing BaseTool",
          executionMode: "serial",
          steps: [{
            stepId: "read",
            baseToolId: "file.read",
            input: { targetPath: "notes.txt" },
          }],
        }),
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "ephemeralProcedurePlan");
  assert.equal(result.decisions[0]?.ephemeralProcedurePlan?.procedureId, "procedure-1");
  assert.deepEqual(result.decisions[0]?.ephemeralProcedurePlan?.requiredBaseTools, ["file.read"]);
});

test("interpretModelDecision recognizes BaseTool context expansion as a runtime decision", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-expand-context",
    turnIndex: 2,
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_expand_tool_context",
        call_id: "expand-shell",
        arguments: JSON.stringify({
          targetKind: "group",
          family: "coreBase",
          group: "shell",
          reason: "need shell execution manuals before choosing a concrete tool",
        }),
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "continue");
  assert.deepEqual(result.decisions[0]?.toolContextExpansion, {
    targetKind: "group",
    family: "coreBase",
    group: "shell",
    reason: "need shell execution manuals before choosing a concrete tool",
  });
  assert.equal(result.decisions[0]?.metadata.runtimeDecision, "expandToolContext");
});

test("interpretModelDecision rejects invalid EphemeralProcedure plans", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-bad-procedure",
    turnIndex: 0,
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_ephemeral_procedure",
        call_id: "procedure-call",
        arguments: JSON.stringify({
          procedureId: "procedure-1",
          purpose: "tap should stay out of this layer",
          steps: [{ stepId: "tap", baseToolId: "tap/office", input: {} }],
        }),
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "fail");
  assert.equal(result.decisions[0]?.failure?.code, "INVALID_EPHEMERAL_PROCEDURE");
});

test("tool-call decisions retain visible preamble text from the provider response", () => {
  const result = interpretModelDecision({
    raw: {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "我先检查当前文件状态。" }],
        },
        {
          type: "function_call",
          name: "praxis_tool_shell_run",
          call_id: "call_shell_1",
          arguments: JSON.stringify({ command: "git status --short" }),
        },
      ],
    },
    sessionId: "session-preamble-test",
    turnIndex: 0,
    providerFamily: "openaiResponses",
    providerToolMappings: [{
      providerName: "praxis_tool_shell_run",
      toolId: "shell.run",
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.decisions[0]?.kind : undefined, "toolCall");
  assert.equal(result.ok ? result.decisions[0]?.preambleText : undefined, "我先检查当前文件状态。");
});
