import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellCommandGenerationPractice } from "./anthropic.js";
import { deepmindShellCommandGenerationPractice } from "./deepmind.js";
import { openaiShellCommandGenerationPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
  selectShellProviderPractice,
} from "../../_shared/baseToolAdapter.js";
import {
  evaluateShellGenerationProviderDispatch,
  isShellGenerationRecord,
  shellGenerationDryRunEnabled,
} from "../_shared/providerDispatch.js";
import {
  requireProviderAudit,
  requireProviderEvents,
  requireProviderFailureError,
  requireProviderResultEnvelope,
  requireRecordField,
} from "../_shared/hostExecutorProvider.js";
import {
  generateShellCommand,
  type ShellCommandGenerationAuditEvent,
  type ShellCommandGenerationOutput,
  type ShellCommandGenerationRequest,
  type ShellCommandGenerationResult,
} from "./core.js";
import {
  type ShellCommandGenerationDependencies,
  normalizeShellCommandGenerationOutput,
  shellCommandGenerationDependencyDeclarations,
  type ShellCommandGenerationProvider,
  type ShellCommandGenerationPracticeProviderName,
  type ShellCommandGenerationProviderPractice,
} from "./dependencies.js";

export type ShellCommandGenerationBestPracticeRequest = ShellCommandGenerationRequest & {
  executor?: BaseToolExecutorPort;
  provider?: ShellCommandGenerationProvider;
  preferredProvider?: ShellCommandGenerationPracticeProviderName;
};

export type ShellCommandGenerationHandlerInput = Omit<ShellCommandGenerationBestPracticeRequest, "executor" | "provider">;

export type ShellCommandGenerationPracticeSelection = {
  providerName: ShellCommandGenerationPracticeProviderName;
  practice: ShellCommandGenerationProviderPractice;
  provider?: ShellCommandGenerationProvider;
};

export const shellCommandGenerationProviderPractices = [
  anthropicShellCommandGenerationPractice,
  openaiShellCommandGenerationPractice,
  deepmindShellCommandGenerationPractice,
] as const satisfies readonly ShellCommandGenerationProviderPractice[];

const praxisNativeShellCommandGenerationPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis deterministic shell command generation core",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Used for metadata only when no provider-specific practice is selected; dry-run still uses the deterministic core directly."],
  createProvider: ({ provider }: ShellCommandGenerationDependencies) => provider,
} as const satisfies ShellCommandGenerationProviderPractice;

export const shellCommandGenerationBestPracticeDescriptor = {
  toolId: "shell.commandGeneration",
  bestPractice: "runtime-governed-shell-command-generation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellCommandGenerationDependencyDeclarations,
} as const;

export function selectShellCommandGenerationPractice(
  dependencies: ShellCommandGenerationDependencies & {
    preferredProvider?: ShellCommandGenerationPracticeProviderName;
  } = {},
): ShellCommandGenerationPracticeSelection {
  return selectShellProviderPractice(
    shellCommandGenerationProviderPractices,
    dependencies,
    praxisNativeShellCommandGenerationPractice,
  );
}

