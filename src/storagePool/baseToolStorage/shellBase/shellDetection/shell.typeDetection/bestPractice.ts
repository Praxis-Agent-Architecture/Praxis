import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellTypeDetectionPractice } from "./anthropic.js";
import { deepmindShellTypeDetectionPractice } from "./deepmind.js";
import { openaiShellTypeDetectionPractice } from "./openai.js";
import {
  adaptShellToolResultToInvokeResult,
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellTypeDetection as executeShellTypeDetectionCore,
  type ShellTypeDetectionOutput,
  type ShellTypeDetectionProvider,
  type ShellTypeDetectionRequest,
} from "./core.js";
import {
  shellTypeDetectionDependencyDeclarations,
  type ShellTypeDetectionDependencies,
  type ShellTypeDetectionPracticeProviderName,
  type ShellTypeDetectionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellTypeDetectionBestPracticeRequest = ShellTypeDetectionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellTypeDetectionPracticeProviderName;
};

export type ShellTypeDetectionHandlerInput = Omit<ShellTypeDetectionBestPracticeRequest, "executor">;

export type ShellTypeDetectionPracticeSelection = {
  providerName: ShellTypeDetectionPracticeProviderName;
  practice: ShellTypeDetectionProviderPractice;
  provider?: ShellTypeDetectionProvider;
};

export const shellTypeDetectionProviderPractices = [
  anthropicShellTypeDetectionPractice,
  openaiShellTypeDetectionPractice,
  deepmindShellTypeDetectionPractice,
] as const;

function orderedPractices(
  preferredProvider: ShellTypeDetectionPracticeProviderName | undefined,
): readonly ShellTypeDetectionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellTypeDetectionProviderPractices;
  }

  return [
    ...shellTypeDetectionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellTypeDetectionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellTypeDetectionPractice(
  dependencies: ShellTypeDetectionDependencies & {
    preferredProvider?: ShellTypeDetectionPracticeProviderName;
  } = {},
): ShellTypeDetectionPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return { providerName: practice.providerName, practice, provider };
    }
  }

  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or host shell type provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function auditMetadata(selection: ShellTypeDetectionPracticeSelection): Readonly<Record<string, unknown>> {
  return buildShellPracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function requestValue(value: unknown): ShellTypeDetectionBestPracticeRequest {
  return recordValue(value) as ShellTypeDetectionBestPracticeRequest;
}

export async function executeShellTypeDetection(
  request: ShellTypeDetectionBestPracticeRequest = {},
): ReturnType<typeof executeShellTypeDetectionCore> {
  const normalizedRequest = requestValue(request);
  const context = recordValue(normalizedRequest.context) as NonNullable<ShellTypeDetectionRequest["context"]>;
  const selection = selectShellTypeDetectionPractice({
    executor: normalizedRequest.executor,
    provider: normalizedRequest.provider,
    preferredProvider: normalizedRequest.preferredProvider,
  });
  return executeShellTypeDetectionCore({
    ...normalizedRequest,
    provider: selection.provider,
    context: {
      ...context,
      auditMetadata: {
        ...recordValue(context.auditMetadata),
        ...auditMetadata(selection),
      },
    },
  });
}

const shellDetectionContextSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    runtimeId: { type: "string" },
    sessionId: { type: "string" },
    invocationId: { type: "string" },
    dryRun: { type: "boolean" },
    guard: {
      type: "object",
      additionalProperties: true,
      properties: {
        allowed: { type: "boolean" },
        accepted: { type: "boolean" },
        reason: { type: "string" },
      },
    },
  },
} as const;

export const shellTypeDetectionBestPracticeDescriptor = {
  toolId: "shell.typeDetection",
  bestPractice: "runtime-execEngine-shellTypeProvider",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellTypeDetectionDependencyDeclarations,
} as const;

export const shellTypeDetectionBaseToolDefinition = createShellBaseToolDefinition<
  ShellTypeDetectionHandlerInput,
  ShellTypeDetectionOutput
>({
  toolId: "shell.typeDetection",
  title: "Shell Type Detection",
  description: "Detect shell type from hints or a governed runtime shell provider.",
  summary: "Use shell.typeDetection to classify shell identity while runtime owns real probing.",
  storageGroup: "shellDetection",
  riskLevel: "normal",
  permissionHints: ["shell:detect"],
  dependencies: shellTypeDetectionDependencyDeclarations,
  inputSchema: jsonSchema("shell.typeDetection.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      shellPath: { type: "string" },
      executableName: { type: "string" },
      envShell: { type: "string" },
      platform: { type: "string" },
      context: shellDetectionContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
});

export const shellTypeDetectionHandler: BaseToolHandler<
  ShellTypeDetectionHandlerInput,
  ShellTypeDetectionOutput
> = {
  definition: shellTypeDetectionBaseToolDefinition,
  async invoke(request) {
    const input = recordValue(request.input) as ShellTypeDetectionHandlerInput;
    const inputContext = recordValue(input.context) as NonNullable<ShellTypeDetectionHandlerInput["context"]>;
    const practice = selectShellTypeDetectionPractice({
      ...input,
      executor: request.executor,
    });

    const result = await executeShellTypeDetectionCore({
      ...input,
      provider: practice.provider,
      context: {
        ...inputContext,
        runtimeId: inputContext.runtimeId ?? request.runtimeId,
        sessionId: inputContext.sessionId ?? request.sessionId,
        invocationId: inputContext.invocationId ?? request.toolCallId,
        auditMetadata: injectRuntimeInvocationMetadata(
          {
            ...auditMetadata(practice),
            ...recordValue(request.metadata),
          },
          recordValue(inputContext.auditMetadata),
          request,
        ),
      },
    });

    return adaptShellToolResultToInvokeResult(result);
  },
};
