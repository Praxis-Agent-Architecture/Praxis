import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planGenerateAudio } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.generateAudio.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.generateAudio.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.generateAudio.md",
  testFileUrl: import.meta.url,
});

test("planGenerateAudio creates a guarded dry-run generation envelope", () => {
  const result = planGenerateAudio({
    target: {
      prompt: "Generate a short calm notification sound.",
      outputPath: "/media/output/notice.wav",
      targetFormat: "wav",
      voiceHint: "warm",
      durationSeconds: 3.5,
      sampleRateHz: 48000,
      seed: 42,
      safetyMode: "standard",
    },
    context: {
      invocationId: "generate-1",
      allowedOutputRoots: ["/media/output"],
      grantedPermissions: ["omni:audio:generate", "provider:audio:invoke", "omni:audio:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.omni.generateAudio");
  assert.equal(result.output.operationPlan.action, "generate-audio");
  assert.equal(result.output.operationPlan.providerInvocationBlocked, true);
  assert.equal(result.output.promptEnvelope.durationSeconds, 3.5);
  assert.equal(result.output.promptEnvelope.safetyMode, "standard");
  assert.equal(result.output.resultEnvelope.audioGenerated, false);
  assert.equal(result.audit[0]?.invocationId, "generate-1");
});

test("planGenerateAudio rejects empty prompts, missing outputs, and invalid generation constraints", () => {
  const missingPrompt = planGenerateAudio();

  assert.equal(missingPrompt.ok, false);
  if (!missingPrompt.ok) {
    assert.equal(missingPrompt.error.code, "MISSING_PROMPT");
  }

  const missingOutput = planGenerateAudio({
    target: { prompt: "Generate a sound", targetFormat: "wav" },
  });

  assert.equal(missingOutput.ok, false);
  if (!missingOutput.ok) {
    assert.equal(missingOutput.error.code, "MISSING_OUTPUT_PATH");
  }

  const invalidDuration = planGenerateAudio({
    target: {
      prompt: "Generate a sound",
      outputPath: "/media/output/notice.wav",
      targetFormat: "wav",
      durationSeconds: 1000,
    },
  });

  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) {
    assert.equal(invalidDuration.error.code, "INVALID_DURATION");
  }
});

test("planGenerateAudio blocks output scope gaps, permission gaps, and real provider execution", () => {
  const scope = planGenerateAudio({
    target: {
      prompt: "Generate a sound",
      outputPath: "/outside/notice.wav",
      targetFormat: "wav",
    },
    context: { allowedOutputRoots: ["/media/output"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const permission = planGenerateAudio({
    target: {
      prompt: "Generate a sound",
      outputPath: "/media/output/notice.wav",
      targetFormat: "wav",
    },
    context: { grantedPermissions: ["omni:audio:generate", "omni:audio:write"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planGenerateAudio({
    target: {
      prompt: "Generate a sound",
      outputPath: "/media/output/notice.wav",
      targetFormat: "wav",
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
