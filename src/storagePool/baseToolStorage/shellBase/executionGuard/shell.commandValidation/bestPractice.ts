import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellCommandValidationPractice } from "./anthropic.js";
import { deepmindShellCommandValidationPractice } from "./deepmind.js";
import { openaiShellCommandValidationPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  validateShellCommandSafety,
  type ShellCommandValidationOutput,
  type ShellCommandValidationRequest,
  type ShellCommandValidationResult,
  type ShellCommandValidationVerdict,
} from "./core.js";
import {
  shellCommandValidationDependencyDeclarations,
  type ShellCommandValidationDependencies,
  type ShellCommandValidationProvider,
  type ShellCommandValidationProviderPractice,
  type ShellCommandValidationPracticeProviderName,
} from "./dependencies.js";

export * from "./core.js";

export type ShellCommandValidationBestPracticeRequest = ShellCommandValidationRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellCommandValidationPracticeProviderName;
  provider?: ShellCommandValidationProvider;
};

export type ShellCommandValidationHandlerInput = Omit<ShellCommandValidationBestPracticeRequest, "executor">;

export type ShellCommandValidationPracticeSelection = {
  providerName: ShellCommandValidationPracticeProviderName;
  practice: ShellCommandValidationProviderPractice;
  provider?: ShellCommandValidationProvider;
};

export const shellCommandValidationProviderPractices = [
  anthropicShellCommandValidationPractice,
  openaiShellCommandValidationPractice,
  deepmindShellCommandValidationPractice,
] as const;

export const shellCommandValidationBestPracticeDescriptor = {
  toolId: "shell.commandValidation",
  bestPractice: "runtime-governed-shell-command-validation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellCommandValidationDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellCommandValidationPracticeProviderName | undefined,
): readonly ShellCommandValidationProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellCommandValidationProviderPractices;
  }

  return [
    ...shellCommandValidationProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellCommandValidationProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellCommandValidationPractice(
  dependencies: ShellCommandValidationDependencies & {
    preferredProvider?: ShellCommandValidationPracticeProviderName;
  } = {},
): ShellCommandValidationPracticeSelection {
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
      notes: ["No injected or host shell command validation provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function buildPracticeAuditMetadata(
  selection: ShellCommandValidationPracticeSelection,
): Readonly<Record<string, unknown>> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function contextFrom(value: unknown): ShellCommandValidationRequest["context"] {
  return isRecord(value) ? value as ShellCommandValidationRequest["context"] : undefined;
}

function metadataFrom(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function hasAffirmativeGuard(context: ShellCommandValidationRequest["context"]): boolean {
  const guard = isRecord(context?.guard) ? context?.guard : undefined;
  if (guard?.allowed === false || guard?.accepted === false) {
    return false;
  }

  return guard?.allowed === true || guard?.accepted === true;
}

const commandValidationVerdicts = new Set<ShellCommandValidationVerdict>(["allowed", "requires-approval", "blocked"]);

function normalizedStringList(value: unknown, fieldName: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`shell.commandValidation provider returned invalid ${fieldName}`);
  }

  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new Error(`shell.commandValidation provider returned invalid ${fieldName}`);
    }

    values.push(item);
  }

  return values;
}

function providerCommandValidationPatch(value: unknown): Pick<ShellCommandValidationOutput, "verdict" | "reasons" | "requiresTapApproval"> {
  if (!isRecord(value)) {
    throw new Error("shell.commandValidation provider returned an invalid output envelope");
  }

  const patch: Partial<Pick<ShellCommandValidationOutput, "verdict" | "reasons" | "requiresTapApproval">> = {};
  if (value.verdict !== undefined) {
    if (typeof value.verdict !== "string" || !commandValidationVerdicts.has(value.verdict as ShellCommandValidationVerdict)) {
      throw new Error("shell.commandValidation provider returned invalid verdict");
    }

    patch.verdict = value.verdict as ShellCommandValidationVerdict;
  }

  const reasons = normalizedStringList(value.reasons, "reasons");
  if (reasons !== undefined) {
    patch.reasons = reasons;
  }

  if (value.requiresTapApproval !== undefined) {
    if (typeof value.requiresTapApproval !== "boolean") {
      throw new Error("shell.commandValidation provider returned invalid requiresTapApproval");
    }

    patch.requiresTapApproval = value.requiresTapApproval;
  }

  return patch as Pick<ShellCommandValidationOutput, "verdict" | "reasons" | "requiresTapApproval">;
}

function providerRejectedMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && error.publicSafe === true && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function runtimeFailure(
  code: "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED",
  message: string,
  boundary: "governance" | "provider",
  request: ShellCommandValidationBestPracticeRequest,
): ShellCommandValidationResult {
  return {
    ok: false,
    toolId: "shell.commandValidation",
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
        type: "agentCore.basicTool.shell.commandValidation.rejected",
        toolId: "shell.commandValidation",
        invocationId: request.context?.invocationId ?? "shell.commandValidation:runtime",
        dryRun: request.context?.dryRun !== false,
        commandPreview: request.command,
        metadata: { ...metadataFrom(request.context?.auditMetadata), code, boundary },
      },
    ],
    events: ["basicTool.shell.commandValidation.rejected"],
  };
}

