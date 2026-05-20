import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellPromptHandlingPractice } from "./anthropic.js";
import { deepmindShellPromptHandlingPractice } from "./deepmind.js";
import { openaiShellPromptHandlingPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  planShellPromptHandling as planShellPromptHandlingCore,
  type ShellPromptHandlingOutput,
  type ShellPromptHandlingRequest,
  type ShellPromptHandlingResult,
} from "./core.js";
import {
  promptHandlingDependencyDeclarations,
  type ShellPromptHandlingDependencies,
  type ShellPromptHandlingPracticeProviderName,
  type ShellPromptHandlingProvider,
  type ShellPromptHandlingProviderPractice,
} from "./dependencies.js";
import {
  contextAuditMetadata,
  hasAffirmativeGuard,
  jsonRecord,
  runtimeIdIsMalformed,
  trimmedString,
} from "../_shared/jsonBoundary.js";
import {
  booleanField,
  nonNegativeIntegerField,
  providerContractMessage,
  providerRecord,
  providerRejectedMessage,
} from "../_shared/providerBoundary.js";

export type ShellPromptHandlingBestPracticeRequest = ShellPromptHandlingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellPromptHandlingPracticeProviderName;
  provider?: ShellPromptHandlingProvider;
};
export type ShellPromptHandlingHandlerInput = Omit<ShellPromptHandlingBestPracticeRequest, "executor">;
export type ShellPromptHandlingPracticeSelection = {
  providerName: ShellPromptHandlingPracticeProviderName;
  practice: ShellPromptHandlingProviderPractice;
  provider?: ShellPromptHandlingProvider;
};

