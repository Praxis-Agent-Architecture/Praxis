import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationAuthProfileSmoke,
} from "../../examples/scripts/runtime_application_auth_profile_smoke.js";

test("application auth profile smoke lets manifest refs resolve through runtime authPlane", async () => {
  const result = await runApplicationAuthProfileSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.providerCalls, 1);
  assert.deepEqual(result.authSelections, [{
    providerProfileRef: "profile.example.applicationAuthProfile.responses",
    modelEntryRef: "model.example.applicationAuthProfile.gpt-5.5",
  }]);
  assert.equal(result.providerRequest.endpoint, "/v1/responses");
  assert.equal(result.providerRequest.url, "https://gateway.auth-profile.test/v1/responses");
  assert.equal(result.providerRequest.authorizationHeaderPresent, true);
  assert.equal(result.providerRequest.privateAuthMaterialReachedProviderCaller, true);
  assert.equal(result.providerRequest.promptCacheKeyPresent, true);
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application auth profile handoff ok");
  assert.equal(result.view.usage?.source, "openai.responses.usage");
  assert.equal(result.view.usage?.cachedInputTokens, 17);
  assert.equal(result.publicSafety.viewContainsSecret, false);
  assert.equal(result.publicSafety.eventsContainSecret, false);
  assert.equal(result.publicSafety.resolverResultContainsSecret, false);
});
