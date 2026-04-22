import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planAudioFormatConversion } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioFormatConversion.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioFormatConversion.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioFormatConversion.md",
  testFileUrl: import.meta.url,
});

test("planAudioFormatConversion creates a guarded dry-run conversion envelope", () => {
  const result = planAudioFormatConversion({
    target: {
      sourcePath: "/media/input/song.wav",
      outputPath: "/media/output/song.mp3",
      targetFormat: "mp3",
      sourceFormat: "wav",
      sampleRateHz: 44100,
      channels: 2,
      bitrateKbps: 192,
    },
    context: {
      invocationId: "format-1",
      allowedInputRoots: ["/media/input"],
      allowedOutputRoots: ["/media/output"],
      grantedPermissions: ["omni:audio:read", "omni:audio:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.omni.audioFormatConversion");
  assert.equal(result.output.operationPlan.action, "convert-audio-format");
  assert.deepEqual(result.output.commandPreview, [
    "omni-audio-format-conversion",
    "--input",
    "/media/input/song.wav",
    "--output",
    "/media/output/song.mp3",
    "--target-format",
    "mp3",
    "--source-format",
    "wav",
    "--sample-rate-hz",
    "44100",
    "--channels",
    "2",
    "--bitrate-kbps",
    "192",
  ]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.resultEnvelope.produced, false);
  assert.equal(result.audit[0]?.invocationId, "format-1");
});

test("planAudioFormatConversion rejects missing paths and unsupported formats", () => {
  const missing = planAudioFormatConversion();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SOURCE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const unsupported = planAudioFormatConversion({
    target: {
      sourcePath: "/media/input/song.wav",
      outputPath: "/media/output/song.xyz",
      targetFormat: "xyz" as "mp3",
    },
  });

  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.code, "UNSUPPORTED_AUDIO_FORMAT");
  }
});

test("planAudioFormatConversion blocks scope gaps, permission gaps, and real execution", () => {
  const scope = planAudioFormatConversion({
    target: {
      sourcePath: "/outside/song.wav",
      outputPath: "/media/output/song.mp3",
      targetFormat: "mp3",
    },
    context: { allowedInputRoots: ["/media/input"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const permission = planAudioFormatConversion({
    target: {
      sourcePath: "/media/input/song.wav",
      outputPath: "/media/output/song.mp3",
      targetFormat: "mp3",
    },
    context: { grantedPermissions: ["omni:audio:read"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planAudioFormatConversion({
    target: {
      sourcePath: "/media/input/song.wav",
      outputPath: "/media/output/song.mp3",
      targetFormat: "mp3",
    },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
