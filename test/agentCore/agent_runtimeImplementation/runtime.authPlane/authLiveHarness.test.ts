import assert from "node:assert/strict";
import test from "node:test";

import {
  appendEndpoint,
  geminiGenerateContentEndpoint,
} from "../../../../examples/scripts/agentcore_auth_live_matrix.js";

test("auth live harness normalizes Gemini generateContent model resource paths", () => {
  assert.equal(
    geminiGenerateContentEndpoint("gemini-3.5-flash"),
    "/v1beta/models/gemini-3.5-flash:generateContent",
  );
  assert.equal(
    geminiGenerateContentEndpoint("models/gemini-3.5-flash"),
    "/v1beta/models/gemini-3.5-flash:generateContent",
  );
  assert.equal(
    appendEndpoint("https://generativelanguage.googleapis.com/v1beta", geminiGenerateContentEndpoint("models/gemini-3.5-flash")),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
  );
});
