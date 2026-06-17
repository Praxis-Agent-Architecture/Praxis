import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationProviderCapabilitySmoke,
} from "../../examples/scripts/runtime_application_provider_capability_smoke.js";

test("application provider capability smoke selects a tool-capable modelFleet endpoint", async () => {
  const result = await runApplicationProviderCapabilitySmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.providerCalls, 1);
  assert.deepEqual(result.callOrder, [
    "carrier.example.applicationProviderCapability.toolCapable",
  ]);
  assert.deepEqual(result.authSelections, [
    {
      providerProfileRef: "profile.example.applicationProviderCapability.toolCapable",
      modelEntryRef: "model.example.applicationProviderCapability.toolCapable",
    },
  ]);
  assert.equal(result.capability.primarySkipped, true);
  assert.equal(result.capability.toolCapableSelected, true);
  assert.equal(result.capability.providerToolsExposed, true);
  assert.equal(result.capability.eventCapabilitySelection, true);
  assert.equal(result.capability.eventAdaptiveSelection, false);
  assert.deepEqual(result.capability.eventRequiredCapabilities, ["toolCalling"]);
  assert.equal(result.capability.modelCompletedEvents, 1);
  assert.equal(result.capability.modelFailedEvents, 0);
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application provider capability ok");
  assert.equal(result.view.usage?.source, "openai.responses.usage");
  assert.equal(result.publicSafety.viewContainsSecret, false);
  assert.equal(result.publicSafety.eventsContainSecret, false);
});
