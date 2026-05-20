import assert from "node:assert/strict";
import test from "node:test";

import { createObservationMaterial } from "./observationIntegrator.js";

test("createObservationMaterial folds large payloads into artifact references", () => {
  const marker = "RAXODE_LARGE_TOOL_PAYLOAD_";
  const observation = createObservationMaterial({
    observationId: "observation.large",
    source: "baseTool",
    status: "completed",
    title: "BaseTool shell.commandExecution",
    summary: "tool invocation completed",
    payload: { stdout: marker.repeat(4000) },
  });

  assert.ok(observation.artifactRef);
  assert.match(observation.material.text, /payloadArtifact/u);
  assert.match(observation.material.text, /payloadBytes/u);
  assert.equal(observation.material.text.includes(marker.repeat(20)), false);
});
