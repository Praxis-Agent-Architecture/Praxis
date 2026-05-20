import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildComputerUsePracticeAuditMetadata,
  createComputerUseBaseToolDefinition,
  createComputerUseCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectComputerUseProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import { anthropicFullscreenScreenshotPractice } from "./anthropic.js";
import { deepmindFullscreenScreenshotPractice } from "./deepmind.js";
import {
  fullscreenScreenshotDependencyDeclarations,
  type FullscreenScreenshotDependencies,
  type FullscreenScreenshotPracticeProviderName,
  type FullscreenScreenshotProviderPractice,
} from "./dependencies.js";
import { openaiFullscreenScreenshotPractice } from "./openai.js";
import {
  executeFullscreenScreenshot as executeFullscreenScreenshotCore,
  fullscreenScreenshotDescriptor,
  planFullscreenScreenshot,
  type FullscreenScreenshotOutput,
  type FullscreenScreenshotProvider,
  type FullscreenScreenshotRequest,
} from "./core.js";

export type FullscreenScreenshotBestPracticeRequest = FullscreenScreenshotRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: FullscreenScreenshotPracticeProviderName;
};

export type FullscreenScreenshotHandlerInput = Omit<FullscreenScreenshotBestPracticeRequest, "executor">;

export type FullscreenScreenshotPracticeSelection = {
  providerName: FullscreenScreenshotPracticeProviderName;
  practice: FullscreenScreenshotProviderPractice;
  provider?: FullscreenScreenshotProvider;
};

export const fullscreenScreenshotProviderPractices = [
  anthropicFullscreenScreenshotPractice,
  openaiFullscreenScreenshotPractice,
  deepmindFullscreenScreenshotPractice,
] as const;

export const fullscreenScreenshotBestPracticeDescriptor = {
  toolId: "computeruse.fullscreenScreenshot",
  bestPractice: "storage-owned-runtime-computeruse-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: fullscreenScreenshotDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: FullscreenScreenshotProviderPractice = {
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

export function selectFullscreenScreenshotPractice(
  dependencies: FullscreenScreenshotDependencies & {
    preferredProvider?: FullscreenScreenshotPracticeProviderName;
  } = {},
): FullscreenScreenshotPracticeSelection {
  return selectComputerUseProviderPractice(
    fullscreenScreenshotProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as FullscreenScreenshotPracticeSelection;
}

export async function executeFullscreenScreenshot(
  request: FullscreenScreenshotBestPracticeRequest = {},
): ReturnType<typeof executeFullscreenScreenshotCore> {
  const selection = selectFullscreenScreenshotPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeFullscreenScreenshotCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const fullscreenScreenshotBaseToolDefinition = createComputerUseBaseToolDefinition<
  FullscreenScreenshotHandlerInput,
  FullscreenScreenshotOutput
>({
  toolId: fullscreenScreenshotDescriptor.toolId,
  title: "Computer Use Fullscreen Screenshot",
  description: "Capture a fullscreen screenshot through governed runtime computer-use support.",
  summary: "Use computeruse.fullscreenScreenshot to request a runtime-owned fullscreen screenshot artifact.",
  storageGroup: "screenshot",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:read", "display:capture"],
  dependencies: fullscreenScreenshotDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.fullscreenScreenshot.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          displayId: { type: "string" },
          outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
        },
      },
      displayId: { type: "string" },
      outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.fullscreenScreenshot.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "captureEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.fullscreenScreenshot" },
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
  metadata: {
    invocationEntryPath:
      "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.ts",
    runtimeProviderDependencies: {
      linux: ["runtime.desktop.screenshotProvider.linux"],
    },
  },
});

export const fullscreenScreenshotHandler: BaseToolHandler<FullscreenScreenshotHandlerInput, FullscreenScreenshotOutput> =
  createComputerUseCoreHandler(fullscreenScreenshotBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeFullscreenScreenshotCore(rawInput);
    }
    const selection = selectFullscreenScreenshotPractice({
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

    return executeFullscreenScreenshotCore({
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

export { executeFullscreenScreenshotCore, fullscreenScreenshotDescriptor, planFullscreenScreenshot };

export type {
  FullscreenScreenshotAuditEvent,
  FullscreenScreenshotBoundary,
  FullscreenScreenshotContext,
  FullscreenScreenshotError,
  FullscreenScreenshotErrorCode,
  FullscreenScreenshotGate,
  FullscreenScreenshotOutput,
  FullscreenScreenshotProvider,
  FullscreenScreenshotProviderRequest,
  FullscreenScreenshotProviderResult,
  FullscreenScreenshotRequest,
  FullscreenScreenshotResult,
  FullscreenScreenshotTarget,
} from "./core.js";
