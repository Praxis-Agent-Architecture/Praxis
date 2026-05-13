import assert from "node:assert/strict";
import test from "node:test";

import { extractAndPublishSseDeltas, readSseTextDelta } from "../authentication/liveProvider.js";

test("raxode live provider extracts output text deltas from SSE payloads", () => {
  assert.equal(readSseTextDelta(JSON.stringify({
    type: "response.output_text.delta",
    delta: "OK",
  })), "OK");
});

test("raxode live provider extracts reasoning summary deltas from SSE payloads", () => {
  assert.equal(readSseTextDelta(JSON.stringify({
    type: "response.reasoning_summary_text.delta",
    delta: "Thinking briefly",
  })), "Thinking briefly");
});

test("raxode live provider parses SSE frames even when callers detect stream by body shape", () => {
  const deltas: string[] = [];
  const remainder = extractAndPublishSseDeltas([
    "event: response.created",
    "data: {\"type\":\"response.created\"}",
    "",
    "event: response.output_text.delta",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"O\"}",
    "",
    "event: response.output_text.delta",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"K\"}",
    "",
    "",
  ].join("\n"), (delta) => deltas.push(delta));
  assert.equal(remainder, "");
  assert.deepEqual(deltas, ["O", "K"]);
});

test("raxode live provider extracts tool call preview events from SSE frames", () => {
  const events: Array<Record<string, unknown>> = [];
  const remainder = extractAndPublishSseDeltas([
    "event: response.output_item.added",
    "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"name\":\"praxis_tool_shell_commandExecution\",\"call_id\":\"call_shell_1\",\"arguments\":\"\"}}",
    "",
    "event: response.function_call_arguments.delta",
    "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"output_index\":0,\"delta\":\"{\\\"target\\\":{\\\"command\\\":\\\"npm run check\"}",
    "",
    "event: response.function_call_arguments.delta",
    "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"output_index\":0,\"delta\":\" && curl http://localhost:3000\\\"}}\"}",
    "",
    "event: response.function_call_arguments.done",
    "data: {\"type\":\"response.function_call_arguments.done\",\"item_id\":\"fc_1\",\"output_index\":0,\"arguments\":\"{\\\"target\\\":{\\\"command\\\":\\\"npm run check && curl http://localhost:3000\\\"}}\"}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>));

  assert.equal(remainder, "");
  assert.deepEqual(events.map((event) => event.phase), ["started", "delta", "delta", "done"]);
  assert.equal(events[0]?.providerToolName, "praxis_tool_shell_commandExecution");
  assert.equal(events[0]?.callId, "call_shell_1");
  assert.match(String(events[1]?.argumentsDelta), /npm run check/u);
  assert.match(String(events[2]?.argumentsDelta), /curl http:\/\/localhost:3000/u);
  assert.match(String(events[3]?.arguments), /npm run check && curl/u);
});

test("raxode live provider keeps tool preview identity across split SSE reads", () => {
  const events: Array<Record<string, unknown>> = [];
  const previewState = new Map();

  assert.equal(extractAndPublishSseDeltas([
    "event: response.output_item.added",
    "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"name\":\"praxis_tool_code_scan\",\"call_id\":\"call_code_1\",\"arguments\":\"\"}}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>), previewState), "");

  assert.equal(extractAndPublishSseDeltas([
    "event: response.function_call_arguments.delta",
    "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"output_index\":0,\"delta\":\"{\\\"directoryPath\\\":\\\".\\\"}\"}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>), previewState), "");

  assert.deepEqual(events.map((event) => event.phase), ["started", "delta"]);
  assert.equal(events[1]?.callId, "call_code_1");
  assert.equal(events[1]?.providerToolName, "praxis_tool_code_scan");
});
