import { praxis } from "@praxis-ai/praxis";
import type { ToolSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "../config/repoInspectorOptions.js";

function knownTools(toolIds: readonly string[]): ToolSpec[] {
  return toolIds.map((toolId) => {
    const lookup = praxis.tryBaseToolById(toolId);
    if (!lookup.ok) {
      return praxis.tool(toolId, {
        description: `Unresolved test surface for ${toolId}`,
        metadata: {
          authoringSurface: "example.fullstack.allTestable",
          catalogError: lookup.error.code,
        },
      });
    }
    return lookup.tool;
  });
}

function omniTestableTools(): ToolSpec[] {
  return knownTools([
    "omni.viewImage",
    "omni.generateImage",
    "omni.imageCompressor",
    "omni.imageFormatConversion",
    "omni.listenAudio",
    "omni.audioLyricsGeneration",
    "omni.generateAudio",
    "omni.audioCompressor",
    "omni.audioFormatConversion",
    "omni.viewVideo",
    "omni.videoSubtitleGeneration",
    "omni.videoCompressor",
    "omni.videoFormatConversion",
    "omni.generateVideo",
  ]);
}

function computerUseTestableTools(): ToolSpec[] {
  return knownTools([
    "computeruse.fullscreenScreenshot",
    "computeruse.windowScreenshot",
    "computeruse.rectangularSelectionScreenshot",
    "computeruse.freeformScreenshot",
    "computeruse.screenshotStorage",
    "computeruse.fullscreenScreenRecording",
    "computeruse.windowScreenRecording",
    "computeruse.rectangularSelectionScreenRecording",
    "computeruse.screenRecordingStorage",
    "computeruse.microphonePermissionRequest",
    "computeruse.microphoneSelect",
    "computeruse.microphoneStartRecording",
    "computeruse.microphoneStopRecording",
    "computeruse.microphonePermissionRelease",
    "computeruse.cameraPermissionRequest",
    "computeruse.cameraSelect",
    "computeruse.cameraCapturePhoto",
    "computeruse.cameraStartRecording",
    "computeruse.cameraStopRecording",
    "computeruse.cameraPermissionRelease",
    "computeruse.cameraContentStorage",
    "computeruse.mouseClick",
    "computeruse.mouseMove",
    "computeruse.mouseScroll",
    "computeruse.cursorLocate",
    "computeruse.keyboardInputEmulation",
    "computeruse.keyboardSubmitInput",
    "computeruse.inputCheckboxConfirm",
  ]);
}

export function createRepoInspectorToolSet(options: NormalizedRepoInspectorOptions): ToolSpec[] {
  if (options.includeAllTestable) {
    return praxis.listBaseToolDeveloperCatalog()
      .map((entry) => praxis.tryBaseToolById(entry.toolId))
      .filter((lookup): lookup is Extract<typeof lookup, { ok: true }> => lookup.ok)
      .map((lookup) => lookup.tool);
  }

  return [
    ...praxis.toolSets.coding.readonly({
      includeSearch: options.mode === "deep",
    }),
    ...(options.includeShell ? praxis.toolSets.shell.safe() : []),
    ...(options.includeSkillAuthoring ? praxis.toolSets.skill.authoring() : []),
    praxis.baseTools.skill.ripgrep({
      description: "只读检索本机可用的 skill/context 材料。",
    }),
  ];
}
