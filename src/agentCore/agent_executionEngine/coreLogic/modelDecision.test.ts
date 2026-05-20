import assert from "node:assert/strict";
import test from "node:test";

import { interpretModelDecision } from "./modelDecision.js";

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
          name: "praxis_tool_shell_commandExecution",
          call_id: "call_shell_1",
          arguments: JSON.stringify({ command: "git status --short" }),
        },
      ],
    },
    sessionId: "session-preamble-test",
    turnIndex: 0,
    providerFamily: "openaiResponses",
    providerToolMappings: [{
      providerName: "praxis_tool_shell_commandExecution",
      toolId: "shell.commandExecution",
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.decisions[0]?.kind : undefined, "toolCall");
  assert.equal(result.ok ? result.decisions[0]?.preambleText : undefined, "我先检查当前文件状态。");
});
