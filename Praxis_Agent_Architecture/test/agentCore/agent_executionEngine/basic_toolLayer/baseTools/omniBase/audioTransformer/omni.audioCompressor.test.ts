import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planAudioCompression } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioCompressor.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioCompressor.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioCompressor.md",
  testFileUrl: import.meta.url,
});

test("planAudioCompression creates a guarded dry-run compression envelope", () => {
  const result = planAudioCompression({
    target: {
      sourcePath: "/media/input/raw.wav",
      outputPath: "/media/output/compressed.ogg",
      profile: "music",
      codec: "opus",
      bitrateKbps: 128,
      quality: 0.8,
      maxSizeBytes: 5000000,
    },
    context: {
      invocationId: "compress-1",
      allowedInputRoots: ["/media/input"],
      allowedOutputRoots: ["/media/output"],
      grantedPermissions: ["omni:audio:read", "omni:audio:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.omni.audioCompressor");
  assert.equal(result.output.operationPlan.action, "compress-audio");
  assert.equal(result.output.operationPlan.profile, "music");
  assert.deepEqual(result.output.commandPreview, [
    "omni-audio-compressor",
    "--input",
    "/media/input/raw.wav",
    "--output",
    "/media/output/compressed.ogg",
    "--profile",
    "music",
    "--codec",
    "opus",
    "--bitrate-kbps",
    "128",
    "--quality",
    "0.8",
    "--max-size-bytes",
    "5000000",
  ]);
  assert.equal(result.output.resultEnvelope.compressed, false);
  assert.equal(result.audit[0]?.invocationId, "compress-1");
});

test("planAudioCompression rejects missing inputs and invalid compression constraints", () => {
  const missing = planAudioCompression();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SOURCE_PATH");
  }

  const invalidBitrate = planAudioCompression({
    target: {
      sourcePath: "/media/input/raw.wav",
      outputPath: "/media/output/compressed.ogg",
      bitrateKbps: 0,
    },
  });

  assert.equal(invalidBitrate.ok, false);
  if (!invalidBitrate.ok) {
    assert.equal(invalidBitrate.error.code, "INVALID_BITRATE");
  }

  const invalidQuality = planAudioCompression({
    target: {
      sourcePath: "/media/input/raw.wav",
      outputPath: "/media/output/compressed.ogg",
      quality: 2,
    },
  });

  assert.equal(invalidQuality.ok, false);
  if (!invalidQuality.ok) {
    assert.equal(invalidQuality.error.code, "INVALID_QUALITY");
  }
});

test("planAudioCompression blocks scope gaps, permission gaps, and real execution", () => {
  const scope = planAudioCompression({
    target: {
      sourcePath: "/media/input/raw.wav",
      outputPath: "/outside/compressed.ogg",
    },
    context: { allowedOutputRoots: ["/media/output"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const permission = planAudioCompression({
    target: {
      sourcePath: "/media/input/raw.wav",
      outputPath: "/media/output/compressed.ogg",
    },
    context: { grantedPermissions: ["omni:audio:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planAudioCompression({
    target: {
      sourcePath: "/media/input/raw.wav",
      outputPath: "/media/output/compressed.ogg",
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