function buildShellCommandGenerationPracticeAuditMetadata(
  selection: ShellCommandGenerationPracticeSelection,
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

function commandGenerationProviderFailure(
  code: "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED",
  message: string,
): ShellCommandGenerationResult {
  return {
    ok: false,
    toolId: "shell.commandGeneration",
    error: {
      code,
      message,
      boundary: code === "GOVERNANCE_REJECTED" ? "governance" : "contract",
      publicSafe: true,
      internalDetailExposed: false,
    },
    audit: [],
    events: ["basicTool.shell.commandGeneration.rejected"],
  };
}

const shellCommandGenerationProviderErrorCodes = [
  "MISSING_ARGUMENT_VECTOR",
  "INVALID_ARGUMENT_VECTOR",
  "INVALID_SHELL",
  "INVALID_WORKING_DIRECTORY",
  "INVALID_ENVIRONMENT",
  "GOVERNANCE_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "PERMISSION_DENIED",
  "REAL_EXECUTION_BLOCKED",
] as const;

const shellCommandGenerationProviderErrorBoundaries = ["input", "permission", "contract", "governance"] as const;

function normalizeShellCommandGenerationProviderResult(result: unknown): ShellCommandGenerationResult {
  const envelope = requireProviderResultEnvelope(result, "shell.commandGeneration");
  const audit = requireProviderAudit(envelope) as readonly ShellCommandGenerationAuditEvent[];
  const events = requireProviderEvents(envelope);

  if (!envelope.ok) {
    return {
      ok: false,
      toolId: "shell.commandGeneration",
      error: requireProviderFailureError(
        envelope,
        shellCommandGenerationProviderErrorCodes,
        shellCommandGenerationProviderErrorBoundaries,
      ),
      audit,
      events,
    };
  }

  return {
    ok: true,
    toolId: "shell.commandGeneration",
    output: normalizeShellCommandGenerationOutput(requireRecordField(envelope, "output")),
    audit,
    events,
  };
}

export async function generateShellCommandBestPractice(
  request: ShellCommandGenerationBestPracticeRequest = {},
): Promise<ShellCommandGenerationResult> {
  if (!isShellGenerationRecord(request) || shellGenerationDryRunEnabled(request.context)) {
    return generateShellCommand(request);
  }

  const dispatch = evaluateShellGenerationProviderDispatch(request.context);
  if (!dispatch.ok) {
    return commandGenerationProviderFailure(dispatch.code, dispatch.message);
  }

  const validation = generateShellCommand({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (!validation.ok) {
    return validation;
  }

  const selection = selectShellCommandGenerationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  if (selection.provider === undefined) {
    return commandGenerationProviderFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.commandGeneration provider-backed generation requires an injected runtime provider",
    );
  }

  try {
    const providerResult = await selection.provider({
      ...request,
      context: {
        ...request.context,
        auditMetadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...buildShellCommandGenerationPracticeAuditMetadata(selection),
        },
      },
    });
    return normalizeShellCommandGenerationProviderResult(providerResult);
  } catch {
    return commandGenerationProviderFailure("PROVIDER_REJECTED", "shell.commandGeneration provider rejected the generation request");
  }
}

export const shellCommandGenerationBaseToolDefinition = createShellBaseToolDefinition<
  ShellCommandGenerationHandlerInput,
  ShellCommandGenerationOutput
>({
  toolId: "shell.commandGeneration",
  title: "Shell Command Generation",
  description: "Render an argv vector into an auditable shell command envelope.",
  summary: "Use shell.commandGeneration after argv assembly and before guard construction.",
  storageGroup: "shellGeneration",
  riskLevel: "normal",
  permissionHints: ["shell:generate"],
  dependencies: shellCommandGenerationDependencyDeclarations,
  inputSchema: jsonSchema("shell.commandGeneration.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.commandGeneration.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellCommandGenerationResult): BaseToolInvokeResult<ShellCommandGenerationOutput> {
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

export const shellCommandGenerationHandler: BaseToolHandler<
  ShellCommandGenerationHandlerInput,
  ShellCommandGenerationOutput
> = {
  definition: shellCommandGenerationBaseToolDefinition,
  async invoke(request) {
    const input = isShellGenerationRecord(request.input) ? request.input as ShellCommandGenerationHandlerInput : {};
    const inputContext = isShellGenerationRecord(input.context) ? input.context : {};
    const auditMetadata = isShellGenerationRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined;
    const selection = selectShellCommandGenerationPractice({
      preferredProvider: input.preferredProvider,
    });
    return adaptResult(
      await generateShellCommandBestPractice({
        ...input,
        executor: request.executor,
        context: {
          ...inputContext,
          runtimeId: typeof inputContext.runtimeId === "string" ? inputContext.runtimeId : request.runtimeId,
          invocationId: typeof inputContext.invocationId === "string" ? inputContext.invocationId : request.toolCallId,
          auditMetadata: injectRuntimeInvocationMetadata(
            {
              ...buildShellCommandGenerationPracticeAuditMetadata(selection),
              ...(request.metadata ?? {}),
            },
            auditMetadata,
            request,
          ),
        },
      }),
    );
  },
};
