import { defineAgentCoreContractTest } from '../../../../agentCoreContractTestHelper.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { BaseToolExecutorPort } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js';
import { createBaseToolRegistry } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js';
import { planAudioCompression, omniAudioCompressionDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioCompressor.js';
import { planAudioFormatConversion, omniAudioFormatConversionDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioFormatConversion.js';
import { planAudioLyricsGeneration, omniAudioLyricsGenerationDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.audioLyricsGeneration.js';
import { planGenerateAudio, omniGenerateAudioDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.generateAudio.js';
import { planListenAudio, omniListenAudioDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/audioTransformer/omni.listenAudio.js';
import { planGenerateImage, omniGenerateImageDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.generateImage.js';
import { planImageCompressor, omniImageCompressorDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageCompressor.js';
import { planImageFormatConversion, omniImageFormatConversionDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.imageFormatConversion.js';
import { planGenerateVideo, omniGenerateVideoDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.generateVideo.js';
import { planVideoCompressor, omniVideoCompressorDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoCompressor.js';
import { planVideoFormatConversion, omniVideoFormatConversionDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoFormatConversion.js';
import { planVideoSubtitleGeneration, omniVideoSubtitleGenerationDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoSubtitleGeneration.js';
import { planViewVideo, omniViewVideoDescriptor } from '../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.viewVideo.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../../../../..');

const tools = [
  {
    "id": "omni.audioCompressor",
    "group": "audioTransformer",
    "alias": "AudioCompression",
    "input": true,
    "output": true,
    "prompt": false,
    "descriptor": "omniAudioCompressionDescriptor"
  },
  {
    "id": "omni.audioFormatConversion",
    "group": "audioTransformer",
    "alias": "AudioFormatConversion",
    "input": true,
    "output": true,
    "prompt": false,
    "descriptor": "omniAudioFormatConversionDescriptor"
  },
  {
    "id": "omni.audioLyricsGeneration",
    "group": "audioTransformer",
    "alias": "AudioLyricsGeneration",
    "input": true,
    "output": false,
    "prompt": false,
    "descriptor": "omniAudioLyricsGenerationDescriptor"
  },
  {
    "id": "omni.generateAudio",
    "group": "audioTransformer",
    "alias": "GenerateAudio",
    "input": false,
    "output": true,
    "prompt": true,
    "descriptor": "omniGenerateAudioDescriptor"
  },
  {
    "id": "omni.listenAudio",
    "group": "audioTransformer",
    "alias": "ListenAudio",
    "input": true,
    "output": false,
    "prompt": false,
    "descriptor": "omniListenAudioDescriptor"
  },
  {
    "id": "omni.generateImage",
    "group": "imageTransformer",
    "alias": "GenerateImage",
    "input": false,
    "output": true,
    "prompt": true,
    "descriptor": "omniGenerateImageDescriptor"
  },
  {
    "id": "omni.imageCompressor",
    "group": "imageTransformer",
    "alias": "ImageCompressor",
    "input": true,
    "output": true,
    "prompt": false,
    "descriptor": "omniImageCompressorDescriptor"
  },
  {
    "id": "omni.imageFormatConversion",
    "group": "imageTransformer",
    "alias": "ImageFormatConversion",
    "input": true,
    "output": true,
    "prompt": false,
    "descriptor": "omniImageFormatConversionDescriptor"
  },
  {
    "id": "omni.generateVideo",
    "group": "videoTransformer",
    "alias": "GenerateVideo",
    "input": false,
    "output": true,
    "prompt": true,
    "descriptor": "omniGenerateVideoDescriptor"
  },
  {
    "id": "omni.videoCompressor",
    "group": "videoTransformer",
    "alias": "VideoCompressor",
    "input": true,
    "output": true,
    "prompt": false,
    "descriptor": "omniVideoCompressorDescriptor"
  },
  {
    "id": "omni.videoFormatConversion",
    "group": "videoTransformer",
    "alias": "VideoFormatConversion",
    "input": true,
    "output": true,
    "prompt": false,
    "descriptor": "omniVideoFormatConversionDescriptor"
  },
  {
    "id": "omni.videoSubtitleGeneration",
    "group": "videoTransformer",
    "alias": "VideoSubtitleGeneration",
    "input": true,
    "output": false,
    "prompt": false,
    "descriptor": "omniVideoSubtitleGenerationDescriptor"
  },
  {
    "id": "omni.viewVideo",
    "group": "videoTransformer",
    "alias": "ViewVideo",
    "input": true,
    "output": false,
    "prompt": false,
    "descriptor": "omniViewVideoDescriptor"
  }
] as const;

const planners = {
  'omni.audioCompressor': planAudioCompression,
  'omni.audioFormatConversion': planAudioFormatConversion,
  'omni.audioLyricsGeneration': planAudioLyricsGeneration,
  'omni.generateAudio': planGenerateAudio,
  'omni.listenAudio': planListenAudio,
  'omni.generateImage': planGenerateImage,
  'omni.imageCompressor': planImageCompressor,
  'omni.imageFormatConversion': planImageFormatConversion,
  'omni.generateVideo': planGenerateVideo,
  'omni.videoCompressor': planVideoCompressor,
  'omni.videoFormatConversion': planVideoFormatConversion,
  'omni.videoSubtitleGeneration': planVideoSubtitleGeneration,
  'omni.viewVideo': planViewVideo,
} as const;

const descriptors = {
  'omni.audioCompressor': omniAudioCompressionDescriptor,
  'omni.audioFormatConversion': omniAudioFormatConversionDescriptor,
  'omni.audioLyricsGeneration': omniAudioLyricsGenerationDescriptor,
  'omni.generateAudio': omniGenerateAudioDescriptor,
  'omni.listenAudio': omniListenAudioDescriptor,
  'omni.generateImage': omniGenerateImageDescriptor,
  'omni.imageCompressor': omniImageCompressorDescriptor,
  'omni.imageFormatConversion': omniImageFormatConversionDescriptor,
  'omni.generateVideo': omniGenerateVideoDescriptor,
  'omni.videoCompressor': omniVideoCompressorDescriptor,
  'omni.videoFormatConversion': omniVideoFormatConversionDescriptor,
  'omni.videoSubtitleGeneration': omniVideoSubtitleGenerationDescriptor,
  'omni.viewVideo': omniViewVideoDescriptor,
} as const;

for (const tool of tools) {
  defineAgentCoreContractTest({
    sourcePath: 'Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/' + tool.group + '/' + tool.id + '.ts',
    docPath: 'Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/' + tool.group + '/' + tool.id + '.md',
    testFileUrl: import.meta.url,
  });
}

function legalTarget(tool: (typeof tools)[number]) {
  const target: Record<string, unknown> = {};
  if (tool.input) target.inputPath = '/workspace/media/source.' + (tool.group.startsWith('audio') ? 'wav' : tool.group.startsWith('image') ? 'png' : 'mp4');
  if (tool.output) target.outputPath = '/workspace/output/result.' + (tool.group.startsWith('audio') ? 'wav' : tool.group.startsWith('image') ? 'png' : 'mp4');
  if (tool.prompt) target.prompt = 'Create a short test asset.';
  target.targetFormat = tool.group.startsWith('audio') ? 'wav' : tool.group.startsWith('image') ? 'png' : 'mp4';
  return target;
}

test('omniBase remaining tools keep canonical storage shape and thin explicit entry exports', () => {
  for (const tool of tools) {
    const storageDir = path.join(repoRoot, 'src/storagePool/baseToolStorage/omniBase', tool.group, tool.id);
    for (const fileName of ['core.ts', 'bestPractice.ts', 'dependencies.ts', 'anthropic.ts', 'openai.ts', 'deepmind.ts', tool.id + '.md']) {
      assert.ok(existsSync(path.join(storageDir, fileName)), tool.id + ' missing canonical storage file: ' + fileName);
    }
    assert.equal(existsSync(path.join(repoRoot, 'src/storagePool/baseToolStorage/omniBase', tool.group, tool.id + '.ts')), false);
    const entryText = readFileSync(path.join(repoRoot, 'src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase', tool.group, tool.id + '.ts'), 'utf8');
    assert.doesNotMatch(entryText, /export\s+\*\s+from/u, tool.id + ' entry must not use bare export star');
    assert.match(entryText, new RegExp('omni' + tool.alias + 'Handler'), tool.id + ' entry must export handler');
  }
});

test('omniBase remaining storage docs describe the operational runtime boundary', () => {
  for (const tool of tools) {
    const docPath = path.join(repoRoot, 'src/storagePool/baseToolStorage/omniBase', tool.group, tool.id, tool.id + '.md');
    const docText = readFileSync(docPath, 'utf8');
    for (const heading of ['## Use This Tool', '## Call Shape', '## Required Inputs', '## Optional Inputs', '## Runtime Behavior', '## Returns', '## Example', '## Avoid']) {
      assert.match(docText, new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'mu'), tool.id + ' doc missing ' + heading);
    }
    assert.match(docText, /BaseToolExecutorPort\.omni\.transformMedia/u, tool.id + ' doc must name runtime omni port');
    assert.match(docText, /Runtime\/modelAdapter owns media bytes/u, tool.id + ' doc must keep bytes and provider lowering out of omniBase');
    assert.match(docText, /Do not use this tool to read files directly/u, tool.id + ' doc must warn against hidden filesystem/media work');
  }
});

test('omniBase remaining tools dry-run without calling runtime provider', async () => {
  for (const tool of tools) {
    const planner = planners[tool.id];
    const result = await planner({
      target: legalTarget(tool),
      context: {
        invocationId: tool.id + ':dry-run-test',
        allowedInputRoots: ['/workspace/media'],
        allowedOutputRoots: ['/workspace/output'],
        grantedPermissions: [...descriptors[tool.id].permissionsRequired],
      },
      provider: () => {
        throw new Error('provider should not be called during dry-run');
      },
    });
    assert.equal(result.ok, true, tool.id);
    if (!result.ok) continue;
    assert.equal(result.output.dispatch, 'dry-run', tool.id);
    assert.equal(result.output.providerCalled, false, tool.id);
    assert.equal(result.output.dependencyProfile.nativeBinaryRequired, false, tool.id);
    assert.equal(result.output.runtimeEntry.port, 'BaseToolExecutorPort.omni.transformMedia', tool.id);
  }
});

test('omniBase remaining tools reject malformed input, scope gaps, permission gaps, and provider failure publicly', async () => {
  for (const tool of tools) {
    const planner = planners[tool.id];

    const missing = await planner();
    assert.equal(missing.ok, false, tool.id + ' requires target');
    if (!missing.ok) assert.equal(missing.error.code, 'MISSING_TARGET', tool.id);

    const malformedContext = await planner({ target: legalTarget(tool), context: 'not-an-object' });
    assert.equal(malformedContext.ok, false, tool.id + ' rejects malformed context');
    if (!malformedContext.ok) assert.equal(malformedContext.error.code, 'INVALID_CONTEXT', tool.id);

    if (tool.input) {
      const scope = await planner({
        target: legalTarget(tool),
        context: { allowedInputRoots: ['/workspace/other'] },
      });
      assert.equal(scope.ok, false, tool.id + ' rejects input path scope');
      if (!scope.ok) assert.equal(scope.error.code, 'INPUT_PATH_OUT_OF_SCOPE', tool.id);
    }

    const permission = await planner({
      target: legalTarget(tool),
      context: { grantedPermissions: [] },
    });
    assert.equal(permission.ok, false, tool.id + ' rejects permission gaps');
    if (!permission.ok) assert.equal(permission.error.code, 'PERMISSION_DENIED', tool.id);

    const lookup = createBaseToolRegistry().lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id);
    if (!lookup.ok) continue;
    const failedProvider = await lookup.handler.invoke({
      toolCallId: tool.id + ':provider-failure',
      runtimeId: 'runtime-omni-test',
      sessionId: 'session-omni-test',
      executor: {
        omni: {
          async transformMedia() {
            return {
              ok: false,
              error: {
                code: 'PRIVATE_PROVIDER_ERROR',
                message: 'private provider stack should not leak',
                publicSafe: true,
              },
            };
          },
        },
      },
      input: {
        target: legalTarget(tool),
        context: { dryRun: false, guard: { accepted: true } },
      },
    });
    assert.equal(failedProvider.ok, false, tool.id + ' maps provider failure');
    if (!failedProvider.ok) {
      assert.equal(failedProvider.error.code, 'PROVIDER_REJECTED', tool.id);
      assert.equal(failedProvider.error.publicSafe, true, tool.id);
      assert.equal(failedProvider.error.message.includes('private provider stack'), false, tool.id);
    }
  }
});

test('omniBase remaining tools route live execution only through executor.omni.transformMedia', async () => {
  for (const tool of tools) {
    const lookup = createBaseToolRegistry().lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id);
    if (!lookup.ok) continue;

    const noProvider = await lookup.handler.invoke({
      toolCallId: tool.id + ':missing-provider',
      runtimeId: 'runtime-omni-test',
      sessionId: 'session-omni-test',
      executor: {},
      input: {
        target: legalTarget(tool),
        context: { dryRun: false, guard: { accepted: true } },
      },
    });
    assert.equal(noProvider.ok, false, tool.id + ' should not fallback without executor.omni');
    if (!noProvider.ok) assert.equal(noProvider.error.code, 'PROVIDER_UNAVAILABLE', tool.id);

    const calls: unknown[] = [];
    const executor: BaseToolExecutorPort = {
      omni: {
        async transformMedia(request: { operation: string; inputArtifactId?: string; parameters?: Readonly<Record<string, unknown>> }) {
          calls.push(request);
          return { ok: true, output: { artifactId: 'artifact:' + tool.id, mimeType: 'application/octet-stream' }, metadata: { runtimeCarrier: 'fake-omni' } };
        },
      },
    };
    const live = await lookup.handler.invoke({
      toolCallId: tool.id + ':live',
      runtimeId: 'runtime-omni-test',
      sessionId: 'session-omni-test',
      executor,
      input: {
        target: legalTarget(tool),
        context: { dryRun: false, guard: { accepted: true } },
      },
    });
    assert.equal(live.ok, true, tool.id);
    assert.equal(calls.length, 1, tool.id);
    const call = calls[0] as { operation?: string; parameters?: Record<string, unknown> };
    assert.equal(call.operation?.startsWith(tool.id + '.'), true, tool.id);
    assert.equal(call.parameters?.runtimeId, 'runtime-omni-test', tool.id);
    if (live.ok) {
      const output = live.output as {
        dispatch?: string;
        providerCalled?: boolean;
        operationEnvelope?: { artifactId?: string };
      };
      assert.equal(output.dispatch, 'runtime-omni', tool.id);
      assert.equal(output.providerCalled, true, tool.id);
      assert.equal(output.operationEnvelope?.artifactId, 'artifact:' + tool.id, tool.id);
    }
  }
});