export const promptHandlingProviderPractices = [anthropicShellPromptHandlingPractice, openaiShellPromptHandlingPractice, deepmindShellPromptHandlingPractice] as const;
export const promptHandlingBestPracticeDescriptor = {
  toolId: "shell.promptHandling",
  bestPractice: "runtime-execEngine-shellInteraction-handlePrompt",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: promptHandlingDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: ShellPromptHandlingPracticeProviderName | undefined): readonly ShellPromptHandlingProviderPractice[] {
  if (preferredProvider === undefined) {
    return promptHandlingProviderPractices;
  }

  return [
    ...promptHandlingProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...promptHandlingProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellPromptHandlingPractice(dependencies: ShellPromptHandlingDependencies & { preferredProvider?: ShellPromptHandlingPracticeProviderName } = {}): ShellPromptHandlingPracticeSelection {
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
      notes: ["No injected or host shell interaction provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: ShellPromptHandlingPracticeSelection): Readonly<Record<string, unknown>> {
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

function runtimeFailure(
  code: string,
  message: string,
  boundary: string,
  request: Partial<ShellPromptHandlingBestPracticeRequest>,
): ShellPromptHandlingResult {
  const context = jsonRecord(request.context);
  const target = jsonRecord(request.target);
  return {
    ok: false,
    toolId: "shell.promptHandling",
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [
      {
        type: "agentCore.basicTool.shell.promptHandling.rejected",
        toolId: "shell.promptHandling",
        invocationId: trimmedString(context?.invocationId) ?? "shell.promptHandling:runtime",
        dryRun: context?.dryRun !== false,
        sessionId: trimmedString(target?.sessionId),
        metadata: { ...contextAuditMetadata(context), code, boundary },
      },
    ],
    events: ["basicTool.shell.promptHandling.rejected"],
  } as unknown as ShellPromptHandlingResult;
}

function normalizeProviderOutput(
  providerOutput: unknown,
  planned: ShellPromptHandlingOutput,
): ShellPromptHandlingOutput | undefined {
  const providerRecordResult = providerRecord(providerOutput);
  if (!providerRecordResult.ok) {
    return undefined;
  }

  const outputRecord = providerRecordResult.output;
  const stdinWriteBlocked = booleanField(outputRecord, "stdinWriteBlocked");
  if (planned.action === "respond") {
    if (stdinWriteBlocked !== false) {
      return undefined;
    }

    const responseBytes = nonNegativeIntegerField(outputRecord, "responseBytes") ?? planned.responseBytes;
    if (responseBytes === undefined) {
      return undefined;
    }

    return {
      ...planned,
      responseBytes,
      dryRun: false,
      stdinWriteBlocked: false,
    };
  }

  if (stdinWriteBlocked === false) {
    return undefined;
  }

  return {
    ...planned,
    dryRun: false,
    stdinWriteBlocked: true,
  };
}

export async function executeShellPromptHandling(request: ShellPromptHandlingBestPracticeRequest = {}): Promise<ShellPromptHandlingResult> {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context);
  if (runtimeIdIsMalformed(context)) {
    return runtimeFailure("INVALID_RUNTIME_ID", "shell.promptHandling context.runtimeId must be a string when provided", "input", requestRecord);
  }

  const executor = jsonRecord(requestRecord.executor) as BaseToolExecutorPort | undefined;
  const provider = typeof requestRecord.provider === "function" ? requestRecord.provider as ShellPromptHandlingProvider : undefined;
  const preferredProvider = typeof requestRecord.preferredProvider === "string"
    ? requestRecord.preferredProvider as ShellPromptHandlingPracticeProviderName
    : undefined;
  const selection = selectShellPromptHandlingPractice({
    executor,
    provider,
    preferredProvider,
  });
  const auditMetadata = { ...contextAuditMetadata(context), ...practiceAuditMetadata(selection) };
  const planned = planShellPromptHandlingCore({
    ...requestRecord,
    context: { ...context, dryRun: true, auditMetadata },
  } as ShellPromptHandlingRequest);
  if (!planned.ok || context?.dryRun !== false) {
    return planned as ShellPromptHandlingResult;
  }

  if (!hasAffirmativeGuard(context)) {
    return runtimeFailure(
      "GOVERNANCE_REJECTED",
      "shell.promptHandling requires an affirmative runtime guard before real provider dispatch",
      "governance",
      requestRecord,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.promptHandling requires a runtime shell interaction provider for real dispatch",
      "provider",
      requestRecord,
    );
  }

  try {
    const providerOutput = await selection.provider(
      { ...requestRecord, context: { ...context, auditMetadata } } as ShellPromptHandlingRequest,
      { ...context, auditMetadata } as NonNullable<ShellPromptHandlingRequest["context"]>,
    );
    const output = normalizeProviderOutput(providerOutput, planned.output);
    if (output === undefined) {
      return runtimeFailure("PROVIDER_REJECTED", providerContractMessage("shell.promptHandling"), "provider", requestRecord);
    }

    return {
      ok: true,
      toolId: "shell.promptHandling",
      output,
      audit: planned.audit,
      events: ["basicTool.shell.promptHandling.handled"],
    } as unknown as ShellPromptHandlingResult;
  } catch {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage("shell.promptHandling"),
      "provider",
      requestRecord,
    );
  }
}

export const promptHandlingBaseToolDefinition = createShellBaseToolDefinition<ShellPromptHandlingHandlerInput, ShellPromptHandlingOutput>({
  toolId: "shell.promptHandling",
  title: "Shell Prompt Handling",
  description: "Handle an observed shell prompt through runtime-owned prompt policy and stdin wiring.",
  summary: "Use shell.promptHandling when runtime has approved prompt observation or response.",
  storageGroup: "shellInteraction",
  riskLevel: "risky",
  permissionHints: ["shell:prompt:handle"],
  dependencies: promptHandlingDependencyDeclarations,
  inputSchema: jsonSchema("shell.promptHandling.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.promptHandling.output", { type: "object", additionalProperties: true }),
});

export const promptHandlingHandler: BaseToolHandler<ShellPromptHandlingHandlerInput, ShellPromptHandlingOutput> = {
  definition: promptHandlingBaseToolDefinition,
  async invoke(request) {
    const input = jsonRecord(request.input) ?? {};
    const inputContext = jsonRecord(input.context);
    const result = await executeShellPromptHandling({
      ...input,
      executor: request.executor,
      context: {
        ...inputContext,
        runtimeId: inputContext?.runtimeId === undefined ? request.runtimeId : inputContext.runtimeId,
        sessionId: inputContext?.sessionId === undefined ? request.sessionId : inputContext.sessionId,
        invocationId: inputContext?.invocationId === undefined ? request.toolCallId : inputContext.invocationId,
        auditMetadata: injectRuntimeInvocationMetadata(request.metadata, contextAuditMetadata(inputContext), request),
      },
    } as unknown as ShellPromptHandlingBestPracticeRequest);

    if (!result.ok) {
      return {
        ok: false,
        toolId: result.toolId,
        error: { code: result.error.code, message: result.error.message, publicSafe: true },
        events: result.events,
      };
    }

    return {
      ok: true,
      toolId: result.toolId,
      output: result.output,
      events: result.events,
      metadata: { audit: result.audit },
    };
  },
};
