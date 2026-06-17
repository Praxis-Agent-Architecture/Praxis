import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationProviderFleetSmoke,
} from "../../examples/scripts/runtime_application_provider_fleet_smoke.js";

test("application provider fleet smoke falls back through runtime model fleet", async () => {
  const result = await runApplicationProviderFleetSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.providerCalls, 2);
  assert.deepEqual(result.callOrder, [
    "carrier.example.applicationProviderFleet.primary",
    "carrier.example.applicationProviderFleet.fallback",
  ]);
  assert.deepEqual(result.authSelections, [
    {
      providerProfileRef: "profile.example.applicationProviderFleet.primary",
      modelEntryRef: "model.example.applicationProviderFleet.primary",
    },
    {
      providerProfileRef: "profile.example.applicationProviderFleet.fallback",
      modelEntryRef: "model.example.applicationProviderFleet.fallback",
    },
  ]);
  assert.equal(result.fallback.primaryFailed, true);
  assert.equal(result.fallback.fallbackSucceeded, true);
  assert.deepEqual(result.fallback.primaryFailureMetadata, {
    endpointRef: "primary",
    fallbackFrom: undefined,
    retryAttempt: 0,
    maxRetries: 0,
    failureCode: "PROVIDER_UNAVAILABLE",
    failureRetryable: true,
    requiredCapabilities: ["toolCalling"],
  });
  assert.deepEqual(result.fallback.fallbackSuccessMetadata, {
    endpointRef: "fallback",
    fallbackFrom: "primary",
    adaptiveSelection: false,
    retryAttempt: 0,
    maxRetries: 0,
    requiredCapabilities: ["toolCalling"],
  });
  assert.equal(result.fallback.modelFailedEvents, 1);
  assert.equal(result.fallback.modelCompletedEvents, 1);
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application provider fleet fallback ok");
  assert.equal(result.view.usage?.source, "openai.responses.usage");
  assert.equal(result.view.usage?.cachedInputTokens, 29);
  assert.equal(result.publicSafety.viewContainsSecret, false);
  assert.equal(result.publicSafety.eventsContainSecret, false);
});
