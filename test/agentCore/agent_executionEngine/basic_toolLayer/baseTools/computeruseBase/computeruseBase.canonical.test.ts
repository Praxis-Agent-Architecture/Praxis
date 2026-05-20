import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../../../../../src/executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../../../../../src/runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../..");

const canonicalTools = [
  {
    id: "computeruse.fullscreenScreenshot",
    group: "screenshot",
    handlerExport: "fullscreenScreenshotHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.captureScreenshot",
  },
  {
    id: "computeruse.windowScreenshot",
    group: "screenshot",
    handlerExport: "windowScreenshotHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.captureScreenshot",
  },
  {
    id: "computeruse.rectangularSelectionScreenshot",
    group: "screenshot",
    handlerExport: "rectangularSelectionScreenshotHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.captureScreenshot",
  },
  {
    id: "computeruse.freeformScreenshot",
    group: "screenshot",
    handlerExport: "freeformScreenshotHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.captureScreenshot",
  },
  {
    id: "computeruse.screenshotStorage",
    group: "screenshot",
    handlerExport: "screenshotStorageHandler",
    runtimePort: "BaseToolExecutorPort.artifact.store",
  },
  {
    id: "computeruse.keyboardEmulation",
    group: "keyboardEmulation",
    handlerExport: "keyboardEmulationHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.keyboardAction",
  },
  {
    id: "computeruse.inputCheckboxConfirm",
    group: "keyboardEmulation",
    handlerExport: "inputCheckboxConfirmHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.keyboardAction",
  },
  {
    id: "computeruse.keyboardInputEmulation",
    group: "keyboardEmulation",
    handlerExport: "keyboardInputEmulationHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.keyboardAction",
  },
  {
    id: "computeruse.keyboardSubmitInput",
    group: "keyboardEmulation",
    handlerExport: "keyboardSubmitInputHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.keyboardAction",
  },
  {
    id: "computeruse.cameraPermissionRequest",
    group: "cameraAccess",
    handlerExport: "cameraPermissionRequestHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.requestPermission",
  },
  {
    id: "computeruse.cameraPermissionRelease",
    group: "cameraAccess",
    handlerExport: "cameraPermissionReleaseHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.releasePermission",
  },
  {
    id: "computeruse.cameraCapturePhoto",
    group: "cameraAccess",
    handlerExport: "cameraCapturePhotoHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.captureCameraPhoto",
  },
  {
    id: "computeruse.cameraContentStorage",
    group: "cameraAccess",
    handlerExport: "cameraContentStorageHandler",
    runtimePort: "BaseToolExecutorPort.artifact.store",
  },
  {
    id: "computeruse.cameraFaceRecognition",
    group: "cameraAccess",
    handlerExport: "cameraFaceRecognitionHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.analyzeCameraFrame",
  },
  {
    id: "computeruse.cameraStartRecording",
    group: "cameraAccess",
    handlerExport: "cameraStartRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.startRecording",
  },
  {
    id: "computeruse.cameraStopRecording",
    group: "cameraAccess",
    handlerExport: "cameraStopRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.stopRecording",
  },
  {
    id: "computeruse.cameraSelect",
    group: "cameraAccess",
    handlerExport: "cameraSelectHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.selectDevice",
  },
  {
    id: "computeruse.microphonePermissionRequest",
    group: "microphoneAccess",
    handlerExport: "microphonePermissionRequestHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.requestPermission",
  },
  {
    id: "computeruse.microphonePermissionRelease",
    group: "microphoneAccess",
    handlerExport: "microphonePermissionReleaseHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.releasePermission",
  },
  {
    id: "computeruse.microphoneSelect",
    group: "microphoneAccess",
    handlerExport: "microphoneSelectHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.selectDevice",
  },
  {
    id: "computeruse.microphoneStartRecording",
    group: "microphoneAccess",
    handlerExport: "microphoneStartRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.startRecording",
  },
  {
    id: "computeruse.microphoneStopRecording",
    group: "microphoneAccess",
    handlerExport: "microphoneStopRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.stopRecording",
  },
  {
    id: "computeruse.fullscreenScreenRecording",
    group: "screenRecording",
    handlerExport: "fullscreenScreenRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.startRecording",
  },
  {
    id: "computeruse.windowScreenRecording",
    group: "screenRecording",
    handlerExport: "windowScreenRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.startRecording",
  },
  {
    id: "computeruse.rectangularSelectionScreenRecording",
    group: "screenRecording",
    handlerExport: "rectangularSelectionScreenRecordingHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.startRecording",
  },
  {
    id: "computeruse.screenRecordingStorage",
    group: "screenRecording",
    handlerExport: "screenRecordingStorageHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.stopRecording",
  },
  {
    id: "computeruse.mouseClick",
    group: "mouseEmulation",
    handlerExport: "mouseClickHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.pointerAction",
  },
  {
    id: "computeruse.mouseEmulation",
    group: "mouseEmulation",
    handlerExport: "mouseEmulationHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.pointerAction",
  },
  {
    id: "computeruse.checkboxConfirm",
    group: "mouseEmulation",
    handlerExport: "checkboxConfirmHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.pointerAction",
  },
  {
    id: "computeruse.cursorLocate",
    group: "mouseEmulation",
    handlerExport: "cursorLocateHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.locateCursor",
  },
  {
    id: "computeruse.mouseMove",
    group: "mouseEmulation",
    handlerExport: "mouseMoveHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.pointerAction",
  },
  {
    id: "computeruse.mouseScroll",
    group: "mouseEmulation",
    handlerExport: "mouseScrollHandler",
    runtimePort: "BaseToolExecutorPort.computeruse.pointerAction",
  },
] as const;

