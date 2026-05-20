import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellInteractiveControlPractice } from "./anthropic.js";
import { deepmindShellInteractiveControlPractice } from "./deepmind.js";
import { openaiShellInteractiveControlPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  planShellInteractiveControl as planShellInteractiveControlCore,
  type ShellInteractiveControlOutput,
  type ShellInteractiveControlRequest,
  type ShellInteractiveControlResult,
} from "./core.js";
import {
  interactiveControlDependencyDeclarations,
  type ShellInteractiveControlDependencies,
  type ShellInteractiveControlPracticeProviderName,
  type ShellInteractiveControlProvider,
  type ShellInteractiveControlProviderPractice,
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
  providerContractMessage,
  providerRecord,
  providerRejectedMessage,
} from "../_shared/providerBoundary.js";

export type ShellInteractiveControlBestPracticeRequest = ShellInteractiveControlRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellInteractiveControlPracticeProviderName;
  provider?: ShellInteractiveControlProvider;
};
export type ShellInteractiveControlHandlerInput = Omit<ShellInteractiveControlBestPracticeRequest, "executor">;
export type ShellInteractiveControlPracticeSelection = {
  providerName: ShellInteractiveControlPracticeProviderName;
  practice: ShellInteractiveControlProviderPractice;
  provider?: ShellInteractiveControlProvider;
};

export const interactiveControlProviderPractices = [anthropicShellInteractiveControlPractice, openaiShellInteractiveControlPractice, deepmindShellInteractiveControlPractice] as const;
export const interactiveControlBestPracticeDescriptor = {
  toolId: "shell.interactiveControl",
  bestPractice: "runtime-execEngine-shellInteraction-controlInteractive",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: interactiveControlDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: ShellInteractiveControlPracticeProviderName | undefined): readonly ShellInteractiveControlProviderPractice[] {
  if (preferredProvider === undefined) {
    return interactiveControlProviderPractices;
  }

  return [
    ...interactiveControlProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...interactiveControlProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellInteractiveControlPractice(dependencies: ShellInteractiveControlDependencies & { preferredProvider?: ShellInteractiveControlPracticeProviderName } = {}): ShellInteractiveControlPracticeSelection {
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

function practiceAuditMetadata(selection: ShellInteractiveControlPracticeSelection): Readonly<Record<string, unknown>> {
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
  request: Partial<ShellInteractiveControlBestPracticeRequest>,
): ShellInteractiveControlResult {
  const context = jsonRecord(request.context);
  const target = jsonRecord(request.target);
  return {
    ok: false,
    toolId: "shell.interactiveControl",
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
        type: "agentCore.basicTool.shell.interactiveControl.rejected",
        toolId: "shell.interactiveControl",
        invocationId: trimmedString(context?.invocationId) ?? "shell.interactiveControl:runtime",
        dryRun: context?.dryRun !== false,
        sessionId: trimmedString(target?.sessionId),
        metadata: { ...contextAuditMetadata(context), code, boundary },
      },
    ],
    events: ["basicTool.shell.interactiveControl.rejected"],
  } as unknown as ShellInteractiveControlResult;
}

function normalizeProviderOutput(
  providerOutput: unknown,
  planned: ShellInteractiveControlOutput,
): ShellInteractiveControlOutput | undefined {
  const providerRecordResult = providerRecord(providerOutput);
  if (!providerRecordResult.ok) {
    return undefined;
  }

  if (booleanField(providerRecordResult.output, "controlBlocked") !== false) {
    return undefined;
  }

  return {
    ...planned,
    dryRun: false,
    controlBlocked: false,
  };
}

export async function executeShellInteractiveControl(request: ShellInteractiveControlBestPracticeRequest = {}): Promise<ShellInteractiveControlResult> {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context);
  if (runtimeIdIsMalformed(context)) {
    return runtimeFailure("INVALID_RUNTIME_ID", "shell.interactiveControl context.runtimeId must be a string when provided", "input", requestRecord);
  }

  const executor = jsonRecord(requestRecord.executor) as BaseToolExecutorPort | undefined;
  const provider = typeof requestRecord.provider === "function" ? requestRecord.provider as ShellInteractiveControlProvider : undefined;
  const preferredProvider = typeof requestRecord.preferredProvider === "string"
    ? requestRecord.preferredProvider as ShellInteractiveControlPracticeProviderName
    : undefined;
  const selection = selectShellInteractiveControlPractice({
    executor,
    provider,
    preferredProvider,
  });
  const auditMetadata = { ...contextAuditMetadata(context), ...practiceAuditMetadata(selection) };
  const planned = planShellInteractiveControlCore({
    ...requestRecord,
    context: { ...context, dryRun: true, auditMetadata },
  } as ShellInteractiveControlRequest);
  if (!planned.ok || context?.dryRun !== false) {
    return planned as ShellInteractiveControlResult;
  }

  if (!hasAffirmativeGuard(context)) {
    return runtimeFailure(
      "GOVERNANCE_REJECTED",
      "shell.interactiveControl requires an affirmative runtime guard before real provider dispatch",
      "governance",
      requestRecord,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.interactiveControl requires a runtime shell interaction provider for real dispatch",
      "provider",
      requestRecord,
    );
  }

  try {
    const providerOutput = await selection.provider(
      { ...requestRecord, context: { ...context, auditMetadata } } as ShellInteractiveControlRequest,
      { ...context, auditMetadata } as NonNullable<ShellInteractiveControlRequest["context"]>,
    );
    const output = normalizeProviderOutput(providerOutput, planned.output);
    if (output === undefined) {
      return runtimeFailure("PROVIDER_REJECTED", providerContractMessage("shell.interactiveControl"), "provider", requestRecord);
    }

    return {
      ok: true,
      toolId: "shell.interactiveControl",
      output,
      audit: planned.audit,
      events: ["basicTool.shell.interactiveControl.controlled"],
    } as unknown as ShellInteractiveControlResult;
  } catch {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage("shell.interactiveControl"),
      "provider",
      requestRecord,
    );
  }
}