export async function executeShellCommandValidation(
  request: ShellCommandValidationBestPracticeRequest = {},
): Promise<ShellCommandValidationResult> {
  const selection = selectShellCommandValidationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const requestContext = contextFrom(request.context);
  const auditMetadata = {
    ...metadataFrom(requestContext?.auditMetadata),
    ...buildPracticeAuditMetadata(selection),
  };
  const planned = validateShellCommandSafety({
    ...request,
    context: {
      ...requestContext,
      dryRun: true,
      auditMetadata,
    },
  });
  if (!planned.ok || requestContext?.dryRun !== false) {
    return planned;
  }

  if (!hasAffirmativeGuard(requestContext)) {
    return runtimeFailure(
      "GOVERNANCE_REJECTED",
      "shell.commandValidation requires an affirmative runtime guard before real provider dispatch",
      "governance",
      request,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.commandValidation requires a runtime shell guard provider for real dispatch",
      "provider",
      request,
    );
  }

  try {
    const providerRequest: ShellCommandValidationRequest = {
      command: planned.output.command,
      workingDirectory: planned.output.workingDirectory,
      shell: planned.output.shell,
      policy: isRecord(request.policy) ? request.policy as ShellCommandValidationRequest["policy"] : undefined,
      context: { ...requestContext, auditMetadata },
    };
    const providerOutput = await selection.provider(
      providerRequest,
      { ...requestContext, auditMetadata },
    );
    const providerPatch = providerCommandValidationPatch(providerOutput);
    return {
      ok: true,
      toolId: "shell.commandValidation",
      output: {
        ...planned.output,
        ...providerPatch,
        dryRun: false,
        providerCalled: true,
        executionBlocked: true,
        finalApprovalGranted: false,
        runtimeGuardRequired: true,
      },
      audit: [
        {
          type: "agentCore.basicTool.shell.commandValidation.provider",
          toolId: "shell.commandValidation",
          invocationId: requestContext?.invocationId ?? "shell.commandValidation:runtime",
          dryRun: false,
          commandPreview: planned.output.command,
          metadata: auditMetadata,
        },
      ],
      events: ["basicTool.shell.commandValidation.providerCalled"],
    };
  } catch (error) {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage(error, "shell.commandValidation provider rejected the request"),
      "provider",
      request,
    );
  }
}

export function buildShellCommandValidationBestPractice(
  request: ShellCommandValidationBestPracticeRequest = {},
): ShellCommandValidationResult {
  const selection = selectShellCommandValidationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const requestContext = contextFrom(request.context);
  return validateShellCommandSafety({
    ...request,
    context: {
      ...requestContext,
      auditMetadata: {
        ...metadataFrom(requestContext?.auditMetadata),
        ...buildPracticeAuditMetadata(selection),
      },
    },
  });
}

export const shellCommandValidationBaseToolDefinition = createShellBaseToolDefinition<
  ShellCommandValidationHandlerInput,
  ShellCommandValidationOutput
>({
  toolId: "shell.commandValidation",
  title: "Shell Command Validation",
  description: "Classify shell command safety before any governed shell execution request.",
  summary: "Use shell.commandValidation to classify command risk without spawning a process.",
  storageGroup: "executionGuard",
  riskLevel: "risky",
  permissionHints: ["shell:validate"],
  dependencies: shellCommandValidationDependencyDeclarations,
  inputSchema: jsonSchema("shell.commandValidation.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.commandValidation.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellCommandValidationResult): BaseToolInvokeResult<ShellCommandValidationOutput> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: result.toolId,
      error: { code: result.error.code, message: result.error.message, publicSafe: true },
      events: result.events,
    };
  }

  return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
}

export const shellCommandValidationHandler: BaseToolHandler<
  ShellCommandValidationHandlerInput,
  ShellCommandValidationOutput
> = {
  definition: shellCommandValidationBaseToolDefinition,
  async invoke(request) {
    const input = isRecord(request.input) ? request.input as ShellCommandValidationHandlerInput : {};
    const inputContext = contextFrom(input.context);
    return adaptResult(
      await executeShellCommandValidation({
        ...input,
        executor: request.executor,
        context: {
          ...inputContext,
          runtimeId: inputContext?.runtimeId ?? request.runtimeId,
          invocationId: inputContext?.invocationId ?? request.toolCallId,
          auditMetadata: injectRuntimeInvocationMetadata(
            {
              ...(request.metadata ?? {}),
            },
            inputContext?.auditMetadata,
            request,
          ),
        },
      }),
    );
  },
};
