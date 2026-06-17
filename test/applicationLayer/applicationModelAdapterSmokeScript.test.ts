import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationModelAdapterSmoke,
} from "../../examples/scripts/runtime_application_model_adapter_smoke.js";

test("application modelAdapter smoke routes submitTurn through native provider adapters", async () => {
  const result = await runApplicationModelAdapterSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.routes.openaiResponses.providerCalls, 1);
  assert.equal(result.routes.openaiResponses.endpoint, "/v1/responses");
  assert.equal(result.routes.openaiResponses.url, "https://api.openai.test/v1/responses");
  assert.equal(result.routes.openaiResponses.finalOutput, "application modelAdapter responses ok");
  assert.equal(result.routes.openaiResponses.promptCacheKeyPresent, true);
  assert.equal(result.routes.openaiResponses.usage.source, "openai.responses.usage");
  assert.equal(result.routes.openaiResponses.usage.cachedInputTokens, 33);
  assert.equal(result.routes.openaiResponses.modelCompletedEvents, 1);
  assert.equal(result.routes.openaiResponses.applicationModelEventCarriesAdapterUsage, true);
  assert.equal(result.routes.openaiResponses.authHeaderRedacted, true);

  assert.equal(result.routes.openaiChatCompletions.providerCalls, 1);
  assert.equal(result.routes.openaiChatCompletions.endpoint, "/v1/chat/completions");
  assert.equal(result.routes.openaiChatCompletions.url, "https://api.openai.test/v1/chat/completions");
  assert.equal(result.routes.openaiChatCompletions.finalOutput, "application modelAdapter chat completions ok");
  assert.equal(result.routes.openaiChatCompletions.requestBodyHasMessages, true);
  assert.equal(result.routes.openaiChatCompletions.usage.source, "openai.chat_completions.usage");
  assert.equal(result.routes.openaiChatCompletions.usage.cachedInputTokens, 21);
  assert.equal(result.routes.openaiChatCompletions.modelCompletedEvents, 1);
  assert.equal(result.routes.openaiChatCompletions.applicationModelEventCarriesAdapterUsage, true);
  assert.equal(result.routes.openaiChatCompletions.authHeaderRedacted, true);
});