export const interactiveControlBaseToolDefinition = createShellBaseToolDefinition<ShellInteractiveControlHandlerInput, ShellInteractiveControlOutput>({
  toolId: "shell.interactiveControl",
  title: "Shell Interactive Control",
  description: "Control a runtime-owned interactive shell session through a governed runtime port.",
  summary: "Use shell.interactiveControl for approved runtime-owned interactive session control.",
  storageGroup: "shellInteraction",
  riskLevel: "risky",
  permissionHints: ["shell:interactive:control"],
  dependencies: interactiveControlDependencyDeclarations,
  inputSchema: jsonSchema("shell.interactiveControl.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: { type: "object", additionalProperties: true },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.interactiveControl.output", { type: "object", additionalProperties: true }),
});

export const interactiveControlHandler: BaseToolHandler<ShellInteractiveControlHandlerInput, ShellInteractiveControlOutput> = {
  definition: interactiveControlBaseToolDefinition,
  async invoke(request) {
    const input = jsonRecord(request.input) ?? {};
    const inputContext = jsonRecord(input.context);
    const result = await executeShellInteractiveControl({
      ...input,
      executor: request.executor,
      context: {
        ...inputContext,
        runtimeId: inputContext?.runtimeId === undefined ? request.runtimeId : inputContext.runtimeId,
        sessionId: inputContext?.sessionId === undefined ? request.sessionId : inputContext.sessionId,
        invocationId: inputContext?.invocationId === undefined ? request.toolCallId : inputContext.invocationId,
        auditMetadata: injectRuntimeInvocationMetadata(request.metadata, contextAuditMetadata(inputContext), request),
      },
    } as unknown as ShellInteractiveControlBestPracticeRequest);

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
