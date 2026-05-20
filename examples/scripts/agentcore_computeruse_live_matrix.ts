import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseToolExecutorPort } from "../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/executionEngine/basic_toolLayer/invocationAdapter.js";
import { invokeChatGPTCodexResponses } from "../../src/modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/modelAdapter/providerAccessLayer/transportCaller.js";
import { bridgeExecEngineInvocation } from "../../src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const args = process.argv.slice(2);
const argSet = new Set(args);
const dialogueMode = argSet.has("--dialogue");
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";
const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const useModel = !argSet.has("--no-model");

type ComputerUseToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

type ComputerUseMatrixCase = {
  toolId: string;
  userPrompt: string;
  input: Readonly<Record<string, unknown>>;
  expectedCall: string;
};

const screenshotCases: readonly ComputerUseMatrixCase[] = [
  {
    toolId: "computeruse.fullscreenScreenshot",
    userPrompt: "帮我截取当前整个屏幕，用来确认桌面状态。",
    input: {
      purpose: "inspect full desktop state",
      target: { displayId: "display-1", outputFormat: "image/png" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "capture:fullscreen",
  },
  {
    toolId: "computeruse.windowScreenshot",
    userPrompt: "截一下这个目标窗口，保留当前窗口画面证据。",
    input: {
      purpose: "inspect target window state",
      target: { windowRef: "window-1", displayId: "display-1", outputFormat: "image/png" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "capture:window",
  },
  {
    toolId: "computeruse.rectangularSelectionScreenshot",
    userPrompt: "截取屏幕左上角这个矩形区域。",
    input: {
      purpose: "inspect rectangular screen region",
      target: { displayId: "display-1", rect: { x: 0, y: 0, width: 320, height: 200 }, outputFormat: "image/png" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "capture:region",
  },
  {
    toolId: "computeruse.freeformScreenshot",
    userPrompt: "按这个自由多边形范围截屏。",
    input: {
      purpose: "inspect freeform screen region",
      target: {
        displayId: "display-1",
        points: [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 220, y: 160 }, { x: 20, y: 180 }],
        outputFormat: "image/png",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "capture:freeform",
  },
  {
    toolId: "computeruse.screenshotStorage",
    userPrompt: "把刚才的截图 artifact 保存到当前 session 里。",
    input: {
      purpose: "retain screenshot artifact evidence",
      target: {
        screenshotRef: "artifact:screenshot:latest",
        storageTarget: "session://screenshots/latest.png",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "store:screenshot",
  },
] as const;

const screenRecordingCases: readonly ComputerUseMatrixCase[] = [
  {
    toolId: "computeruse.fullscreenScreenRecording",
    userPrompt: "开始录制整个屏幕，用来记录当前桌面工作流。",
    input: {
      purpose: "record full desktop workflow",
      target: {
        displayId: "display-1",
        maxDurationMs: 1000,
        includeCursor: true,
        includeAudio: false,
        outputFormat: "video/webm",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "start:fullscreen",
  },
  {
    toolId: "computeruse.windowScreenRecording",
    userPrompt: "开始录制这个指定窗口的操作过程。",
    input: {
      purpose: "record target window workflow",
      target: {
        windowId: "window-1",
        maxDurationMs: 1000,
        frameRate: 15,
        includeCursor: true,
        outputFormat: "video/webm",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "start:window",
  },
  {
    toolId: "computeruse.rectangularSelectionScreenRecording",
    userPrompt: "开始录制屏幕左上角这个矩形区域。",
    input: {
      purpose: "record rectangular screen region",
      target: {
        displayId: "display-1",
        rect: { x: 0, y: 0, width: 320, height: 200 },
        maxDurationMs: 1000,
        frameRate: 15,
        includeCursor: true,
        includeAudio: false,
        outputFormat: "video/webm",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "start:region",
  },
  {
    toolId: "computeruse.screenRecordingStorage",
    userPrompt: "停止刚才的屏幕录制，并把视频 artifact 保存到当前 session。",
    input: {
      purpose: "retain screen recording artifact evidence",
      target: {
        recordingRef: "recording:screen:latest",
        storageTarget: "session://recordings/latest.webm",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "stop:screen:session://recordings/latest.webm",
  },
] as const;

const microphoneCases: readonly ComputerUseMatrixCase[] = [
  {
    toolId: "computeruse.microphonePermissionRequest",
    userPrompt: "为 Praxis Agent 请求麦克风录音权限。",
    input: {
      target: {
        targetApplication: "Praxis Agent",
        purpose: "record a short voice note",
        deviceId: "studio-mic",
        mode: "recording",
        requestedDurationMs: 1000,
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "permission-request:microphone:record a short voice note",
  },
  {
    toolId: "computeruse.microphonePermissionRelease",
    userPrompt: "释放刚才 Praxis Agent 的麦克风权限 lease。",
    input: {
      target: {
        permissionLeaseId: "lease:microphone:latest",
        targetApplication: "Praxis Agent",
        deviceId: "studio-mic",
        releaseReason: "dialogue cleanup",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "permission-release:microphone:lease:microphone:latest",
  },
  {
    toolId: "computeruse.microphoneSelect",
    userPrompt: "选择 studio-mic 作为这次录音使用的麦克风。",
    input: {
      target: {
        deviceId: "studio-mic",
        targetApplication: "Praxis Agent",
        permissionLeaseId: "lease:microphone:latest",
        selectionReason: "prefer external microphone",
        availableDevices: [{ id: "studio-mic", label: "Studio Mic", kind: "usb" }],
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "select:microphone:studio-mic",
  },
  {
    toolId: "computeruse.microphoneStartRecording",
    userPrompt: "开始录制一段很短的麦克风语音备忘。",
    input: {
      purpose: "record a short voice note",
      target: {
        deviceId: "studio-mic",
        permissionLeaseId: "lease:microphone:latest",
        recordingLabel: "voice-note",
        destinationHint: "session://recordings/voice-note-start.webm",
        maxDurationMs: 1000,
        outputFormat: "audio/webm",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "start:microphone",
  },
  {
    toolId: "computeruse.microphoneStopRecording",
    userPrompt: "停止刚才的麦克风录音，并把音频 artifact 保存到当前 session。",
    input: {
      purpose: "retain microphone recording artifact evidence",
      target: {
        recordingId: "recording:microphone:latest",
        deviceId: "studio-mic",
        persistHint: "session://recordings/voice-note.webm",
        releaseDevice: true,
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "stop:microphone:session://recordings/voice-note.webm",
  },
] as const;

const cameraCases: readonly ComputerUseMatrixCase[] = [
  {
    toolId: "computeruse.cameraPermissionRequest",
    userPrompt: "为 Praxis Agent 请求摄像头拍照权限。",
    input: {
      target: {
        targetApplication: "Praxis Agent",
        purpose: "capture a profile photo",
        deviceId: "studio-camera",
        mode: "single-capture",
        requestedDurationMs: 1000,
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "permission-request:camera:capture a profile photo",
  },
  {
    toolId: "computeruse.cameraPermissionRelease",
    userPrompt: "释放刚才 Praxis Agent 的摄像头权限 lease。",
    input: {
      target: {
        leaseId: "lease:camera:latest",
        deviceId: "studio-camera",
        reason: "dialogue cleanup",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "permission-release:camera:lease:camera:latest",
  },
  {
    toolId: "computeruse.cameraSelect",
    userPrompt: "选择 studio-camera 作为这次拍照使用的摄像头。",
    input: {
      target: {
        deviceId: "studio-camera",
        purpose: "prefer external camera",
        availableDevices: [{ id: "studio-camera", label: "Studio Camera", kind: "usb" }],
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "select:camera:studio-camera",
  },
  {
    toolId: "computeruse.cameraCapturePhoto",
    userPrompt: "用 studio-camera 拍一张照片并返回 artifact。",
    input: {
      purpose: "capture a profile photo",
      target: {
        cameraId: "studio-camera",
        purpose: "capture a profile photo",
        outputFormat: "image/jpeg",
        permissionLeaseId: "lease:camera:latest",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "capture-camera-photo:studio-camera",
  },
  {
    toolId: "computeruse.cameraStartRecording",
    userPrompt: "开始录制一段很短的摄像头视频。",
    input: {
      purpose: "record a short camera clip",
      target: {
        cameraId: "studio-camera",
        purpose: "record a short camera clip",
        outputFormat: "video/webm",
        includeAudio: false,
        maxDurationMs: 1000,
        recordingLabel: "camera-clip",
        destinationHint: "session://camera/camera-clip-start.webm",
        permissionLeaseId: "lease:camera:latest",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "start:camera",
  },
  {
    toolId: "computeruse.cameraStopRecording",
    userPrompt: "停止刚才的摄像头录制，并把视频 artifact 保存到当前 session。",
    input: {
      purpose: "retain camera recording artifact evidence",
      target: {
        recordingId: "recording:camera:latest",
        purpose: "retain camera recording artifact evidence",
        storageTarget: "session://camera/camera-clip.webm",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "stop:camera:session://camera/camera-clip.webm",
  },
  {
    toolId: "computeruse.cameraContentStorage",
    userPrompt: "把刚才的摄像头照片 artifact 存到当前 session。",
    input: {
      purpose: "retain camera photo artifact evidence",
      target: {
        contentRef: "artifact:camera-photo:latest",
        contentKind: "camera-photo",
        storageTarget: "session://camera/profile-photo.jpg",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "store:camera-photo",
  },
  {
    toolId: "computeruse.cameraFaceRecognition",
    userPrompt: "对刚才的摄像头帧做一次人脸检测，不做身份识别。",
    input: {
      target: {
        frameRef: "artifact:camera-frame:latest",
        deviceId: "studio-camera",
        mode: "detect-faces",
        maxFaces: 4,
      },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "analyze-camera-frame:detect-faces",
  },
] as const;

const pointerKeyboardCases: readonly ComputerUseMatrixCase[] = [
  {
    toolId: "computeruse.cursorLocate",
    userPrompt: "读取当前鼠标指针位置，只做观察。",
    input: {
      purpose: "observe cursor position",
      target: { coordinateSpace: "screen", displayId: "display-1" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "locate-cursor:screen",
  },
  {
    toolId: "computeruse.mouseMove",
    userPrompt: "把鼠标移动到屏幕坐标 10,20。",
    input: {
      purpose: "move pointer in deterministic matrix",
      target: { x: 10, y: 20, coordinateSpace: "screen", durationMs: 0, displayId: "display-1" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "pointer:move",
  },
  {
    toolId: "computeruse.mouseClick",
    userPrompt: "在当前光标处执行一次左键点击。",
    input: {
      purpose: "click in deterministic matrix",
      target: { button: "left", clickCount: 1, coordinateSpace: "screen", at: { x: 10, y: 20 } },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "pointer:click",
  },
  {
    toolId: "computeruse.mouseScroll",
    userPrompt: "在当前光标处向下滚动一点。",
    input: {
      purpose: "scroll in deterministic matrix",
      target: { deltaY: 120, coordinateSpace: "screen", at: { x: 10, y: 20 }, durationMs: 0 },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "pointer:scroll",
  },
  {
    toolId: "computeruse.mouseEmulation",
    userPrompt: "用鼠标动作序列移动并点击。",
    input: {
      purpose: "run pointer sequence in deterministic matrix",
      steps: [
        { kind: "move", target: { x: 10, y: 20 }, coordinateSpace: "screen", durationMs: 0 },
        { kind: "click", button: "left", clickCount: 1, coordinateSpace: "screen", at: { x: 10, y: 20 } },
      ],
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "pointer:click",
  },
  {
    toolId: "computeruse.checkboxConfirm",
    userPrompt: "通过鼠标确认一个安全复选框。",
    input: {
      purpose: "confirm pointer checkbox in deterministic matrix",
      target: { label: "I understand", at: { x: 10, y: 20 }, coordinateSpace: "screen" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "pointer:confirm",
  },
  {
    toolId: "computeruse.keyboardEmulation",
    userPrompt: "发出一个 Ctrl+L 快捷键。",
    input: {
      purpose: "emit keyboard shortcut in deterministic matrix",
      target: { targetHint: "address bar", actions: [{ kind: "shortcut", keys: ["Control", "L"] }] },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "keyboard:shortcut",
  },
  {
    toolId: "computeruse.keyboardInputEmulation",
    userPrompt: "向当前输入框键入 matrix-ok。",
    input: {
      purpose: "type text in deterministic matrix",
      target: { text: "matrix-ok", inputMode: "text", targetHint: "focused input", maxTextLength: 64 },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "keyboard:type",
  },
  {
    toolId: "computeruse.keyboardSubmitInput",
    userPrompt: "提交当前输入框。",
    input: {
      purpose: "submit text in deterministic matrix",
      target: { submitKey: "Enter", targetHint: "focused input" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "keyboard:submit",
  },
  {
    toolId: "computeruse.inputCheckboxConfirm",
    userPrompt: "通过键盘确认一个输入复选框。",
    input: {
      purpose: "confirm keyboard checkbox in deterministic matrix",
      target: { label: "I understand", targetHint: "focused checkbox" },
      context: { dryRun: false, guard: { allowed: true, accepted: true } },
    },
    expectedCall: "keyboard:confirm",
  },
] as const;

const computerUseCases: readonly ComputerUseMatrixCase[] = [
  ...screenshotCases,
  ...screenRecordingCases,
  ...microphoneCases,
  ...cameraCases,
  ...pointerKeyboardCases,
] as const;

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function extractSseText(text: string): string {
  const deltas: string[] = [];
  const completed: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record.delta === "string") deltas.push(record.delta);
    if (record.type === "response.completed" && record.response !== undefined) {
      const responseText = extractResponseText(record.response);
      if (responseText.trim().length > 0) completed.push(responseText);
    }
  }
  return deltas.join("").trim() || completed.join("\n").trim();
}

function extractResponseText(response: unknown): string {
  if (typeof response === "string") return extractSseText(response) || response;
  if (typeof response !== "object" || response === null) return String(response);
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) return record.output_text.trim();
  const outputValue = record.output;
  if (Array.isArray(outputValue)) {
    const parts: string[] = [];
    for (const item of outputValue) {
      if (typeof item !== "object" || item === null) continue;
      const contentValue = (item as Record<string, unknown>).content;
      if (!Array.isArray(contentValue)) continue;
      for (const content of contentValue) {
        if (typeof content !== "object" || content === null) continue;
        const text = (content as Record<string, unknown>).text ?? (content as Record<string, unknown>).output_text;
        if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return JSON.stringify(response, null, 2);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown;
    throw new Error(`model did not return JSON: ${text.slice(0, 400)}`);
  }
}

function normalizeComputerUseToolCall(value: unknown): ComputerUseToolCall | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const toolCalls = record.tool_calls ?? record.toolCalls;
  const first = Array.isArray(toolCalls) ? toolCalls[0] : record;
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const toolRecord = first as Record<string, unknown>;
  const tool = toolRecord.tool ?? toolRecord.name;
  const toolArguments = toolRecord.arguments;
  if (typeof tool !== "string" || !tool.startsWith("computeruse.")) return undefined;
  if (typeof toolArguments !== "object" || toolArguments === null || Array.isArray(toolArguments)) return undefined;
  return { tool, arguments: toolArguments as Readonly<Record<string, unknown>> };
}

async function callResponsesApi(
  prompt: string,
  instructions = "你是 Praxis agentCore computeruseBase live matrix。你只输出 JSON tool_calls，不输出解释。",
): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-computeruse-live-matrix-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) throw new Error(JSON.stringify(credentialRef.error));

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) throw new Error(JSON.stringify(auth.error));

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.agentcore-computeruse-live-matrix",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-computeruse-live-matrix",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) throw new Error(JSON.stringify(carrier.error));

  const caller = createProviderCaller({
    transport: fetchProviderTransport,
    authMaterial: auth.resolved.privateMaterial,
    timeoutMs: 60_000,
  });

  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    baseUrl: carrier.carrier.baseURL,
    auth: auth.resolved.envelope,
    runtime: {
      runtimeId: "agentcore-computeruse-live-matrix-runtime",
      invocationId: `agentcore-computeruse-live-matrix-${Date.now()}`,
      callerId: "agentcore-computeruse-live-matrix",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-computeruse-live-matrix",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: {
      model,
      instructions,
      input: prompt,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
    },
  });

  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return extractResponseText(result.response.raw);
}

function createComputerUseExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    computeruse: {
      async requestPermission(request) {
        calls.push(`permission-request:${request.resource}:${request.purpose}`);
        return {
          ok: true,
          output: {
            granted: true,
            leaseId: `lease:${request.resource}:live-matrix`,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.requestPermission",
              labMode: "deterministic-computeruse-permission-matrix",
            },
          },
        };
      },
      async releasePermission(request) {
        calls.push(`permission-release:${request.resource}:${request.leaseId ?? "missing-lease"}`);
        return {
          ok: true,
          output: {
            released: true,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.releasePermission",
              labMode: "deterministic-computeruse-permission-matrix",
            },
          },
        };
      },
      async selectDevice(request) {
        calls.push(`select:${request.resource}:${request.deviceId}`);
        return {
          ok: true,
          output: {
            selected: true,
            deviceId: request.deviceId,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.selectDevice",
              labMode: "deterministic-computeruse-device-select-matrix",
            },
          },
        };
      },
      async captureScreenshot(request) {
        calls.push(`capture:${request.target}`);
        return {
          ok: true,
          output: {
            artifactId: `artifact:computeruse-screenshot:${request.target}`,
            mimeType: request.outputFormat ?? "image/png",
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.captureScreenshot",
              labMode: "deterministic-computeruse-screenshot-matrix",
            },
          },
        };
      },
      async pointerAction(request) {
        const action = typeof request.metadata?.sequence === "boolean" && request.metadata.sequence
          ? "sequence"
          : request.action;
        calls.push(`pointer:${action}`);
        return {
          ok: true,
          output: {
            actionId: `pointer:${action}:live-matrix`,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.pointerAction",
              labMode: "deterministic-computeruse-pointer-matrix",
              target: request.target,
            },
          },
        };
      },
      async keyboardAction(request) {
        const action = request.action;
        calls.push(`keyboard:${action}`);
        return {
          ok: true,
          output: {
            actionId: `keyboard:${action}:live-matrix`,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.keyboardAction",
              labMode: "deterministic-computeruse-keyboard-matrix",
              keys: request.keys,
              textLength: request.text?.length,
            },
          },
        };
      },
      async locateCursor(request) {
        calls.push(`locate-cursor:${request.coordinateSpace ?? "screen"}`);
        return {
          ok: true,
          output: {
            x: 10,
            y: 20,
            coordinateSpace: request.coordinateSpace ?? "screen",
            position: { x: 10, y: 20, coordinateSpace: request.coordinateSpace ?? "screen", displayId: "display-1" },
            capturedAt: "2026-05-09T00:00:00.000Z",
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.locateCursor",
              labMode: "deterministic-computeruse-cursor-matrix",
            },
          },
        };
      },
      async captureCameraPhoto(request) {
        calls.push(`capture-camera-photo:${request.cameraId}`);
        return {
          ok: true,
          output: {
            artifactId: `artifact:computeruse-camera-photo:${request.cameraId}`,
            mimeType: request.outputFormat ?? "image/jpeg",
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.captureCameraPhoto",
              labMode: "deterministic-computeruse-camera-photo-matrix",
            },
          },
        };
      },
      async analyzeCameraFrame(request) {
        calls.push(`analyze-camera-frame:${request.operation}`);
        return {
          ok: true,
          output: {
            faceCount: 1,
            faces: [
              {
                faceId: "face:camera-frame:1",
                confidence: 0.98,
                boundingBox: { x: 0.2, y: 0.2, width: 0.3, height: 0.4, coordinateSpace: "normalized" },
              },
            ],
            identityResolved: request.operation !== "detect-faces",
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.analyzeCameraFrame",
              labMode: "deterministic-computeruse-camera-face-matrix",
            },
          },
        };
      },
      async startRecording(request) {
        const target = typeof request.target?.target === "string" ? request.target.target : request.resource;
        calls.push(`start:${target}`);
        return {
          ok: true,
          output: {
            recordingId: `recording:computeruse:${target}`,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.startRecording",
              labMode: "deterministic-computeruse-screen-recording-matrix",
            },
          },
        };
      },
      async stopRecording(request) {
        calls.push(`stop:${request.resource ?? "unknown"}:${request.storageTarget ?? "missing-storage-target"}`);
        const isMicrophone = request.resource === "microphone";
        return {
          ok: true,
          output: {
            artifactId: isMicrophone
              ? "artifact:computeruse-microphone-recording:stored"
              : "artifact:computeruse-screen-recording:stored",
            mimeType: isMicrophone ? "audio/webm" : "video/webm",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.computeruse.stopRecording",
              recordingId: request.recordingId,
              labMode: isMicrophone
                ? "deterministic-computeruse-microphone-recording-matrix"
                : "deterministic-computeruse-screen-recording-matrix",
            },
          },
        };
      },
    },
    artifact: {
      async store(request) {
        calls.push(`store:${request.artifactKind ?? "generic"}`);
        return {
          ok: true,
          output: {
            artifactId: "artifact:computeruse-screenshot:stored",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: {
              runtimeEntry: "BaseToolExecutorPort.artifact.store",
              artifactRef: request.artifactRef,
              labMode: "deterministic-computeruse-screenshot-matrix",
            },
          },
        };
      },
    },
  };
}

async function invokeComputerUseToolThroughRuntimeChain(
  toolCall: ComputerUseToolCall,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; toolId: string; output?: unknown; error?: { code: string; publicSafe: true } }> {
  const toolCallId = `${toolCall.tool}:computeruse-live-matrix`;
  const runtimeId = "agentcore-computeruse-live-matrix-runtime";
  const sessionId = "agentcore-computeruse-live-matrix-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId: toolCall.tool,
    operation: toolCall.tool,
    arguments: toolCall.arguments,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  if (!adapted.ok) return { ok: false, toolId: toolCall.tool, error: adapted.error };

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-computeruse-live-matrix", sessionId },
    invocation: {
      invocationId: toolCallId,
      kind: "tool",
      target: toolCall.tool,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, toolId: toolCall.tool, error: bridged.error };

  const lookup = createBaseToolRegistry().lookupHandler(toolCall.tool);
  if (!lookup.ok) return { ok: false, toolId: toolCall.tool, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: toolCall.arguments, executor });
}

function toolCallFromCase(testCase: ComputerUseMatrixCase): ComputerUseToolCall {
  return { tool: testCase.toolId, arguments: testCase.input };
}

function summarizeToolResult(toolId: string, toolResult: { ok: boolean; output?: unknown; error?: unknown }, calls: readonly string[]): string {
  if (!toolResult.ok) return `${toolId} failed with ${JSON.stringify(toolResult.error)}`;
  return `${toolId} completed through ${calls.join(", ")} and returned ${JSON.stringify(toolResult.output ?? null).slice(0, 240)}`;
}

function truncateText(value: unknown, maxChars = 1_200): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated>` : text;
}

async function summarizeDialogueTurn(input: {
  userPrompt: string;
  toolId: string;
  toolCall: unknown;
  toolResult: unknown;
  calls: readonly string[];
}): Promise<string> {
  return await callResponsesApi(
    [
      "你正在完成一次 Praxis agentCore 真实对话工具回合。",
      "请用中文给出最终回答，必须说明工具是否调用成功、关键输出、runtime 调用了哪个 executor port。",
      "不要输出 JSON，不要声称没有工具。",
      `用户请求：${input.userPrompt}`,
      `工具：${input.toolId}`,
      `executor calls：${input.calls.join(", ")}`,
      `工具调用：${truncateText(input.toolCall)}`,
      `工具结果：${truncateText(input.toolResult)}`,
    ].join("\n"),
    "你是 Praxis agentCore 的最终回答层。工具已经执行完毕，请把工具结果解释给用户。",
  );
}

async function main(): Promise<void> {
  const onlyTool = argValue("--tool");
  const limit = Number(argValue("--limit") ?? computerUseCases.length);
  const selected = computerUseCases
    .filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : computerUseCases.length);
  const results = [];

  if (dialogueMode) {
    console.log("agentCore computeruseBase dialogue suite");
    console.log(`model=${model}`);
    console.log(`reasoning.effort=${reasoningEffort}`);
    console.log(`mode=${useModel ? "live-model-plus-registry-handler-plus-final-answer" : "registry-handler-only"}`);
    console.log("");
  }

  if (selected.length === 0) {
    const summary = {
      ok: false,
      mode: useModel
        ? dialogueMode
          ? "live-model-plus-registry-handler-plus-final-answer"
          : "live-model-plus-registry-handler"
        : dialogueMode
          ? "registry-handler-only-dialogue-fallback"
          : "registry-handler-only",
      model,
      reasoningEffort,
      total: 0,
      passed: 0,
      failed: 1,
      failedTools: onlyTool === undefined ? [] : [onlyTool],
      error: onlyTool === undefined ? "NO_COMPUTERUSE_CASES_SELECTED" : "UNKNOWN_COMPUTERUSE_TOOL_FILTER",
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  for (const testCase of selected) {
    const calls: string[] = [];
    let modelText = "";
    let toolCall = toolCallFromCase(testCase);
    let modelOk = true;
    let modelError: string | undefined;

    if (useModel) {
      const prompt = [
        "请模拟一次真实 agentCore 对话里的工具调用。",
        `用户请求：${testCase.userPrompt}`,
        `必须调用工具：${testCase.toolId}`,
        "必须使用以下 arguments，不能改字段名，不能省略 context：",
        JSON.stringify(testCase.input, null, 2),
        "只返回：{\"tool_calls\":[{\"tool\":\"...\",\"arguments\":{...}}]}",
      ].join("\n");

      try {
        modelText = await callResponsesApi(prompt);
        const parsedToolCall = normalizeComputerUseToolCall(parseJsonObject(modelText));
        if (parsedToolCall === undefined) {
          modelOk = false;
          modelError = "MODEL_DID_NOT_RETURN_COMPUTERUSE_TOOL_CALL";
        } else if (parsedToolCall.tool !== testCase.toolId) {
          modelOk = false;
          modelError = `MODEL_TOOL_MISMATCH:${parsedToolCall.tool}`;
          toolCall = parsedToolCall;
        } else {
          toolCall = parsedToolCall;
        }
      } catch (error) {
        modelOk = false;
        modelError = error instanceof Error ? error.message : String(error);
      }
    }

    const toolResult = await invokeComputerUseToolThroughRuntimeChain(toolCall, createComputerUseExecutor(calls));
    const expectedCallOk = calls.includes(testCase.expectedCall);
    const ok = modelOk && toolResult.ok === true && expectedCallOk;
    let finalAnswer = "";
    if (dialogueMode && useModel) {
      finalAnswer = await summarizeDialogueTurn({
        userPrompt: testCase.userPrompt,
        toolId: testCase.toolId,
        toolCall,
        toolResult,
        calls,
      });
    } else if (dialogueMode) {
      finalAnswer = summarizeToolResult(testCase.toolId, toolResult, calls);
    }
    const record = {
      ok,
      toolId: testCase.toolId,
      modelOk,
      modelError,
      expectedCallOk,
      expectedCall: testCase.expectedCall,
      calls,
      resultOk: toolResult.ok,
      error: toolResult.error,
      outputPreview: JSON.stringify(toolResult.output ?? null).slice(0, 500),
      modelPreview: modelText.slice(0, 500),
      finalAnswerPreview: finalAnswer.slice(0, 500),
    };
    results.push(record);

    if (dialogueMode) {
      console.log(`[${results.length}/${selected.length}] user> ${testCase.userPrompt}`);
      console.log(`model tool_call> ${modelOk ? toolCall.tool : `FAILED ${modelError}`}`);
      console.log(`runtime> ok=${toolResult.ok} calls=${calls.join(", ") || "(none)"}`);
      console.log(`agentCore> ${finalAnswer}`);
      console.log(`result> ${ok ? "PASS" : "FAIL"}`);
      console.log("");
    } else {
      console.log(JSON.stringify(record));
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0,
    mode: useModel
      ? dialogueMode
        ? "live-model-plus-registry-handler-plus-final-answer"
        : "live-model-plus-registry-handler"
      : dialogueMode
        ? "registry-handler-only-dialogue-fallback"
        : "registry-handler-only",
    model,
    reasoningEffort,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedTools: failed.map((result) => result.toolId),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore computeruse live matrix fatal> ${message}`);
  process.exitCode = 1;
});