test("computeruseBase canonical starter tools keep storage shape and explicit entry exports", () => {
  assert.ok(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/_shared/baseToolAdapter.ts")),
    "computeruseBase shared adapter must exist",
  );

  for (const tool of canonicalTools) {
    const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase", tool.group, tool.id);
    for (const fileName of ["core.ts", "bestPractice.ts", "dependencies.ts", "anthropic.ts", "openai.ts", "deepmind.ts", tool.id + ".md"]) {
      assert.ok(existsSync(path.join(storageDir, fileName)), tool.id + " missing canonical storage file: " + fileName);
    }

    const entryPath = path.join(
      repoRoot,
      "src/executionEngine/basic_toolLayer/baseTools/computeruseBase",
      tool.group,
      tool.id + ".ts",
    );
    const entryText = readFileSync(entryPath, "utf8");
    assert.doesNotMatch(entryText, /export\s+\*\s+from/u, tool.id + " entry must not use bare export star");
    assert.match(entryText, new RegExp(tool.handlerExport, "u"), tool.id + " entry must export handler");
  }
});

test("computeruseBase canonical starter docs describe runtime-owned capability boundary", () => {
  for (const tool of canonicalTools) {
    const docPath = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase", tool.group, tool.id, tool.id + ".md");
    const docText = readFileSync(docPath, "utf8");
    for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
      assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"), tool.id + " doc missing " + heading);
    }
    assert.match(docText, new RegExp(tool.runtimePort.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), tool.id + " doc must name runtime port");
    assert.match(docText, /TAP\/agent/u, tool.id + " doc must keep strategy in TAP/agent");
  }
});

test("computeruseBase canonical starter handlers are mounted in builtin registry", () => {
  const registry = createBaseToolRegistry();
  for (const tool of canonicalTools) {
    const lookup = registry.lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id + " should resolve a registry handler");
    if (lookup.ok) assert.equal(lookup.handler.definition.toolId, tool.id);
  }
});

test("computeruse screenshot entry remains the only invocation surface while Linux providers stay dependency metadata", () => {
  const registry = createBaseToolRegistry();
  for (const tool of canonicalTools.filter((candidate) => candidate.group === "screenshot" && candidate.id !== "computeruse.screenshotStorage")) {
    const lookup = registry.lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id + " should resolve a registry handler");
    if (!lookup.ok) continue;

    assert.equal(
      lookup.handler.definition.sourcePath?.endsWith(`src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/${tool.id}.ts`),
      true,
      tool.id + " must publish the computeruseBase entry as its invocation path",
    );
    assert.equal(
      lookup.handler.definition.dependencies.some((dependency) => dependency.dependencyId === "runtime.desktop.screenshotProvider.linux"),
      false,
      tool.id + " must not treat Linux screenshot provider selection as a model-callable dependency gate",
    );

    const runtimeProviderDependencies = (lookup.handler.definition.metadata as Record<string, unknown> | undefined)?.runtimeProviderDependencies as
      | Record<string, unknown>
      | undefined;
    assert.deepEqual(runtimeProviderDependencies?.linux, ["runtime.desktop.screenshotProvider.linux"]);
  }
});

