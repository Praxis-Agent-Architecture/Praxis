import assert from "node:assert/strict";
import test from "node:test";
import { runTool } from "../../../../../../scripts/agentCore_Agent_Test/agentcore_tool_lab.js";

const omniTools = [
  "omni.audioCompressor",
  "omni.audioFormatConversion",
  "omni.audioLyricsGeneration",
  "omni.generateAudio",
  "omni.listenAudio",
  "omni.generateImage",
  "omni.imageCompressor",
  "omni.imageFormatConversion",
  "omni.viewImage",
  "omni.generateVideo",
  "omni.videoCompressor",
  "omni.videoFormatConversion",
  "omni.videoSubtitleGeneration",
  "omni.viewVideo",
] as const;

test("agentCore tool lab can invoke every mounted omniBase tool through the registry path", async () => {
  for (const tool of omniTools) {
    const result = await runTool(tool, {});
    assert.equal(result.ok, true, tool);
    if (!result.ok) continue;

    const output = result.output as {
      dispatch?: string;
      providerCalled?: boolean;
      runtimeEntry?: { port?: string };
      operationEnvelope?: { artifactId?: string; materialized?: boolean };
      viewEnvelope?: { artifactId?: string };
    };

    assert.equal(output.dispatch, "runtime-omni", tool);
    assert.equal(output.providerCalled, true, tool);
    assert.equal(output.runtimeEntry?.port, "BaseToolExecutorPort.omni.transformMedia", tool);
    assert.ok(output.operationEnvelope?.artifactId ?? output.viewEnvelope?.artifactId, tool);
  }
});

test("agentCore tool lab exposes omniBase tools in the visible catalog", async () => {
  const result = await runTool("tool.catalog", { query: "omni.", limit: 40 });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const output = result.output as { tools?: readonly { toolId?: string }[] };
  const ids = new Set((output.tools ?? []).map((tool) => tool.toolId));
  for (const tool of omniTools) {
    assert.equal(ids.has(tool), true, tool);
  }
});

test("agentCore tool lab normalizes natural-language omni aliases before handler invocation", async () => {
  const conversion = await runTool("omni.imageFormatConversion", {
    target: { input: "/workspace/media/source.png", output: "/workspace/output/source.jpg", format: "jpg" },
  });
  assert.equal(conversion.ok, true);
  if (!conversion.ok) return;
  const conversionOutput = conversion.output as { target?: { inputPath?: string; outputPath?: string; targetFormat?: string } };
  assert.equal(conversionOutput.target?.inputPath, "/workspace/media/source.png");
  assert.equal(conversionOutput.target?.outputPath, "/workspace/output/source.jpg");
  assert.equal(conversionOutput.target?.targetFormat, "jpg");

  const generation = await runTool("omni.generateAudio", {
    target: { path: "/workspace/output/chime.wav", format: "wav" },
    prompt: "Generate a two second chime.",
    duration: 2,
  });
  assert.equal(generation.ok, true);
  if (!generation.ok) return;
  const generationOutput = generation.output as { target?: { outputPath?: string; targetFormat?: string; durationSeconds?: number } };
  assert.equal(generationOutput.target?.outputPath, "/workspace/output/chime.wav");
  assert.equal(generationOutput.target?.targetFormat, "wav");
  assert.equal(generationOutput.target?.durationSeconds, 2);
});
