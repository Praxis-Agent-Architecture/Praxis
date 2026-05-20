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
import { anthropicRectangularSelectionScreenshotPractice } from "./anthropic.js";
import { deepmindRectangularSelectionScreenshotPractice } from "./deepmind.js";
import {
  rectangularSelectionScreenshotDependencyDeclarations,
  type RectangularSelectionScreenshotDependencies,
  type RectangularSelectionScreenshotPracticeProviderName,
  type RectangularSelectionScreenshotProviderPractice,
} from "./dependencies.js";
import { openaiRectangularSelectionScreenshotPractice } from "./openai.js";
import {
  executeRectangularSelectionScreenshot as executeRectangularSelectionScreenshotCore,
  rectangularSelectionScreenshotDescriptor,
  planRectangularSelectionScreenshot,
  type RectangularSelectionScreenshotOutput,
  type RectangularSelectionScreenshotProvider,
  type RectangularSelectionScreenshotRequest,
} from "./core.js";

export type RectangularSelectionScreenshotBestPracticeRequest = RectangularSelectionScreenshotRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: RectangularSelectionScreenshotPracticeProviderName;
};

export type RectangularSelectionScreenshotHandlerInput = Omit<RectangularSelectionScreenshotBestPracticeRequest, "executor">;

export type RectangularSelectionScreenshotPracticeSelection = {
  providerName: RectangularSelectionScreenshotPracticeProviderName;
  practice: RectangularSelectionScreenshotProviderPractice;
  provider?: RectangularSelectionScreenshotProvider;
};

export const rectangularSelectionScreenshotProviderPractices = [
  anthropicRectangularSelectionScreenshotPractice,
  openaiRectangularSelectionScreenshotPractice,
  deepmindRectangularSelectionScreenshotPractice,
] as const;

export const rectangularSelectionScreenshotBestPracticeDescriptor = {
  toolId: "computeruse.rectangularSelectionScreenshot",
  bestPractice: "storage-owned-runtime-computeruse-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: rectangularSelectionScreenshotDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: RectangularSelectionScreenshotProviderPractice = {
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

export function selectRectangularSelectionScreenshotPractice(
  dependencies: RectangularSelectionScreenshotDependencies & {
    preferredProvider?: RectangularSelectionScreenshotPracticeProviderName;
  } = {},
): RectangularSelectionScreenshotPracticeSelection {
  return selectComputerUseProviderPractice(
    rectangularSelectionScreenshotProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as RectangularSelectionScreenshotPracticeSelection;
}

export async function executeRectangularSelectionScreenshot(
  request: RectangularSelectionScreenshotBestPracticeRequest = {},
): ReturnType<typeof executeRectangularSelectionScreenshotCore> {
  const selection = selectRectangularSelectionScreenshotPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildComputerUsePracticeAuditMetadata(selection);
  return executeRectangularSelectionScreenshotCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const rectangularSelectionScreenshotBaseToolDefinition = createComputerUseBaseToolDefinition<
  RectangularSelectionScreenshotHandlerInput,
  RectangularSelectionScreenshotOutput
>({
  toolId: rectangularSelectionScreenshotDescriptor.toolId,
  title: "Computer Use Rectangular Selection Screenshot",
  description: "Capture a rectangular selection screenshot through governed runtime computer-use support.",
  summary: "Use computeruse.rectangularSelectionScreenshot to request a runtime-owned rectangular selection screenshot artifact.",
  storageGroup: "screenshot",
  riskLevel: "risky",
  permissionHints: ["device:screen", "screen:read", "display:capture"],
  dependencies: rectangularSelectionScreenshotDependencyDeclarations,
  inputSchema: jsonSchema("computeruse.rectangularSelectionScreenshot.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          displayId: { type: "string" },
          rect: { type: "object", additionalProperties: true },
          region: { type: "object", additionalProperties: true },
          coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
          outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
        },
      },
      displayId: { type: "string" },
      rect: { type: "object", additionalProperties: true },
      region: { type: "object", additionalProperties: true },
      coordinateSpace: { type: "string", enum: ["screen", "window", "normalized"] },
      outputFormat: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
      purpose: { type: "string" },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("computeruse.rectangularSelectionScreenshot.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "purpose", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "captureEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.computeruse.rectangularSelectionScreenshot" },
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
      "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot.ts",
    runtimeProviderDependencies: {
      linux: ["runtime.desktop.screenshotProvider.linux"],
    },
  },
});

export const rectangularSelectionScreenshotHandler: BaseToolHandler<RectangularSelectionScreenshotHandlerInput, RectangularSelectionScreenshotOutput> =
  createComputerUseCoreHandler(rectangularSelectionScreenshotBaseToolDefinition, async (request) => {
    const rawInput: unknown = request.input;
    if (!isRecord(rawInput)) {
      return executeRectangularSelectionScreenshotCore(rawInput);
    }
    const selection = selectRectangularSelectionScreenshotPractice({
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

    return executeRectangularSelectionScreenshotCore({
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

export { executeRectangularSelectionScreenshotCore, rectangularSelectionScreenshotDescriptor, planRectangularSelectionScreenshot };

export type {
  RectangularSelectionScreenshotAuditEvent,
  RectangularSelectionScreenshotBoundary,
  RectangularSelectionScreenshotContext,
  RectangularSelectionScreenshotError,
  RectangularSelectionScreenshotErrorCode,
  RectangularSelectionScreenshotGate,
  RectangularSelectionScreenshotOutput,
  RectangularSelectionScreenshotProvider,
  RectangularSelectionScreenshotProviderRequest,
  RectangularSelectionScreenshotProviderResult,
  RectangularSelectionScreenshotRect,
  RectangularSelectionScreenshotRequest,
  RectangularSelectionScreenshotResult,
  RectangularSelectionScreenshotTarget,
} from "./core.js";
