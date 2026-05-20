import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildOmniPracticeAuditMetadata, createOmniBaseToolDefinition, createOmniCoreHandler, injectRuntimeInvocationMetadata, jsonSchema, selectOmniProviderPractice } from "../../_shared/baseToolAdapter.js";
import { anthropicOmniViewImagePractice } from "./anthropic.js";
import { deepmindOmniViewImagePractice } from "./deepmind.js";
import {
  omniViewImageDependencyDeclarations,
  type OmniViewImageDependencies,
  type OmniViewImagePracticeProviderName,
  type OmniViewImageProviderPractice,
} from "./dependencies.js";
import { openaiOmniViewImagePractice } from "./openai.js";
import {
  executeOmniViewImage as executeOmniViewImageCore,
  omniViewImageDescriptor,
  planOmniViewImage,
  type OmniViewImageOutput,
  type OmniViewImageProvider,
  type OmniViewImageRequest,
} from "./core.js";

export type OmniViewImageBestPracticeRequest = OmniViewImageRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: OmniViewImagePracticeProviderName;
};

export type OmniViewImageHandlerInput = Omit<OmniViewImageBestPracticeRequest, "executor">;

export type OmniViewImagePracticeSelection = {
  providerName: OmniViewImagePracticeProviderName;
  practice: OmniViewImageProviderPractice;
  provider?: OmniViewImageProvider;
};

export const omniViewImageProviderPractices = [
  anthropicOmniViewImagePractice,
  openaiOmniViewImagePractice,
  deepmindOmniViewImagePractice,
] as const;

export const omniViewImageBestPracticeDescriptor = {
  toolId: "omni.viewImage",
  bestPractice: "storage-owned-runtime-omni-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: omniViewImageDependencyDeclarations,
} as const;

const praxisNativeFallbackPractice: OmniViewImageProviderPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis dry-run fallback",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["No runtime omni provider is available; dry-run remains available."],
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

export function selectOmniViewImagePractice(
  dependencies: OmniViewImageDependencies & {
    preferredProvider?: OmniViewImagePracticeProviderName;
  } = {},
): OmniViewImagePracticeSelection {
  return selectOmniProviderPractice(
    omniViewImageProviderPractices,
    dependencies,
    praxisNativeFallbackPractice,
  ) as OmniViewImagePracticeSelection;
}

export async function executeOmniViewImage(request: OmniViewImageBestPracticeRequest = {}): ReturnType<typeof executeOmniViewImageCore> {
  const selection = selectOmniViewImagePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const auditMetadata = buildOmniPracticeAuditMetadata(selection);
  return executeOmniViewImageCore({
    ...request,
    provider: selection.provider,
    context: mergeContextWithAuditMetadata(request.context, auditMetadata),
  });
}

export const omniViewImageBaseToolDefinition = createOmniBaseToolDefinition<
  OmniViewImageHandlerInput,
  OmniViewImageOutput
>({
  toolId: omniViewImageDescriptor.toolId,
  title: "Omni View Image",
  description: "Prepare an image view request through governed runtime omni support.",
  summary: "Use omni.viewImage to pass an image reference to the runtime/modelAdapter image preparation path.",
  storageGroup: "imageTransformer",
  riskLevel: "normal",
  permissionHints: ["filesystem:read", "omni:image:view"],
  dependencies: omniViewImageDependencyDeclarations,
  inputSchema: jsonSchema("omni.viewImage.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          imagePath: { type: "string" },
          imageRef: { type: "string" },
          mediaType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp", "image/gif", "unknown"] },
          detail: { type: "string", enum: ["low", "high", "original"] },
          maxBytes: { type: "integer", minimum: 1 },
        },
      },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("omni.viewImage.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "viewEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.omni.viewImage" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-omni"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      viewEnvelope: { type: "object" },
    },
  }),
  storagePolicy: {
    storesMaterial: true,
    storesResult: true,
    storesAudit: true,
    reusable: false,
  },
});

export const omniViewImageHandler: BaseToolHandler<OmniViewImageHandlerInput, OmniViewImageOutput> =
  createOmniCoreHandler(omniViewImageBaseToolDefinition, async (request) => {
    const selection = selectOmniViewImagePractice({
      ...request.input,
      executor: request.executor,
    });
    const auditMetadata = injectRuntimeInvocationMetadata(
      buildOmniPracticeAuditMetadata(selection),
      isRecord(request.input.context) && isRecord(request.input.context.auditMetadata)
        ? request.input.context.auditMetadata
        : undefined,
      request,
    );

    return executeOmniViewImageCore({
      ...request.input,
      provider: selection.provider,
      context: {
        ...(isRecord(request.input.context) ? request.input.context : {}),
        runtimeId: isRecord(request.input.context) && typeof request.input.context.runtimeId === "string"
          ? request.input.context.runtimeId
          : request.runtimeId,
        sessionId: isRecord(request.input.context) && typeof request.input.context.sessionId === "string"
          ? request.input.context.sessionId
          : request.sessionId,
        invocationId: isRecord(request.input.context) && typeof request.input.context.invocationId === "string"
          ? request.input.context.invocationId
          : request.toolCallId,
        auditMetadata,
      },
    });
  });

export { executeOmniViewImageCore, omniViewImageDescriptor, planOmniViewImage };

export type {
  OmniViewImageAuditEvent,
  OmniViewImageBoundary,
  OmniViewImageContext,
  OmniViewImageDetail,
  OmniViewImageError,
  OmniViewImageErrorCode,
  OmniViewImageGate,
  OmniViewImageMediaType,
  OmniViewImageOutput,
  OmniViewImagePermission,
  OmniViewImageProvider,
  OmniViewImageProviderRequest,
  OmniViewImageProviderResult,
  OmniViewImageRequest,
  OmniViewImageResult,
  OmniViewImageTarget,
} from "./core.js";
