import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellOutputCapturePractice } from "./anthropic.js";
import { deepmindShellOutputCapturePractice } from "./deepmind.js";
import { openaiShellOutputCapturePractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  captureShellOutput as captureShellOutputCore,
  type ShellCapturedOutputChunk,
  type ShellOutputCaptureOutput,
  type ShellOutputCaptureRequest,
  type ShellOutputCaptureResult,
  type ShellOutputStream,
} from "./core.js";
import {
  outputCaptureDependencyDeclarations,
  type ShellOutputCaptureDependencies,
  type ShellOutputCapturePracticeProviderName,
  type ShellOutputCaptureProvider,
  type ShellOutputCaptureProviderPractice,
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
  stringArrayField,
  stringField,
} from "../_shared/providerBoundary.js";

export type ShellOutputCaptureBestPracticeRequest = ShellOutputCaptureRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellOutputCapturePracticeProviderName;
  provider?: ShellOutputCaptureProvider;
};
export type ShellOutputCaptureHandlerInput = Omit<ShellOutputCaptureBestPracticeRequest, "executor">;
export type ShellOutputCapturePracticeSelection = {
  providerName: ShellOutputCapturePracticeProviderName;
  practice: ShellOutputCaptureProviderPractice;
  provider?: ShellOutputCaptureProvider;
};

export const outputCaptureProviderPractices = [anthropicShellOutputCapturePractice, openaiShellOutputCapturePractice, deepmindShellOutputCapturePractice] as const;
export const outputCaptureBestPracticeDescriptor = {
  toolId: "shell.outputCapture",
  bestPractice: "runtime-execEngine-shellInteraction-captureOutput",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: outputCaptureDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: ShellOutputCapturePracticeProviderName | undefined): readonly ShellOutputCaptureProviderPractice[] {
  if (preferredProvider === undefined) {
    return outputCaptureProviderPractices;
  }

  return [
    ...outputCaptureProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...outputCaptureProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellOutputCapturePractice(dependencies: ShellOutputCaptureDependencies & { preferredProvider?: ShellOutputCapturePracticeProviderName } = {}): ShellOutputCapturePracticeSelection {
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

function practiceAuditMetadata(selection: ShellOutputCapturePracticeSelection): Readonly<Record<string, unknown>> {
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
  request: Partial<ShellOutputCaptureBestPracticeRequest>,
): ShellOutputCaptureResult {
  const context = jsonRecord(request.context);
  const target = jsonRecord(request.target);
  return {
    ok: false,
    toolId: "shell.outputCapture",
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
        type: "agentCore.basicTool.shell.outputCapture.rejected",
        toolId: "shell.outputCapture",
        invocationId: trimmedString(context?.invocationId) ?? "shell.outputCapture:runtime",
        dryRun: context?.dryRun !== false,
        sessionId: trimmedString(target?.sessionId),
        metadata: { ...contextAuditMetadata(context), code, boundary },
      },
    ],
    events: ["basicTool.shell.outputCapture.rejected"],
  } as unknown as ShellOutputCaptureResult;
}

const outputStreams = new Set<ShellOutputStream>(["stdout", "stderr", "combined"]);

function normalizeOutputChunks(chunks: unknown): readonly ShellCapturedOutputChunk[] | undefined {
  if (!Array.isArray(chunks)) {
    return undefined;
  }

  const normalized: ShellCapturedOutputChunk[] = [];
  for (const rawChunk of chunks) {
    const chunk = providerRecord(rawChunk);
    if (!chunk.ok) {
      return undefined;
    }

    const stream = stringField(chunk.output, "stream") as ShellOutputStream | undefined;
    const text = stringField(chunk.output, "text");
    if (stream === undefined || !outputStreams.has(stream) || text === undefined || text.includes("\0")) {
      return undefined;
    }

    if (chunk.output.bytes !== undefined && nonNegativeIntegerField(chunk.output, "bytes") === undefined) {
      return undefined;
    }
    if (chunk.output.receivedAtMs !== undefined && nonNegativeIntegerField(chunk.output, "receivedAtMs") === undefined) {
      return undefined;
    }

    const bytes = nonNegativeIntegerField(chunk.output, "bytes") ?? Buffer.byteLength(text, "utf8");
    const receivedAtMs = nonNegativeIntegerField(chunk.output, "receivedAtMs");
    normalized.push({ stream, text, bytes, receivedAtMs });
  }

  return normalized;
}

function normalizeProviderOutput(
  providerOutput: unknown,
  planned: ShellOutputCaptureOutput,
): ShellOutputCaptureOutput | undefined {
  const providerRecordResult = providerRecord(providerOutput);
  if (!providerRecordResult.ok) {
    return undefined;
  }

  const outputRecord = providerRecordResult.output;
  if (booleanField(outputRecord, "realBufferReadBlocked") !== false) {
    return undefined;
  }

  const streams = stringArrayField(outputRecord, "streams") ?? planned.streams;
  if (streams.length === 0 || streams.some((stream) => !outputStreams.has(stream as ShellOutputStream))) {
    return undefined;
  }

  const chunks = normalizeOutputChunks(outputRecord.chunks);
  if (chunks === undefined) {
    return undefined;
  }

  const totalBytes = chunks.reduce((total, chunk) => total + chunk.bytes, 0);
  if (outputRecord.totalBytes !== undefined && nonNegativeIntegerField(outputRecord, "totalBytes") === undefined) {
    return undefined;
  }

  const providerTotalBytes = nonNegativeIntegerField(outputRecord, "totalBytes");
  if (providerTotalBytes !== undefined && providerTotalBytes !== totalBytes) {
    return undefined;
  }

  const truncated = booleanField(outputRecord, "truncated") ?? false;
  return {
    ...planned,
    streams: streams as readonly ShellOutputStream[],
    chunks,
    totalBytes,
    truncated,
    dryRun: false,
    realBufferReadBlocked: false,
  };
}

export async function executeShellOutputCapture(request: ShellOutputCaptureBestPracticeRequest = {}): Promise<ShellOutputCaptureResult> {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context);
  if (runtimeIdIsMalformed(context)) {
    return runtimeFailure("INVALID_RUNTIME_ID", "shell.outputCapture context.runtimeId must be a string when provided", "input", requestRecord);
  }

  const executor = jsonRecord(requestRecord.executor) as BaseToolExecutorPort | undefined;
  const provider = typeof requestRecord.provider === "function" ? requestRecord.provider as ShellOutputCaptureProvider : undefined;
  const preferredProvider = typeof requestRecord.preferredProvider === "string"
    ? requestRecord.preferredProvider as ShellOutputCapturePracticeProviderName
    : undefined;
  const selection = selectShellOutputCapturePractice({
    executor,
    provider,
    preferredProvider,
  });
  const auditMetadata = { ...contextAuditMetadata(context), ...practiceAuditMetadata(selection) };
  const planned = captureShellOutputCore({
    ...requestRecord,
    context: { ...context, dryRun: true, auditMetadata },
  } as ShellOutputCaptureRequest);
  if (!planned.ok || context?.dryRun !== false) {
    return planned as ShellOutputCaptureResult;
  }

  if (!hasAffirmativeGuard(context)) {
    return runtimeFailure(
      "GOVERNANCE_REJECTED",
      "shell.outputCapture requires an affirmative runtime guard before real provider dispatch",
      "governance",
      requestRecord,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.outputCapture requires a runtime shell interaction provider for real dispatch",
      "provider",
      requestRecord,
    );
  }

  try {
    const providerOutput = await selection.provider(
      { ...requestRecord, context: { ...context, auditMetadata } } as ShellOutputCaptureRequest,
      { ...context, auditMetadata } as NonNullable<ShellOutputCaptureRequest["context"]>,
    );
    const output = normalizeProviderOutput(providerOutput, planned.output);
    if (output === undefined) {
      return runtimeFailure("PROVIDER_REJECTED", providerContractMessage("shell.outputCapture"), "provider", requestRecord);
    }

    return {
      ok: true,
      toolId: "shell.outputCapture",
      output,
      audit: planned.audit,
      events: ["basicTool.shell.outputCapture.captured"],
    } as unknown as ShellOutputCaptureResult;
  } catch {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage("shell.outputCapture"),
      "provider",
      requestRecord,
    );
  }
}