test("computeruseBase screenshot handlers classify malformed handler input without raw TypeError", async () => {
  const registry = createBaseToolRegistry();
  const malformedInputs = [null, "bad", 1, []] as const;

  for (const tool of canonicalTools.filter((tool) => tool.group === "screenshot")) {
    const lookup = registry.lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id + " should resolve a registry handler");
    if (!lookup.ok) continue;

    for (const malformedInput of malformedInputs) {
      const result = await lookup.handler.invoke({
        toolCallId: `${tool.id}:malformed-input`,
        runtimeId: "computeruse-runtime-json-boundary",
        sessionId: "computeruse-session-json-boundary",
        executor: {},
        input: malformedInput as never,
      });
      assert.equal(result.ok, false, tool.id + " must reject malformed handler input");
      if (!result.ok) {
        assert.equal(result.error.publicSafe, true, tool.id + " malformed input error must be public-safe");
      }
    }
  }
});

test("computeruseBase screenshot runtime chain reaches runtime-owned executor ports through registry handlers", async () => {
  const runtimeId = "computeruse-runtime-chain";
  const sessionId = "computeruse-session-chain";
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async captureScreenshot(request) {
        calls.push(`capture:${request.target}`);
        return {
          ok: true,
          output: {
            artifactId: `artifact:screenshot:${request.target}`,
            mimeType: request.outputFormat ?? "image/png",
            metadata: { adapter: "fake-computeruse" },
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
            artifactId: "artifact:screenshot:stored",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: { adapter: "fake-artifact-store" },
          },
        };
      },
    },
  };
  const inputs: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    "computeruse.fullscreenScreenshot": {
      purpose: "inspect app state",
      target: { displayId: "display-1", outputFormat: "image/png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.windowScreenshot": {
      purpose: "inspect window state",
      target: { windowRef: "window-1", displayId: "display-1", outputFormat: "image/png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.rectangularSelectionScreenshot": {
      purpose: "inspect selected state",
      target: { displayId: "display-1", rect: { x: 0, y: 0, width: 100, height: 80 }, outputFormat: "image/png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.freeformScreenshot": {
      purpose: "inspect freeform state",
      target: { displayId: "display-1", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 80 }], outputFormat: "image/png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.screenshotStorage": {
      purpose: "retain screenshot evidence",
      target: {
        screenshotRef: "artifact:screenshot:latest",
        storageTarget: "session://screenshots/latest.png",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  };

  for (const tool of canonicalTools.filter((tool) => tool.group === "screenshot")) {
    const toolCallId = `${tool.id}:runtime-chain`;
    const input = inputs[tool.id];
    const adapted = adaptRuntimeToolInvocation({
      context: {
        runtimeId,
        sessionId,
        invocationId: toolCallId,
        requestedScopes: ["tool.execute", `tool.${tool.id}`],
        allowedScopes: ["tool.execute", `tool.${tool.id}`],
        auditMetadata: { test: "computeruseBase.screenshot.runtimeChain" },
      },
      toolId: tool.id,
      operation: tool.id,
      arguments: input,
      resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
    });
    assert.equal(adapted.ok, true, tool.id + " must pass the runtime tool invocation adapter");
    if (!adapted.ok) throw new Error(tool.id + " adapter failed");

    const bridged = bridgeExecEngineInvocation({
      runtimeId,
      caller: { kind: "application", id: "computeruse-runtime-chain-test", sessionId },
      invocation: {
        invocationId: toolCallId,
        kind: "tool",
        target: tool.id,
        payload: adapted.invocation,
        auditRef: adapted.invocation.audit.event,
      },
      runtimeReady: true,
    });
    assert.equal(bridged.ok, true, tool.id + " must pass the execEngine invocation bridge");
    if (!bridged.ok) throw new Error(tool.id + " bridge failed");

    const lookup = createBaseToolRegistry().lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id + " must be mounted in the baseTool registry");
    if (!lookup.ok) throw new Error(tool.id + " registry lookup failed");

    const result = await lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: input as never, executor });
    assert.equal(result.ok, true, tool.id + " runtime chain should execute through fake executor");
  }

  assert.deepEqual(calls, ["capture:fullscreen", "capture:window", "capture:region", "capture:freeform", "store:screenshot"]);
});

test("computeruseBase screenRecording runtime chain reaches runtime-owned executor ports through registry handlers", async () => {
  const runtimeId = "computeruse-screen-recording-runtime-chain";
  const sessionId = "computeruse-screen-recording-session-chain";
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async startRecording(request) {
        calls.push(`start:${String(request.target?.target ?? request.resource)}`);
        return {
          ok: true,
          output: {
            recordingId: `recording:screen:${String(request.target?.target ?? request.resource)}`,
            metadata: { adapter: "fake-computeruse-screen-recording" },
          },
        };
      },
      async stopRecording(request) {
        calls.push(`stop:${request.resource ?? "unknown"}:${request.storageTarget ?? "missing-storage-target"}`);
        return {
          ok: true,
          output: {
            artifactId: "artifact:video:screen-recording",
            mimeType: "video/webm",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: {
              adapter: "fake-computeruse-screen-recording",
            },
          },
        };
      },
    },
  };
  const inputs: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    "computeruse.fullscreenScreenRecording": {
      purpose: "record fullscreen workflow",
      target: { displayId: "display-1", maxDurationMs: 1000, includeCursor: true, includeAudio: false, outputFormat: "video/webm" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.windowScreenRecording": {
      purpose: "record window workflow",
      target: { windowId: "window-1", maxDurationMs: 1000, frameRate: 15, includeCursor: true, outputFormat: "video/webm" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.rectangularSelectionScreenRecording": {
      purpose: "record selected region workflow",
      target: {
        displayId: "display-1",
        rect: { x: 0, y: 0, width: 100, height: 80 },
        maxDurationMs: 1000,
        frameRate: 15,
        includeCursor: true,
        includeAudio: false,
        outputFormat: "video/webm",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.screenRecordingStorage": {
      purpose: "store screen recording evidence",
      target: {
        recordingRef: "recording:screen:fullscreen",
        storageTarget: "session://recordings/runtime-chain.webm",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  };

  for (const tool of canonicalTools.filter((tool) => tool.group === "screenRecording")) {
    const toolCallId = `${tool.id}:runtime-chain`;
    const input = inputs[tool.id];
    const adapted = adaptRuntimeToolInvocation({
      context: {
        runtimeId,
        sessionId,
        invocationId: toolCallId,
        requestedScopes: ["tool.execute", `tool.${tool.id}`],
        allowedScopes: ["tool.execute", `tool.${tool.id}`],
        auditMetadata: { test: "computeruseBase.screenRecording.runtimeChain" },
      },
      toolId: tool.id,
      operation: tool.id,
      arguments: input,
      resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
    });
    assert.equal(adapted.ok, true, tool.id + " must pass the runtime tool invocation adapter");
    if (!adapted.ok) throw new Error(tool.id + " adapter failed");

    const bridged = bridgeExecEngineInvocation({
      runtimeId,
      caller: { kind: "application", id: "computeruse-screen-recording-runtime-chain-test", sessionId },
      invocation: {
        invocationId: toolCallId,
        kind: "tool",
        target: tool.id,
        payload: adapted.invocation,
        auditRef: adapted.invocation.audit.event,
      },
      runtimeReady: true,
    });
    assert.equal(bridged.ok, true, tool.id + " must pass the execEngine invocation bridge");
    if (!bridged.ok) throw new Error(tool.id + " bridge failed");

    const lookup = createBaseToolRegistry().lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id + " must be mounted in the baseTool registry");
    if (!lookup.ok) throw new Error(tool.id + " registry lookup failed");

    const result = await lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: input as never, executor });
    assert.equal(result.ok, true, tool.id + " runtime chain should execute through fake executor");
  }

  assert.deepEqual(calls, [
    "start:fullscreen",
    "start:window",
    "start:region",
    "stop:screen:session://recordings/runtime-chain.webm",
  ]);
});

test("computeruseBase microphoneAccess runtime chain reaches runtime-owned executor ports through registry handlers", async () => {
  const runtimeId = "computeruse-microphone-runtime-chain";
  const sessionId = "computeruse-microphone-session-chain";
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async requestPermission(request) {
        calls.push(`permission-request:${request.resource}:${request.purpose}`);
        return {
          ok: true,
          output: {
            granted: true,
            leaseId: "lease:microphone:runtime-chain",
            metadata: { adapter: "fake-computeruse-microphone" },
          },
        };
      },
      async releasePermission(request) {
        calls.push(`permission-release:${request.resource}:${request.leaseId ?? "missing-lease"}`);
        return {
          ok: true,
          output: {
            released: true,
            metadata: { adapter: "fake-computeruse-microphone" },
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
            metadata: { adapter: "fake-computeruse-microphone" },
          },
        };
      },
      async startRecording(request) {
        calls.push(`start:${String(request.target?.target ?? request.resource)}`);
        return {
          ok: true,
          output: {
            recordingId: "recording:microphone:runtime-chain",
            metadata: { adapter: "fake-computeruse-microphone" },
          },
        };
      },
      async stopRecording(request) {
        calls.push(`stop:${request.resource ?? "unknown"}:${request.storageTarget ?? "missing-storage-target"}`);
        return {
          ok: true,
          output: {
            artifactId: "artifact:audio:microphone-recording",
            mimeType: "audio/webm",
            storageUri: request.storageTarget,
            metadata: { adapter: "fake-computeruse-microphone" },
          },
        };
      },
    },
  };
  const inputs: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    "computeruse.microphonePermissionRequest": {
      target: {
        targetApplication: "Praxis Agent",
        purpose: "record runtime-chain microphone test",
        deviceId: "studio-mic",
        mode: "recording",
        requestedDurationMs: 1000,
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.microphonePermissionRelease": {
      target: {
        permissionLeaseId: "lease:microphone:runtime-chain",
        targetApplication: "Praxis Agent",
        deviceId: "studio-mic",
        releaseReason: "runtime-chain cleanup",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.microphoneSelect": {
      target: {
        deviceId: "studio-mic",
        targetApplication: "Praxis Agent",
        permissionLeaseId: "lease:microphone:runtime-chain",
        selectionReason: "runtime-chain microphone selection",
        availableDevices: [{ id: "studio-mic", label: "Studio Mic", kind: "usb" }],
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.microphoneStartRecording": {
      purpose: "record runtime-chain microphone sample",
      target: {
        deviceId: "studio-mic",
        permissionLeaseId: "lease:microphone:runtime-chain",
        recordingLabel: "runtime-chain",
        destinationHint: "session://recordings/runtime-chain-start.webm",
        maxDurationMs: 1000,
        outputFormat: "audio/webm",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
    "computeruse.microphoneStopRecording": {
      purpose: "store runtime-chain microphone sample",
      target: {
        recordingId: "recording:microphone:runtime-chain",
        deviceId: "studio-mic",
        persistHint: "session://recordings/runtime-chain.webm",
        releaseDevice: true,
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  };

  for (const tool of canonicalTools.filter((tool) => tool.group === "microphoneAccess")) {
    const toolCallId = `${tool.id}:runtime-chain`;
    const input = inputs[tool.id];
    const adapted = adaptRuntimeToolInvocation({
      context: {
        runtimeId,
        sessionId,
        invocationId: toolCallId,
        requestedScopes: ["tool.execute", `tool.${tool.id}`],
        allowedScopes: ["tool.execute", `tool.${tool.id}`],
        auditMetadata: { test: "computeruseBase.microphoneAccess.runtimeChain" },
      },
      toolId: tool.id,
      operation: tool.id,
      arguments: input,
      resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
    });
    assert.equal(adapted.ok, true, tool.id + " must pass the runtime tool invocation adapter");
    if (!adapted.ok) throw new Error(tool.id + " adapter failed");

    const bridged = bridgeExecEngineInvocation({
      runtimeId,
      caller: { kind: "application", id: "computeruse-microphone-runtime-chain-test", sessionId },
      invocation: {
        invocationId: toolCallId,
        kind: "tool",
        target: tool.id,
        payload: adapted.invocation,
        auditRef: adapted.invocation.audit.event,
      },
      runtimeReady: true,
    });
    assert.equal(bridged.ok, true, tool.id + " must pass the execEngine invocation bridge");
    if (!bridged.ok) throw new Error(tool.id + " bridge failed");

    const lookup = createBaseToolRegistry().lookupHandler(tool.id);
    assert.equal(lookup.ok, true, tool.id + " must be mounted in the baseTool registry");
    if (!lookup.ok) throw new Error(tool.id + " registry lookup failed");

    const result = await lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: input as never, executor });
    assert.equal(result.ok, true, tool.id + " runtime chain should execute through fake executor");
  }

  assert.deepEqual(calls, [
    "permission-request:microphone:record runtime-chain microphone test",
    "permission-release:microphone:lease:microphone:runtime-chain",
    "select:microphone:studio-mic",
    "start:microphone",
    "stop:microphone:session://recordings/runtime-chain.webm",
  ]);
});
