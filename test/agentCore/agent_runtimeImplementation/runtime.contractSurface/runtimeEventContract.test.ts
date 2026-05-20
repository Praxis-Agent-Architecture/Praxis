import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeEventContract } from "../../../../src/runtimeImplementation/runtime.contractSurface/runtimeEventContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.contractSurface/runtimeEventContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeEventContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeEventContract defines an observable event envelope and subscriber scope", () => {
  const result = defineRuntimeEventContract({
    runtimeId: " runtime:alpha ",
    contractId: " contract:event ",
    eventType: " runtime.output ",
    producerSurface: "invocationMethod",
    visibility: "application",
    payloadShape: [" text ", "traceId", "text"],
    allowedSubscribers: [" app:writer ", "official:cmp"],
    requestedSubscriber: "app:writer",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.eventContract.runtimeId, "runtime:alpha");
  assert.equal(result.eventContract.contractId, "contract:event");
  assert.equal(result.eventContract.eventType, "runtime.output");
  assert.deepEqual(result.eventContract.payloadShape, ["text", "traceId"]);
  assert.deepEqual(result.eventContract.allowedSubscribers, ["app:writer", "official:cmp"]);
  assert.equal(result.eventContract.unsafeSideEffects, false);
  assert.equal(
    result.eventContract.accepts({
      runtimeId: "runtime:alpha",
      contractId: "contract:event",
      type: "runtime.output",
    }),
    true,
  );
  assert.equal(
    result.eventContract.accepts({
      runtimeId: "runtime:alpha",
      contractId: "contract:event",
      type: "runtime.debug",
    }),
    false,
  );
});

test("runtimeEventContract rejects missing event type, denied subscriber, and unready runtime", () => {
  const missingType = defineRuntimeEventContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:event",
    eventType: "",
  });

  assert.equal(missingType.ok, false);
  if (missingType.ok) {
    return;
  }

  assert.equal(missingType.error.code, "MISSING_EVENT_TYPE");
  assert.equal(missingType.error.boundary, "input");

  const deniedSubscriber = defineRuntimeEventContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:event",
    eventType: "runtime.output",
    allowedSubscribers: ["app:writer"],
    requestedSubscriber: "official:tap",
  });

  assert.equal(deniedSubscriber.ok, false);
  if (deniedSubscriber.ok) {
    return;
  }

  assert.equal(deniedSubscriber.error.code, "EVENT_SCOPE_DENIED");
  assert.equal(deniedSubscriber.error.boundary, "scope");

  const unready = defineRuntimeEventContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:event",
    eventType: "runtime.output",
    runtimeReady: false,
  });

  assert.equal(unready.ok, false);
  if (unready.ok) {
    return;
  }

  assert.equal(unready.error.code, "RUNTIME_NOT_READY");
  assert.equal(unready.error.boundary, "runtime-state");
});
