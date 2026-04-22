import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  omniGenerateVideoDescriptor,
  planOmniGenerateVideo,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.generateVideo.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.generateVideo.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.generateVideo.md",
  testFileUrl: import.meta.url,
});

test("planOmniGenerateVideo creates a provider-safe dry-run generation envelope", () => {
  const result = planOmniGenerateVideo({
    target: {
      prompt: "A calm product demo clip",
      outputPath: "/workspace/out/demo.mp4",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      modelHint: "runtime-selected-video-provider",
      seed: 42,
    },
    context: {
      invocationId: "video-gen-1",
      allowedOutputRoots: ["/workspace/out"],
      grantedPermissions: ["provider:invoke", "filesystem:write", "omni:video:generate"],
      requestedScopes: ["tool:omni:video:generate"],
      allowedScopes: ["tool:omni:video:generate"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(omniGenerateVideoDescriptor.defaultDryRun, true);
  assert.equal(result.output.kind, "agentCore.basicTool.omni.generateVideo");
  assert.equal(result.output.target.outputPath, "/workspace/out/demo.mp4");
  assert.equal(result.output.generationEnvelope.providerInvoked, false);
  assert.equal(result.output.generationEnvelope.outputWritten, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.metadata.promptLength, "A calm product demo clip".length);
});

test("planOmniGenerateVideo rejects empty prompts, invalid dimensions, and real execution", () => {
  const missingPrompt = planOmniGenerateVideo();
  assert.equal(missingPrompt.ok, false);
  if (!missingPrompt.ok) {
    assert.equal(missingPrompt.error.code, "MISSING_PROMPT");
    assert.equal(missingPrompt.error.boundary, "input");
  }

  const invalidDuration = planOmniGenerateVideo({
    target: {
      prompt: "clip",
      durationSeconds: -1,
    },
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) {
    assert.equal(invalidDuration.error.code, "INVALID_DURATION");
  }

  const realExecution = planOmniGenerateVideo({
    target: {
      prompt: "clip",
      outputPath: "/workspace/out/demo.mp4",
    },
    context: { dryRun: false },
  });
  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
