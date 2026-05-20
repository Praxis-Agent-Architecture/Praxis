import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellSessionDetectionPractice } from "./anthropic.js";
import { deepmindShellSessionDetectionPractice } from "./deepmind.js";
import { openaiShellSessionDetectionPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  createShellCoreHandler,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeShellSessionDetection as executeShellSessionDetectionCore,
  type ShellSessionDetectionOutput,
  type ShellSessionDetectionProvider,
  type ShellSessionDetectionRequest,
} from "./core.js";
import {
  shellSessionDetectionDependencyDeclarations,
  type ShellSessionDetectionDependencies,
  type ShellSessionDetectionPracticeProviderName,
  type ShellSessionDetectionProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellSessionDetectionBestPracticeRequest = ShellSessionDetectionRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellSessionDetectionPracticeProviderName;
};

export type ShellSessionDetectionHandlerInput = Omit<ShellSessionDetectionBestPracticeRequest, "executor">;

export type ShellSessionDetectionPracticeSelection = {
  providerName: ShellSessionDetectionPracticeProviderName;
  practice: ShellSessionDetectionProviderPractice;
  provider?: ShellSessionDetectionProvider;
};

export const shellSessionDetectionProviderPractices = [
  anthropicShellSessionDetectionPractice,
  openaiShellSessionDetectionPractice,
  deepmindShellSessionDetectionPractice,
] as const;

function orderedPractices(
  preferredProvider: ShellSessionDetectionPracticeProviderName | undefined,
): readonly ShellSessionDetectionProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellSessionDetectionProviderPractices;
  }

  return [
    ...shellSessionDetectionProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellSessionDetectionProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellSessionDetectionPractice(
  dependencies: ShellSessionDetectionDependencies & {
    preferredProvider?: ShellSessionDetectionPracticeProviderName;
  } = {},
): ShellSessionDetectionPracticeSelection {
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
      notes: ["No injected or host session detection provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function auditMetadata(selection: ShellSessionDetectionPracticeSelection): Readonly<Record<string, unknown>> {
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

function requestValue(value: unknown): ShellSessionDetectionBestPracticeRequest {
  return recordValue(value) as ShellSessionDetectionBestPracticeRequest;
}

export async function executeShellSessionDetection(
  request: ShellSessionDetectionBestPracticeRequest = {},
): ReturnType<typeof executeShellSessionDetectionCore> {
  const normalizedRequest = requestValue(request);
  const context = recordValue(normalizedRequest.context) as NonNullable<ShellSessionDetectionRequest["context"]>;
  const selection = selectShellSessionDetectionPractice({
    executor: normalizedRequest.executor,
    provider: normalizedRequest.provider,
    preferredProvider: normalizedRequest.preferredProvider,
  });
  return executeShellSessionDetectionCore({
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

export const shellSessionDetectionBestPracticeDescriptor = {
  toolId: "shell.sessionDetection",
  bestPractice: "runtime-execEngine-shellSessionProvider",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellSessionDetectionDependencyDeclarations,
} as const;

export const shellSessionDetectionBaseToolDefinition = createShellBaseToolDefinition<
  ShellSessionDetectionHandlerInput,
  ShellSessionDetectionOutput
>({
  toolId: "shell.sessionDetection",
  title: "Shell Session Detection",
  description: "Detect shell session shape through dry-run hints or a governed runtime shell provider.",
  summary: "Use shell.sessionDetection to classify session material while runtime owns process access.",
  storageGroup: "shellDetection",
  riskLevel: "risky",
  permissionHints: ["shell:session:detect"],
  dependencies: shellSessionDetectionDependencyDeclarations,
  inputSchema: jsonSchema("shell.sessionDetection.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        properties: {
          sessionId: { type: "string" },
          processId: { type: "integer", minimum: 1 },
          tty: { type: "string" },
          shellExecutable: { type: "string" },
          knownInteractive: { type: "boolean" },
        },
      },
      context: shellDetectionContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
});

export const shellSessionDetectionHandler: BaseToolHandler<
  ShellSessionDetectionHandlerInput,
  ShellSessionDetectionOutput
> = createShellCoreHandler(shellSessionDetectionBaseToolDefinition, async (request) => {
  const input = recordValue(request.input) as ShellSessionDetectionHandlerInput;
  const inputContext = recordValue(input.context) as NonNullable<ShellSessionDetectionHandlerInput["context"]>;
  const practice = selectShellSessionDetectionPractice({
    ...input,
    executor: request.executor,
  });

  return executeShellSessionDetectionCore({
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
});
