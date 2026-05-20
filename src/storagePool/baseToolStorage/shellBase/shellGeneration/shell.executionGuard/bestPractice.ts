import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellExecutionGuardPractice } from "./anthropic.js";
import { deepmindShellExecutionGuardPractice } from "./deepmind.js";
import { openaiShellExecutionGuardPractice } from "./openai.js";
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
  buildShellExecutionGuard,
  type ShellExecutionGuardAuditEvent,
  type ShellExecutionGuardOutput,
  type ShellExecutionGuardRequest,
  type ShellExecutionGuardResult,
} from "./core.js";
import {
  type ShellExecutionGuardDependencies,
  normalizeShellExecutionGuardOutput,
  shellExecutionGuardDependencyDeclarations,
  type ShellExecutionGuardProvider,
  type ShellExecutionGuardPracticeProviderName,
  type ShellExecutionGuardProviderPractice,
} from "./dependencies.js";

export type ShellExecutionGuardBestPracticeRequest = ShellExecutionGuardRequest & {
  executor?: BaseToolExecutorPort;
  provider?: ShellExecutionGuardProvider;
  preferredProvider?: ShellExecutionGuardPracticeProviderName;
};

export type ShellExecutionGuardHandlerInput = Omit<ShellExecutionGuardBestPracticeRequest, "executor" | "provider">;

export type ShellExecutionGuardPracticeSelection = {
  providerName: ShellExecutionGuardPracticeProviderName;
  practice: ShellExecutionGuardProviderPractice;
  provider?: ShellExecutionGuardProvider;
};

export const shellExecutionGuardProviderPractices = [
  anthropicShellExecutionGuardPractice,
  openaiShellExecutionGuardPractice,
  deepmindShellExecutionGuardPractice,
] as const satisfies readonly ShellExecutionGuardProviderPractice[];

const praxisNativeShellExecutionGuardPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis deterministic shell execution guard core",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Used for metadata only when no provider-specific practice is selected; dry-run still uses the deterministic core directly."],
  createProvider: ({ provider }: ShellExecutionGuardDependencies) => provider,
} as const satisfies ShellExecutionGuardProviderPractice;

export const shellExecutionGuardBestPracticeDescriptor = {
  toolId: "shell.executionGuard",
  bestPractice: "runtime-governed-shell-execution-guard",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellExecutionGuardDependencyDeclarations,
} as const;

export function selectShellExecutionGuardPractice(
  dependencies: ShellExecutionGuardDependencies & {
    preferredProvider?: ShellExecutionGuardPracticeProviderName;
  } = {},
): ShellExecutionGuardPracticeSelection {
  return selectShellProviderPractice(
    shellExecutionGuardProviderPractices,
    dependencies,
    praxisNativeShellExecutionGuardPractice,
  );
}

