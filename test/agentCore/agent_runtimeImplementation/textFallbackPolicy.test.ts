import assert from "node:assert/strict";
import test from "node:test";
import { decideTextToolFallback } from "../../../src/agentCore_runtimeImplementation/runtime.execEngine/textFallbackPolicy.js";

test("text fallback does not run after provider-native tool calls", () => {
  const decision = decideTextToolFallback({
    runOk: true,
    providerToolsEnabled: true,
    nativeToolCallCount: 1,
    explicitFallbackRequestCount: 1,
    inferredFallbackRequestCount: 1,
  });

  assert.equal(decision.shouldRun, false);
  assert.equal(decision.source, "disabled");
  assert.equal(decision.modelDialogueReadyCredit, false);
  assert.match(decision.reason, /native tool calls/u);
});

test("text fallback runs as degraded debug path when provider tools are disabled", () => {
  const decision = decideTextToolFallback({
    runOk: true,
    providerToolsEnabled: false,
    nativeToolCallCount: 0,
    explicitFallbackRequestCount: 0,
    inferredFallbackRequestCount: 1,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.source, "provider-tools-disabled");
  assert.equal(decision.degraded, true);
  assert.equal(decision.modelDialogueReadyCredit, false);
});

test("text fallback may run on explicit model fallback request when provider returned no tool call", () => {
  const decision = decideTextToolFallback({
    runOk: true,
    providerToolsEnabled: true,
    nativeToolCallCount: 0,
    explicitFallbackRequestCount: 1,
    inferredFallbackRequestCount: 0,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.source, "provider-returned-no-tool-call");
  assert.equal(decision.degraded, true);
  assert.equal(decision.modelDialogueReadyCredit, false);
});

test("text fallback does not infer from user text while provider tools are enabled", () => {
  const decision = decideTextToolFallback({
    runOk: true,
    providerToolsEnabled: true,
    nativeToolCallCount: 0,
    explicitFallbackRequestCount: 0,
    inferredFallbackRequestCount: 1,
  });

  assert.equal(decision.shouldRun, false);
  assert.equal(decision.source, "disabled");
  assert.match(decision.reason, /user-text inference/u);
});

test("text fallback does not mask runtime failures", () => {
  const decision = decideTextToolFallback({
    runOk: false,
    providerToolsEnabled: false,
    nativeToolCallCount: 0,
    explicitFallbackRequestCount: 1,
    inferredFallbackRequestCount: 1,
  });

  assert.equal(decision.shouldRun, false);
  assert.equal(decision.source, "disabled");
  assert.match(decision.reason, /must not mask/u);
});
