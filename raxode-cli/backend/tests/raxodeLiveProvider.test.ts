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
