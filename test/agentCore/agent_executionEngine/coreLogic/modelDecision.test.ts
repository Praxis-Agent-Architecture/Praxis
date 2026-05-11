import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { interpretModelDecision } from "../../../../src/agentCore/agent_executionEngine/coreLogic/modelDecision.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/coreLogic/modelDecision.ts",
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
      "data: {\"type\":\"response.created\",\"response\":{\"instructions\":\"Praxis BaseTool calling protocol:\",\"tools\":[{\"name\":\"praxis_tool_shell_commandExecution\"}]}}",
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
    providerToolMappings: [{ providerName: "praxis_tool_code_read", toolId: "code.read" }],
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_tool_code_read",
        call_id: "call-1",
        arguments: "{\"targetPath\":\"notes.txt\"}",
      }],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisions[0]?.kind, "toolCall");
  assert.equal(result.decisions[0]?.toolCall?.toolId, "code.read");
  assert.deepEqual(result.decisions[0]?.toolCall?.arguments, { targetPath: "notes.txt" });
});

test("interpretModelDecision converts malformed provider tool arguments into fail decision", () => {
  const result = interpretModelDecision({
    sessionId: "session-decision-malformed-tool",
    turnIndex: 1,
    providerToolMappings: [{ providerName: "praxis_tool_code_read", toolId: "code.read" }],
    raw: {
      output: [{
        type: "function_call",
        name: "praxis_tool_code_read",
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
            baseToolId: "code.read",
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
  assert.deepEqual(result.decisions[0]?.ephemeralProcedurePlan?.requiredBaseTools, ["code.read"]);
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
          family: "shellBase",
          group: "shellExecution",
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
    family: "shellBase",
    group: "shellExecution",
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
