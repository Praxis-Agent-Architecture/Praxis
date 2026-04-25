import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellStdinFeedingPractice } from "./anthropic.js";
import { deepmindShellStdinFeedingPractice } from "./deepmind.js";
import { openaiShellStdinFeedingPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  planShellStdinFeeding as planShellStdinFeedingCore,
  type ShellStdinFeedingOutput,
  type ShellStdinFeedingRequest,
  type ShellStdinFeedingResult,
} from "./core.js";
import {
  stdinFeedingDependencyDeclarations,
  type ShellStdinFeedingDependencies,
  type ShellStdinFeedingPracticeProviderName,
  type ShellStdinFeedingProvider,
  type ShellStdinFeedingProviderPractice,
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

export type ShellStdinFeedingBestPracticeRequest = ShellStdinFeedingRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellStdinFeedingPracticeProviderName;
  provider?: ShellStdinFeedingProvider;
};
export type ShellStdinFeedingHandlerInput = Omit<ShellStdinFeedingBestPracticeRequest, "executor">;
export type ShellStdinFeedingPracticeSelection = {
  providerName: ShellStdinFeedingPracticeProviderName;
  practice: ShellStdinFeedingProviderPractice;
  provider?: ShellStdinFeedingProvider;
};

export const stdinFeedingProviderPractices = [anthropicShellStdinFeedingPractice, openaiShellStdinFeedingPractice, deepmindShellStdinFeedingPractice] as const;
export const stdinFeedingBestPracticeDescriptor = {
  toolId: "shell.stdinFeeding",
  bestPractice: "runtime-execEngine-shellInteraction-feedStdin",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: stdinFeedingDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: ShellStdinFeedingPracticeProviderName | undefined): readonly ShellStdinFeedingProviderPractice[] {
  if (preferredProvider === undefined) {
    return stdinFeedingProviderPractices;
  }

  return [
    ...stdinFeedingProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...stdinFeedingProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellStdinFeedingPractice(dependencies: ShellStdinFeedingDependencies & { preferredProvider?: ShellStdinFeedingPracticeProviderName } = {}): ShellStdinFeedingPracticeSelection {
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

function practiceAuditMetadata(selection: ShellStdinFeedingPracticeSelection): Readonly<Record<string, unknown>> {
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
  request: Partial<ShellStdinFeedingBestPracticeRequest>,
): ShellStdinFeedingResult {
  const context = jsonRecord(request.context);
  const target = jsonRecord(request.target);
  return {
    ok: false,
    toolId: "shell.stdinFeeding",
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
        type: "agentCore.basicTool.shell.stdinFeeding.rejected",
        toolId: "shell.stdinFeeding",
        invocationId: trimmedString(context?.invocationId) ?? "shell.stdinFeeding:runtime",
        dryRun: context?.dryRun !== false,
        sessionId: trimmedString(target?.sessionId),
        metadata: { ...contextAuditMetadata(context), code, boundary },
      },
    ],
    events: ["basicTool.shell.stdinFeeding.rejected"],
  } as unknown as ShellStdinFeedingResult;
}

function normalizeProviderOutput(
  providerOutput: unknown,
  planned: ShellStdinFeedingOutput,
): ShellStdinFeedingOutput | undefined {
  const providerRecordResult = providerRecord(providerOutput);
  if (!providerRecordResult.ok) {
    return undefined;
  }

  const outputRecord = providerRecordResult.output;
  if (booleanField(outputRecord, "stdinWriteBlocked") !== false) {
    return undefined;
  }

  const resultEnvelope = providerRecord(outputRecord.resultEnvelope);
  if (!resultEnvelope.ok || resultEnvelope.output.planned !== false) {
    return undefined;
  }

  const bytesWritten = nonNegativeIntegerField(resultEnvelope.output, "bytesWritten");
  if (bytesWritten === undefined) {
    return undefined;
  }

  return {
    ...planned,
    dryRun: false,
    stdinWriteBlocked: false,
    resultEnvelope: {
      planned: false,
      bytesWritten,
    },
  };
}

export async function executeShellStdinFeeding(request: ShellStdinFeedingBestPracticeRequest = {}): Promise<ShellStdinFeedingResult> {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context);
  if (runtimeIdIsMalformed(context)) {
    return runtimeFailure("INVALID_RUNTIME_ID", "shell.stdinFeeding context.runtimeId must be a string when provided", "input", requestRecord);
  }

  const executor = jsonRecord(requestRecord.executor) as BaseToolExecutorPort | undefined;
  const provider = typeof requestRecord.provider === "function" ? requestRecord.provider as ShellStdinFeedingProvider : undefined;
  const preferredProvider = typeof requestRecord.preferredProvider === "string"
    ? requestRecord.preferredProvider as ShellStdinFeedingPracticeProviderName
    : undefined;
  const selection = selectShellStdinFeedingPractice({
    executor,
    provider,
    preferredProvider,
  });
  const auditMetadata = { ...contextAuditMetadata(context), ...practiceAuditMetadata(selection) };
  const planned = planShellStdinFeedingCore({
    ...requestRecord,
    context: { ...context, dryRun: true, auditMetadata },
  } as ShellStdinFeedingRequest);
  if (!planned.ok || context?.dryRun !== false) {
    return planned as ShellStdinFeedingResult;
  }

  if (!hasAffirmativeGuard(context)) {
    return runtimeFailure(
      "GOVERNANCE_REJECTED",
      "shell.stdinFeeding requires an affirmative runtime guard before real provider dispatch",
      "governance",
      requestRecord,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.stdinFeeding requires a runtime shell interaction provider for real dispatch",
      "provider",
      requestRecord,
    );
  }

  try {
    const providerOutput = await selection.provider(
      { ...requestRecord, context: { ...context, auditMetadata } } as ShellStdinFeedingRequest,
      { ...context, auditMetadata } as NonNullable<ShellStdinFeedingRequest["context"]>,
    );
    const output = normalizeProviderOutput(providerOutput, planned.output);
    if (output === undefined) {
      return runtimeFailure("PROVIDER_REJECTED", providerContractMessage("shell.stdinFeeding"), "provider", requestRecord);
    }

    return {
      ok: true,
      toolId: "shell.stdinFeeding",
      output,
      audit: planned.audit,
      events: ["basicTool.shell.stdinFeeding.fed"],
    } as unknown as ShellStdinFeedingResult;
  } catch {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage("shell.stdinFeeding"),
      "provider",
      requestRecord,
    );
  }
}

