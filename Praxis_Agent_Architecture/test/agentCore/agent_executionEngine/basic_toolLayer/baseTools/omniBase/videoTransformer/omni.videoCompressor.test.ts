import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  omniVideoCompressorDescriptor,
  planOmniVideoCompression,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoCompressor.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoCompressor.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoCompressor.md",
  testFileUrl: import.meta.url,
});

test("planOmniVideoCompression creates a guarded dry-run compression envelope", () => {
  const result = planOmniVideoCompression({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source-compressed.mp4",
      qualityPreset: "balanced",
      targetBitrateKbps: 1_800,
      maxOutputBytes: 20_000_000,
    },
    context: {
      invocationId: "compress-1",
      allowedVideoRoots: ["/workspace/video"],
      grantedPermissions: ["filesystem:read", "filesystem:write", "omni:video:transform"],
      requestedScopes: ["tool:omni:video:transform"],
      allowedScopes: ["tool:omni:video:transform"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(omniVideoCompressorDescriptor.defaultDryRun, true);
  assert.equal(result.output.kind, "agentCore.basicTool.omni.videoCompressor");
  assert.equal(result.output.compressionEnvelope.inputRead, false);
  assert.equal(result.output.compressionEnvelope.outputWritten, false);
  assert.equal(result.output.target.qualityPreset, "balanced");
  assert.equal(result.output.unsafeSideEffects, false);
});

test("planOmniVideoCompression rejects missing paths, invalid options, and real execution", () => {
  const missing = planOmniVideoCompression({
    target: { outputPath: "/workspace/video/out.mp4" },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_INPUT_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidBitrate = planOmniVideoCompression({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source.mp4",
      targetBitrateKbps: 0,
    },
  });
  assert.equal(invalidBitrate.ok, false);
  if (!invalidBitrate.ok) {
    assert.equal(invalidBitrate.error.code, "INVALID_TARGET_BITRATE");
  }

  const realExecution = planOmniVideoCompression({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source.mp4",
    },
    context: { dryRun: false },
  });
  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
