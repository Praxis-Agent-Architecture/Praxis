import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationProviderHealthSmoke,
} from "../../examples/scripts/runtime_application_provider_health_smoke.js";

test("application provider health smoke retries retryable provider failures before fallback", async () => {
  const result = await runApplicationProviderHealthSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.retryThenFallback.status, "ok");
  assert.equal(result.retryThenFallback.providerCalls, 3);
  assert.deepEqual(result.retryThenFallback.callOrder, [
    "carrier.example.applicationProviderHealth.primary",
    "carrier.example.applicationProviderHealth.primary",
    "carrier.example.applicationProviderHealth.fallback",
  ]);
  assert.deepEqual(result.retryThenFallback.authSelections, [
    {
      providerProfileRef: "profile.example.applicationProviderHealth.primary",
      modelEntryRef: "model.example.applicationProviderHealth.primary",
    },
    {
      providerProfileRef: "profile.example.applicationProviderHealth.primary",
      modelEntryRef: "model.example.applicationProviderHealth.primary",
    },
    {
      providerProfileRef: "profile.example.applicationProviderHealth.fallback",
      modelEntryRef: "model.example.applicationProviderHealth.fallback",
    },
  ]);
  assert.equal(result.retryThenFallback.modelFailedEvents, 2);
  assert.equal(result.retryThenFallback.modelCompletedEvents, 1);
  assert.deepEqual(result.retryThenFallback.modelEventMetadata, [
    {
      phase: "failed",
      carrierId: "carrier.example.applicationProviderHealth.primary",
      endpointRef: "primary",
      fallbackFrom: undefined,
      retryAttempt: 0,
      maxRetries: 1,
      failureCode: "PROVIDER_RATE_LIMITED",
      failureRetryable: true,
      adaptiveSelection: false,
      requiredCapabilities: ["toolCalling"],
    },
    {
      phase: "failed",
      carrierId: "carrier.example.applicationProviderHealth.primary",
      endpointRef: "primary",
      fallbackFrom: undefined,
      retryAttempt: 1,
      maxRetries: 1,
      failureCode: "PROVIDER_RATE_LIMITED",
      failureRetryable: true,
      adaptiveSelection: false,
      requiredCapabilities: ["toolCalling"],
    },
    {
      phase: "completed",
      carrierId: "carrier.example.applicationProviderHealth.fallback",
      endpointRef: "fallback",
      fallbackFrom: "primary",
      retryAttempt: 0,
      maxRetries: 0,
      failureCode: undefined,
      failureRetryable: false,
      adaptiveSelection: false,
      requiredCapabilities: ["toolCalling"],
    },
  ]);
  assert.equal(result.retryThenFallback.view.status, "completed");
  assert.equal(result.retryThenFallback.view.finalOutput, "application provider health fallback ok");
  assert.equal(result.publicSafety.viewContainsSecret, false);
  assert.equal(result.publicSafety.eventsContainSecret, false);
});

test("application provider health smoke does not fallback for non-retryable provider failures", async () => {
  const result = await runApplicationProviderHealthSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.nonRetryableFailure.status, "ok");
  assert.equal(result.nonRetryableFailure.providerCalls, 1);
  assert.deepEqual(result.nonRetryableFailure.callOrder, [
    "carrier.example.applicationProviderHealth.primary",
  ]);
  assert.deepEqual(result.nonRetryableFailure.authSelections, [
    {
      providerProfileRef: "profile.example.applicationProviderHealth.primary",
      modelEntryRef: "model.example.applicationProviderHealth.primary",
    },
  ]);
  assert.equal(result.nonRetryableFailure.modelFailedEvents, 1);
  assert.equal(result.nonRetryableFailure.modelCompletedEvents, 0);
  assert.deepEqual(result.nonRetryableFailure.modelEventMetadata, [
    {
      phase: "failed",
      carrierId: "carrier.example.applicationProviderHealth.primary",
      endpointRef: "primary",
      fallbackFrom: undefined,
      retryAttempt: 0,
      maxRetries: 1,
      failureCode: "CALLER_FAILED",
      failureRetryable: false,
      adaptiveSelection: false,
      requiredCapabilities: ["toolCalling"],
    },
  ]);
  assert.equal(result.nonRetryableFailure.view.status, "failed");
});
