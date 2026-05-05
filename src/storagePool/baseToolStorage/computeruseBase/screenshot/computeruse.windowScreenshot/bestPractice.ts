import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildComputerUsePracticeAuditMetadata,
  createComputerUseBaseToolDefinition,
  createComputerUseCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectComputerUseProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import { anthropicWindowScreenshotPractice } from "./anthropic.js";
import { deepmindWindowScreenshotPractice } from "./deepmind.js";
import {
  windowScreenshotDependencyDeclarations,
  type WindowScreenshotDependencies,
  type WindowScreenshotPracticeProviderName,
  type WindowScreenshotProviderPractice,
} from "./dependencies.js";
import { openaiWindowScreenshotPractice } from "./openai.js";
import {
  executeWindowScreenshot as executeWindowScreenshotCore,
  windowScreenshotDescriptor,
  planWindowScreenshot,
  type WindowScreenshotOutput,
  type WindowScreenshotProvider,
  type WindowScreenshotRequest,
} from "./core.js";

export type WindowScreenshotBestPracticeRequest = WindowScreenshotRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: WindowScreenshotPracticeProviderName;
};

export type WindowScreenshotHandlerInput = Omit<WindowScreenshotBestPracticeRequest, "executor">;

export type WindowScreenshotPracticeSelection = {
  providerName: WindowScreenshotPracticeProviderName;
  practice: WindowScreenshotProviderPractice;
  provider?: WindowScreenshotProvider;
};

export const windowScreenshotProviderPractices = [
  anthropicWindowScreenshotPractice,
  openaiWindowScreenshotPractice,
  deepmindWindowScreenshotPractice,
] as const;

export const windowScreenshotBestPracticeDescriptor = {
  toolId: "computeruse.windowScreenshot",
  bestPractice: "storage-owned-runtime-computeruse-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: windowScreenshotDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: WindowScreenshotProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime computeruse provider is available; dry-run remains available."],
  createProvider: () => undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeContextWithAuditMetadata(
  context: unknown,
  auditMetadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!isRecord(context)) {
    return { auditMetadata };
  }
  return {
    ...context,
    auditMetadata: {
      ...(isRecord(context.auditMetadata) ? context.auditMetadata : {}),
      ...auditMetadata,
    },
  };
}

export function selectWindowScreenshotPractice(
  dependencies: WindowScreenshotDependencies & {
    preferredProvider?: WindowScreenshotPracticeProviderName;
  } = {},
): WindowScreenshotPracticeSelection {
  return selectComputerUseProviderPractice(
    windowScreenshotProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as WindowScreenshotPracticeSelection;
}

export async function executeWindowScreenshot(
  request: WindowScreenshotBestPracticeRequest = {},
): ReturnType<typeof executeWindowScreenshotCore> {
  const selection = selectWindowScreenshotPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeWindowScreenshotCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const windowScreenshotBaseToolDefinition = createComputerUseBaseToolDefinition<
  WindowScreenshotHandlerInput,
  WindowScreenshotOutput
>({
  toolId: windowScreenshotDescriptor.toolId,
  title: "Computer Use Window Screenshot",
  description: "Capture a window screenshot through governed runtime computer-use support.",
  summary: "Use computeruse.windowScreenshot to request a runtime-owned window screenshot artifact.",
  storageGroup: "screenshot",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:read", "display:capture"],
  dependencies: windowScreenshotDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.windowScreenshot.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          displayId: { type: "string" },
          windowRef: { type: "string" },
          windowId: { type: "string" },
          titleHint: { type: "string" },
          outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
          includeWindowFrame: { type: "boolean" },
        },
      },
      displayId: { type: "string" },
      windowRef: { type: "string" },
      titleHint: { type: "string" },
      includeWindowFrame: { type: "boolean" },
      outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.windowScreenshot.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "captureEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.windowScreenshot" },
      target: { type: "object" },
      purpose: { type: "string" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-computeruse"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      captureEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: true,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const windowScreenshotHandler: BaseToolHandler<WindowScreenshotHandlerInput, WindowScreenshotOutput> =
  createComputerUseCoreHandler(windowScreenshotBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeWindowScreenshotCore(rawInput);
    }
    const selection = selectWindowScreenshotPractice({
      ...rawInput,
      executor: request.executor,
    });
    const auditMetadata = injectRuntimeInvocationMetadata(
      buildComputerUsePracticeAuditMetadata(selection),
      isRecord(rawInput.context) && isRecord(rawInput.context.auditMetadata)
        ? rawInput.context.auditMetadata
        : undefined,
      request,
    );

    return executeWindowScreenshotCore({
      ...rawInput,
      provider: selection.provider,
      context: {
        ...(isRecord(rawInput.context) ? rawInput.context : {}),
        runtimeId: isRecord(rawInput.context) && typeof rawInput.context.runtimeId === "string"
          ? rawInput.context.runtimeId
          : request.runtimeId,
        sessionId: isRecord(rawInput.context) && typeof rawInput.context.sessionId === "string"
          ? rawInput.context.sessionId
          : request.sessionId,
        invocationId: isRecord(rawInput.context) && typeof rawInput.context.invocationId === "string"
          ? rawInput.context.invocationId
          : request.toolCallId,
        auditMetadata,
      },
    });
  });

export { executeWindowScreenshotCore, windowScreenshotDescriptor, planWindowScreenshot };

export type {
  WindowScreenshotAuditEvent,
  WindowScreenshotBoundary,
  WindowScreenshotContext,
  WindowScreenshotError,
  WindowScreenshotErrorCode,
  WindowScreenshotGate,
  WindowScreenshotOutput,
  WindowScreenshotProvider,
  WindowScreenshotProviderRequest,
  WindowScreenshotProviderResult,
  WindowScreenshotRequest,
  WindowScreenshotResult,
  WindowScreenshotTarget,
} from "./core.js";