function buildShellExecutionGuardPracticeAuditMetadata(
  selection: ShellExecutionGuardPracticeSelection,
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

function executionGuardProviderFailure(
  code: "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED",
  message: string,
): ShellExecutionGuardResult {
  return {
    ok: false,
    toolId: "shell.executionGuard",
    error: {
      code,
      message,
      boundary: code === "GOVERNANCE_REJECTED" ? "governance" : "contract",
      publicSafe: true,
      internalDetailExposed: false,
    },
    audit: [],
    events: ["basicTool.shell.executionGuard.rejected"],
  };
}

const shellExecutionGuardProviderErrorCodes = [
  "MISSING_COMMAND",
  "INVALID_COMMAND",
  "INVALID_POLICY",
  "PERMISSION_DENIED",
  "WORKING_DIRECTORY_DENIED",
  "GOVERNANCE_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "REAL_EXECUTION_BLOCKED",
] as const;

const shellExecutionGuardProviderErrorBoundaries = ["input", "permission", "contract", "governance", "scope"] as const;

function normalizeShellExecutionGuardProviderResult(result: unknown): ShellExecutionGuardResult {
  const envelope = requireProviderResultEnvelope(result, "shell.executionGuard");
  const audit = requireProviderAudit(envelope) as readonly ShellExecutionGuardAuditEvent[];
  const events = requireProviderEvents(envelope);

  if (!envelope.ok) {
    return {
      ok: false,
      toolId: "shell.executionGuard",
      error: requireProviderFailureError(
        envelope,
        shellExecutionGuardProviderErrorCodes,
        shellExecutionGuardProviderErrorBoundaries,
      ),
      audit,
      events,
    };
  }

  return {
    ok: true,
    toolId: "shell.executionGuard",
    output: normalizeShellExecutionGuardOutput(requireRecordField(envelope, "output")),
    audit,
    events,
  };
}

export async function buildShellExecutionGuardBestPractice(
  request: ShellExecutionGuardBestPracticeRequest = {},
): Promise<ShellExecutionGuardResult> {
  if (!isShellGenerationRecord(request) || shellGenerationDryRunEnabled(request.context)) {
    return buildShellExecutionGuard(request);
  }

  const dispatch = evaluateShellGenerationProviderDispatch(request.context);
  if (!dispatch.ok) {
    return executionGuardProviderFailure(dispatch.code, dispatch.message);
  }

  const validation = buildShellExecutionGuard({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (!validation.ok) {
    return validation;
  }

  const selection = selectShellExecutionGuardPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  if (selection.provider === undefined) {
    return executionGuardProviderFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.executionGuard provider-backed generation requires an injected runtime provider",
    );
  }

  try {
    const providerResult = await selection.provider({
      ...request,
      context: {
        ...request.context,
        auditMetadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...buildShellExecutionGuardPracticeAuditMetadata(selection),
        },
      },
    });
    return normalizeShellExecutionGuardProviderResult(providerResult);
  } catch {
    return executionGuardProviderFailure("PROVIDER_REJECTED", "shell.executionGuard provider rejected the generation request");
  }
}

export const shellExecutionGuardBaseToolDefinition = createShellBaseToolDefinition<
  ShellExecutionGuardHandlerInput,
  ShellExecutionGuardOutput
>({
  toolId: "shell.executionGuard",
  title: "Shell Execution Guard",
  description: "Classify a generated shell command before invocation construction.",
  summary: "Use shell.executionGuard to produce dry-run guard material for generated shell commands.",
  storageGroup: "shellGeneration",
  riskLevel: "risky",
  permissionHints: ["shell:generate"],
  dependencies: shellExecutionGuardDependencyDeclarations,
  inputSchema: jsonSchema("shell.executionGuard.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.executionGuard.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellExecutionGuardResult): BaseToolInvokeResult<ShellExecutionGuardOutput> {
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

export const shellExecutionGuardHandler: BaseToolHandler<ShellExecutionGuardHandlerInput, ShellExecutionGuardOutput> = {
  definition: shellExecutionGuardBaseToolDefinition,
  async invoke(request) {
    const input = isShellGenerationRecord(request.input) ? request.input as ShellExecutionGuardHandlerInput : {};
    const inputContext = isShellGenerationRecord(input.context) ? input.context : {};
    const auditMetadata = isShellGenerationRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined;
    const selection = selectShellExecutionGuardPractice({
      preferredProvider: input.preferredProvider,
    });
    return adaptResult(
      await buildShellExecutionGuardBestPractice({
        ...input,
        executor: request.executor,
        context: {
          ...inputContext,
          runtimeId: typeof inputContext.runtimeId === "string" ? inputContext.runtimeId : request.runtimeId,
          invocationId: typeof inputContext.invocationId === "string" ? inputContext.invocationId : request.toolCallId,
          auditMetadata: injectRuntimeInvocationMetadata(
            {
              ...buildShellExecutionGuardPracticeAuditMetadata(selection),
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
