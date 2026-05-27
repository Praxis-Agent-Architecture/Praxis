import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDirectTuiContextUsedTokens,
  resolveDirectTuiToolPreviewSummaryLines,
} from "./direct-tui-presentation.js";

test("context usage prefers session context waterline over last provider input", () => {
  assert.equal(
    resolveDirectTuiContextUsedTokens({
      snapshot: {
        sessionContextTokens: 42_000,
        lastRequestInputTokens: 17_000,
        promptTokens: 18_000,
      },
      draftContextTokens: 500,
    }),
    42_500,
  );
});

test("context usage falls back to provider input when session waterline is unavailable", () => {
  assert.equal(
    resolveDirectTuiContextUsedTokens({
      snapshot: {
        lastRequestInputTokens: 17_000,
        promptTokens: 18_000,
      },
    }),
    17_000,
  );
});

test("agent tool preview summarizes wait calls", () => {
  assert.deepEqual(
    resolveDirectTuiToolPreviewSummaryLines({
      title: "Agent",
      phase: "started",
      providerToolName: "praxis_tool_agent_wait",
      capabilityKey: "agent.wait",
      argumentsPreview: JSON.stringify({
        messageId: "agent-message.123",
        timeoutMs: 120_000,
      }),
    }),
    [
      "Agent composing",
      "Waiting for agent-message.123 (120s timeout)",
    ],
  );
});

test("agent tool preview summarizes spawn calls", () => {
  assert.deepEqual(
    resolveDirectTuiToolPreviewSummaryLines({
      title: "Agent",
      phase: "started",
      providerToolName: "praxis_tool_agent_spawn",
      capabilityKey: "agent.spawn",
      argumentsPreview: JSON.stringify({
        task_name: "worker_a",
        agent_type: "worker",
        message: "Inspect the backend event bridge and report the bottleneck.",
      }),
    }),
    [
      "Agent composing",
      "Spawning worker_a for Inspect the backend event bridge and report the bottleneck.",
    ],
  );
});

test("file read preview uses one concise read line", () => {
  assert.deepEqual(
    resolveDirectTuiToolPreviewSummaryLines({
      title: "File",
      phase: "started",
      providerToolName: "praxis_tool_file_read",
      capabilityKey: "file.read",
      argumentsPreview: JSON.stringify({ path: "README.md" }),
    }),
    [
      "File composing",
      "Read README.md",
    ],
  );
});