export const stdinFeedingBaseToolDefinition = createShellBaseToolDefinition<ShellStdinFeedingHandlerInput, ShellStdinFeedingOutput>({
  toolId: "shell.stdinFeeding",
  title: "Shell Stdin Feeding",
  description: "Feed stdin to a runtime-owned shell session through a governed runtime port.",
  summary: "Use shell.stdinFeeding for approved stdin writes to an existing runtime shell session.",
  storageGroup: "shellInteraction",
  riskLevel: "risky",
  permissionHints: ["shell:stdin:feed"],
  dependencies: stdinFeedingDependencyDeclarations,
  inputSchema: jsonSchema("shell.stdinFeeding.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.stdinFeeding.output", { type: "object", additionalProperties: true }),
});

export const stdinFeedingHandler: BaseToolHandler<ShellStdinFeedingHandlerInput, ShellStdinFeedingOutput> = {
  definition: stdinFeedingBaseToolDefinition,
  async invoke(request) {
    const input = jsonRecord(request.input) ?? {};
    const inputContext = jsonRecord(input.context);
    const result = await executeShellStdinFeeding({
      ...input,
      executor: request.executor,
      context: {
        ...inputContext,
        runtimeId: inputContext?.runtimeId === undefined ? request.runtimeId : inputContext.runtimeId,
        sessionId: inputContext?.sessionId === undefined ? request.sessionId : inputContext.sessionId,
        invocationId: inputContext?.invocationId === undefined ? request.toolCallId : inputContext.invocationId,
        auditMetadata: injectRuntimeInvocationMetadata(request.metadata, contextAuditMetadata(inputContext), request),
      },
    } as unknown as ShellStdinFeedingBestPracticeRequest);

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
