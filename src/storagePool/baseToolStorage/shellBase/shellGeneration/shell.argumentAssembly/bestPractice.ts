import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellArgumentAssemblyPractice } from "./anthropic.js";
import { deepmindShellArgumentAssemblyPractice } from "./deepmind.js";
import { openaiShellArgumentAssemblyPractice } from "./openai.js";
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
  assembleShellArguments,
  type ShellArgumentAssemblyAuditEvent,
  type ShellArgumentAssemblyOutput,
  type ShellArgumentAssemblyRequest,
  type ShellArgumentAssemblyResult,
} from "./core.js";
import {
  type ShellArgumentAssemblyDependencies,
  normalizeShellArgumentAssemblyOutput,
  shellArgumentAssemblyDependencyDeclarations,
  type ShellArgumentAssemblyProvider,
  type ShellArgumentAssemblyPracticeProviderName,
  type ShellArgumentAssemblyProviderPractice,
} from "./dependencies.js";

export type ShellArgumentAssemblyBestPracticeRequest = ShellArgumentAssemblyRequest & {
  executor?: BaseToolExecutorPort;
  provider?: ShellArgumentAssemblyProvider;
  preferredProvider?: ShellArgumentAssemblyPracticeProviderName;
};

export type ShellArgumentAssemblyHandlerInput = Omit<ShellArgumentAssemblyBestPracticeRequest, "executor" | "provider">;

export type ShellArgumentAssemblyPracticeSelection = {
  providerName: ShellArgumentAssemblyPracticeProviderName;
  practice: ShellArgumentAssemblyProviderPractice;
  provider?: ShellArgumentAssemblyProvider;
};

export const shellArgumentAssemblyProviderPractices = [
  anthropicShellArgumentAssemblyPractice,
  openaiShellArgumentAssemblyPractice,
  deepmindShellArgumentAssemblyPractice,
] as const;

export const shellArgumentAssemblyBestPracticeDescriptor = {
  toolId: "shell.argumentAssembly",
  bestPractice: "runtime-governed-shell-argument-assembly",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellArgumentAssemblyDependencyDeclarations,
} as const;

const praxisNativeShellArgumentAssemblyPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis deterministic shell argument assembly core",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Used for metadata only when no provider-specific practice is selected; dry-run still uses the deterministic core directly."],
  createProvider: ({ provider }: ShellArgumentAssemblyDependencies) => provider,
} as const satisfies ShellArgumentAssemblyProviderPractice;

export function selectShellArgumentAssemblyPractice(
  dependencies: ShellArgumentAssemblyDependencies & {
    preferredProvider?: ShellArgumentAssemblyPracticeProviderName;
  } = {},
): ShellArgumentAssemblyPracticeSelection {
  return selectShellProviderPractice(
    shellArgumentAssemblyProviderPractices,
    dependencies,
    praxisNativeShellArgumentAssemblyPractice,
  );
}

