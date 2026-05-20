import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildComputerUsePracticeAuditMetadata,
  createComputerUseBaseToolDefinition,
  createComputerUseCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectComputerUseProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import { anthropicFreeformScreenshotPractice } from "./anthropic.js";
import { deepmindFreeformScreenshotPractice } from "./deepmind.js";
import {
  freeformScreenshotDependencyDeclarations,
  type FreeformScreenshotDependencies,
  type FreeformScreenshotPracticeProviderName,
  type FreeformScreenshotProviderPractice,
} from "./dependencies.js";
import { openaiFreeformScreenshotPractice } from "./openai.js";
import {
  executeFreeformScreenshot as executeFreeformScreenshotCore,
  freeformScreenshotDescriptor,
  planFreeformScreenshot,
  type FreeformScreenshotOutput,
  type FreeformScreenshotProvider,
  type FreeformScreenshotRequest,
} from "./core.js";

export type FreeformScreenshotBestPracticeRequest = FreeformScreenshotRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: FreeformScreenshotPracticeProviderName;
};

export type FreeformScreenshotHandlerInput = Omit<FreeformScreenshotBestPracticeRequest, "executor">;

export type FreeformScreenshotPracticeSelection = {
  providerName: FreeformScreenshotPracticeProviderName;
  practice: FreeformScreenshotProviderPractice;
  provider?: FreeformScreenshotProvider;
};

export const freeformScreenshotProviderPractices = [
  anthropicFreeformScreenshotPractice,
  openaiFreeformScreenshotPractice,
  deepmindFreeformScreenshotPractice,
] as const;

export const freeformScreenshotBestPracticeDescriptor = {
  toolId: "computeruse.freeformScreenshot",
  bestPractice: "storage-owned-runtime-computeruse-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: freeformScreenshotDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: FreeformScreenshotProviderPractice = {
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

export function selectFreeformScreenshotPractice(
  dependencies: FreeformScreenshotDependencies & {
    preferredProvider?: FreeformScreenshotPracticeProviderName;
  } = {},
): FreeformScreenshotPracticeSelection {
  return selectComputerUseProviderPractice(
    freeformScreenshotProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as FreeformScreenshotPracticeSelection;
}

export async function executeFreeformScreenshot(
  request: FreeformScreenshotBestPracticeRequest = {},
): ReturnType<typeof executeFreeformScreenshotCore> {
  const selection = selectFreeformScreenshotPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeFreeformScreenshotCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const freeformScreenshotBaseToolDefinition = createComputerUseBaseToolDefinition<
  FreeformScreenshotHandlerInput,
  FreeformScreenshotOutput
>({
  toolId: freeformScreenshotDescriptor.toolId,
  title: "Computer Use Freeform Screenshot",
  description: "Capture a freeform screenshot through governed runtime computer-use support.",
  summary: "Use computeruse.freeformScreenshot to request a runtime-owned freeform screenshot artifact.",
  storageGroup: "screenshot",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:read", "display:capture"],
  dependencies: freeformScreenshotDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.freeformScreenshot.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          displayId: { type: "string" },
          points: { type: "array", items: { type: "object", additionalProperties: true } },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
        },
      },
      displayId: { type: "string" },
      points: { type: "array", items: { type: "object", additionalProperties: true } },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.freeformScreenshot.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "captureEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.freeformScreenshot" },
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
      "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.ts",
    runtimeProviderDependencies: {
      linux: ["runtime.desktop.screenshotProvider.linux"],
    },
  },
});

export const freeformScreenshotHandler: BaseToolHandler<FreeformScreenshotHandlerInput, FreeformScreenshotOutput> =
  createComputerUseCoreHandler(freeformScreenshotBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeFreeformScreenshotCore(rawInput);
    }
    const selection = selectFreeformScreenshotPractice({
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

    return executeFreeformScreenshotCore({
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

export { executeFreeformScreenshotCore, freeformScreenshotDescriptor, planFreeformScreenshot };

export type {
  FreeformScreenshotAuditEvent,
  FreeformScreenshotBoundary,
  FreeformScreenshotContext,
  FreeformScreenshotError,
  FreeformScreenshotErrorCode,
  FreeformScreenshotGate,
  FreeformScreenshotOutput,
  FreeformScreenshotPoint,
  FreeformScreenshotProvider,
  FreeformScreenshotProviderRequest,
  FreeformScreenshotProviderResult,
  FreeformScreenshotRect,
  FreeformScreenshotRequest,
  FreeformScreenshotResult,
  FreeformScreenshotTarget,
} from "./core.js";