export const outputCaptureBaseToolDefinition = createShellBaseToolDefinition<ShellOutputCaptureHandlerInput, ShellOutputCaptureOutput>({
  toolId: "shell.outputCapture",
  title: "Shell Output Capture",
  description: "Capture output from a runtime-owned shell session through a governed runtime port.",
  summary: "Use shell.outputCapture to collect runtime-owned stdout/stderr chunks.",
  storageGroup: "shellInteraction",
  riskLevel: "risky",
  permissionHints: ["shell:output:capture"],
  dependencies: outputCaptureDependencyDeclarations,
  inputSchema: jsonSchema("shell.outputCapture.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.outputCapture.output", { type: "object", additionalProperties: true }),
});

export const outputCaptureHandler: BaseToolHandler<ShellOutputCaptureHandlerInput, ShellOutputCaptureOutput> = {
  definition: outputCaptureBaseToolDefinition,
  async invoke(request) {
    const input = jsonRecord(request.input) ?? {};
    const inputContext = jsonRecord(input.context);
    const result = await executeShellOutputCapture({
      ...input,
      executor: request.executor,
      context: {
        ...inputContext,
        runtimeId: inputContext?.runtimeId === undefined ? request.runtimeId : inputContext.runtimeId,
        sessionId: inputContext?.sessionId === undefined ? request.sessionId : inputContext.sessionId,
        invocationId: inputContext?.invocationId === undefined ? request.toolCallId : inputContext.invocationId,
        auditMetadata: injectRuntimeInvocationMetadata(request.metadata, contextAuditMetadata(inputContext), request),
      },
    } as unknown as ShellOutputCaptureBestPracticeRequest);

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