function buildShellArgumentAssemblyPracticeAuditMetadata(
  selection: ShellArgumentAssemblyPracticeSelection,
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

function argumentAssemblyProviderFailure(
  code: "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED",
  message: string,
): ShellArgumentAssemblyResult {
  return {
    ok: false,
    toolId: "shell.argumentAssembly",
    error: {
      code,
      message,
      boundary: code === "GOVERNANCE_REJECTED" ? "governance" : "contract",
      publicSafe: true,
      internalDetailExposed: false,
    },
    audit: [],
    events: ["basicTool.shell.argumentAssembly.rejected"],
  };
}

const shellArgumentAssemblyProviderErrorCodes = [
  "MISSING_EXECUTABLE",
  "INVALID_ARGUMENT",
  "GOVERNANCE_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "PERMISSION_DENIED",
  "REAL_EXECUTION_BLOCKED",
] as const;

const shellArgumentAssemblyProviderErrorBoundaries = ["input", "permission", "contract", "governance"] as const;

function normalizeShellArgumentAssemblyProviderResult(result: unknown): ShellArgumentAssemblyResult {
  const envelope = requireProviderResultEnvelope(result, "shell.argumentAssembly");
  const audit = requireProviderAudit(envelope) as readonly ShellArgumentAssemblyAuditEvent[];
  const events = requireProviderEvents(envelope);

  if (!envelope.ok) {
    return {
      ok: false,
      toolId: "shell.argumentAssembly",
      error: requireProviderFailureError(
        envelope,
        shellArgumentAssemblyProviderErrorCodes,
        shellArgumentAssemblyProviderErrorBoundaries,
      ),
      audit,
      events,
    };
  }

  return {
    ok: true,
    toolId: "shell.argumentAssembly",
    output: normalizeShellArgumentAssemblyOutput(requireRecordField(envelope, "output")),
    audit,
    events,
  };
}

export async function assembleShellArgumentsBestPractice(
  request: ShellArgumentAssemblyBestPracticeRequest = {},
): Promise<ShellArgumentAssemblyResult> {
  if (!isShellGenerationRecord(request) || shellGenerationDryRunEnabled(request.context)) {
    return assembleShellArguments(request);
  }

  const dispatch = evaluateShellGenerationProviderDispatch(request.context);
  if (!dispatch.ok) {
    return argumentAssemblyProviderFailure(dispatch.code, dispatch.message);
  }

  const validation = assembleShellArguments({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (!validation.ok) {
    return validation;
  }

  const selection = selectShellArgumentAssemblyPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  if (selection.provider === undefined) {
    return argumentAssemblyProviderFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.argumentAssembly provider-backed generation requires an injected runtime provider",
    );
  }

  try {
    const providerResult = await selection.provider({
      ...request,
      context: {
        ...request.context,
        auditMetadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...buildShellArgumentAssemblyPracticeAuditMetadata(selection),
        },
      },
    });
    return normalizeShellArgumentAssemblyProviderResult(providerResult);
  } catch {
    return argumentAssemblyProviderFailure("PROVIDER_REJECTED", "shell.argumentAssembly provider rejected the generation request");
  }
}

export const shellArgumentAssemblyBaseToolDefinition = createShellBaseToolDefinition<
  ShellArgumentAssemblyHandlerInput,
  ShellArgumentAssemblyOutput
>({
  toolId: "shell.argumentAssembly",
  title: "Shell Argument Assembly",
  description: "Assemble shell executable, options, and positional values into an auditable argv envelope.",
  summary: "Use shell.argumentAssembly to build argv material before command generation.",
  storageGroup: "shellGeneration",
  riskLevel: "normal",
  permissionHints: ["shell:generate"],
  dependencies: shellArgumentAssemblyDependencyDeclarations,
  inputSchema: jsonSchema("shell.argumentAssembly.input", {
    type: "object",
    additionalProperties: true,
    required: ["executable"],
  }),
  outputSchema: jsonSchema("shell.argumentAssembly.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellArgumentAssemblyResult): BaseToolInvokeResult<ShellArgumentAssemblyOutput> {
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

export const shellArgumentAssemblyHandler: BaseToolHandler<
  ShellArgumentAssemblyHandlerInput,
  ShellArgumentAssemblyOutput
> = {
  definition: shellArgumentAssemblyBaseToolDefinition,
  async invoke(request) {
    const input = isShellGenerationRecord(request.input) ? request.input as ShellArgumentAssemblyHandlerInput : {};
    const inputContext = isShellGenerationRecord(input.context) ? input.context : {};
    const auditMetadata = isShellGenerationRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined;
    const selection = selectShellArgumentAssemblyPractice({
      preferredProvider: input.preferredProvider,
    });
    return adaptResult(
      await assembleShellArgumentsBestPractice({
        ...input,
        executor: request.executor,
        context: {
          ...inputContext,
          runtimeId: typeof inputContext.runtimeId === "string" ? inputContext.runtimeId : request.runtimeId,
          invocationId: typeof inputContext.invocationId === "string" ? inputContext.invocationId : request.toolCallId,
          auditMetadata: injectRuntimeInvocationMetadata(
            {
              ...buildShellArgumentAssemblyPracticeAuditMetadata(selection),
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
