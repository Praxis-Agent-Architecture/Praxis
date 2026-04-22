import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  listenAudioDescriptor,
  planListenAudio,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.listenAudio.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.listenAudio.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.listenAudio.md",
  testFileUrl: import.meta.url,
});

test("planListenAudio creates a governed dry-run audio listening plan", () => {
  const result = planListenAudio({
    runtimeId: "runtime-1",
    audioRef: "memory://clip.wav",
    observationMode: "sound-event-summary",
    localeHint: "zh-CN",
    maxDurationSeconds: 30,
    requestedScopes: ["tool:omni:audio"],
    allowedScopes: ["tool:omni:audio"],
  });

  assert.equal(result.ok, true);
  assert.equal(listenAudioDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "omni.listenAudio");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.wouldAnalyzeAudio, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.requiredPermission, "omni:audio:listen");
  assert.deepEqual(result.plan.acceptedScopes, ["tool:omni:audio"]);
});

test("planListenAudio rejects missing input and real audio analysis side effects", () => {
  const missing = planListenAudio();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_AUDIO_REF");
  assert.equal(missing.error.boundary, "input");

  const realSideEffect = planListenAudio({
    audioRef: "memory://clip.wav",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
