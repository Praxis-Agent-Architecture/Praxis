import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planAudioLyricsGeneration } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioLyricsGeneration.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioLyricsGeneration.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioLyricsGeneration.md",
  testFileUrl: import.meta.url,
});

test("planAudioLyricsGeneration creates a guarded dry-run lyrics envelope", () => {
  const result = planAudioLyricsGeneration({
    target: {
      brief: "写一首关于夜间调试的原创歌词",
      language: "zh-CN",
      styleHint: "quiet pop",
      sections: ["verse", "chorus", "bridge"],
      lineCount: 24,
      audioReferencePath: "/media/input/demo.wav",
      outputTextPath: "/media/output/lyrics.txt",
    },
    context: {
      invocationId: "lyrics-1",
      allowedInputRoots: ["/media/input"],
      allowedOutputRoots: ["/media/output"],
      grantedPermissions: ["omni:audio:generate", "provider:audio:invoke", "omni:audio:write"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.omni.audioLyricsGeneration");
  assert.equal(result.output.operationPlan.action, "generate-lyrics");
  assert.deepEqual(result.output.operationPlan.sections, ["verse", "chorus", "bridge"]);
  assert.equal(result.output.operationPlan.usesAudioReference, true);
  assert.equal(result.output.promptEnvelope.avoidCopyrightedLyrics, true);
  assert.equal(result.output.resultEnvelope.lyricsGenerated, false);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "lyrics-1");
});

test("planAudioLyricsGeneration rejects empty briefs and invalid line counts", () => {
  const missing = planAudioLyricsGeneration();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_LYRIC_BRIEF");
  }

  const invalidLineCount = planAudioLyricsGeneration({
    target: {
      brief: "原创歌词",
      lineCount: 0,
    },
  });

  assert.equal(invalidLineCount.ok, false);
  if (!invalidLineCount.ok) {
    assert.equal(invalidLineCount.error.code, "INVALID_LINE_COUNT");
  }
});

test("planAudioLyricsGeneration blocks scoped references, permission gaps, and real provider execution", () => {
  const scope = planAudioLyricsGeneration({
    target: {
      brief: "原创歌词",
      audioReferencePath: "/outside/demo.wav",
    },
    context: { allowedInputRoots: ["/media/input"] },
  });

  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
  }

  const permission = planAudioLyricsGeneration({
    target: {
      brief: "原创歌词",
      outputTextPath: "/media/output/lyrics.txt",
    },
    context: { grantedPermissions: ["omni:audio:generate", "provider:audio:invoke"] },
  });

  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
  }

  const real = planAudioLyricsGeneration({
    target: { brief: "原创歌词" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
