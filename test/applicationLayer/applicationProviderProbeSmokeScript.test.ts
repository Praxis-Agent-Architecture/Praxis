import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationProviderProbeSmoke,
} from "../../examples/scripts/runtime_application_provider_probe_smoke.js";

test("application provider probe smoke preselects a declared available fallback", async () => {
  const result = await runApplicationProviderProbeSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.providerCalls, 1);
  assert.deepEqual(result.callOrder, [
    "carrier.example.applicationProviderProbe.fallback",
  ]);
  assert.deepEqual(result.authSelections, [
    {
      providerProfileRef: "profile.example.applicationProviderProbe.fallback",
      modelEntryRef: "model.example.applicationProviderProbe.fallback",
    },
  ]);
  assert.equal(result.probe.primarySkipped, true);
  assert.equal(result.probe.fallbackPreselected, true);
  assert.equal(result.probe.eventCapabilitySelection, false);
  assert.equal(result.probe.eventAdaptiveSelection, true);
  assert.deepEqual(result.probe.eventRequiredCapabilities, ["toolCalling"]);
  assert.equal(result.probe.primaryFailedEvents, 0);
  assert.equal(result.probe.modelCompletedEvents, 1);
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application provider probe fallback ok");
  assert.equal(result.view.usage?.source, "openai.responses.usage");
  assert.equal(result.publicSafety.viewContainsSecret, false);
  assert.equal(result.publicSafety.eventsContainSecret, false);
});
