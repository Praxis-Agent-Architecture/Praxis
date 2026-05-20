import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellScriptGenerationPractice } from "./anthropic.js";
import { deepmindShellScriptGenerationPractice } from "./deepmind.js";
import { openaiShellScriptGenerationPractice } from "./openai.js";
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
  generateShellScriptPlan,
  type ShellScriptGenerationAuditEvent,
  type ShellScriptGenerationOutput,
  type ShellScriptGenerationRequest,
  type ShellScriptGenerationResult,
} from "./core.js";
import {
  type ShellScriptGenerationDependencies,
  normalizeShellScriptGenerationOutput,
  shellScriptGenerationDependencyDeclarations,
  type ShellScriptGenerationProvider,
  type ShellScriptGenerationPracticeProviderName,
  type ShellScriptGenerationProviderPractice,
} from "./dependencies.js";

export type ShellScriptGenerationBestPracticeRequest = ShellScriptGenerationRequest & {
  executor?: BaseToolExecutorPort;
  provider?: ShellScriptGenerationProvider;
  preferredProvider?: ShellScriptGenerationPracticeProviderName;
};

export type ShellScriptGenerationHandlerInput = Omit<ShellScriptGenerationBestPracticeRequest, "executor" | "provider">;

export type ShellScriptGenerationPracticeSelection = {
  providerName: ShellScriptGenerationPracticeProviderName;
  practice: ShellScriptGenerationProviderPractice;
  provider?: ShellScriptGenerationProvider;
};

export const shellScriptGenerationProviderPractices = [
  anthropicShellScriptGenerationPractice,
  openaiShellScriptGenerationPractice,
  deepmindShellScriptGenerationPractice,
] as const satisfies readonly ShellScriptGenerationProviderPractice[];

const praxisNativeShellScriptGenerationPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis deterministic shell script generation core",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Used for metadata only when no provider-specific practice is selected; dry-run still uses the deterministic core directly."],
  createProvider: ({ provider }: ShellScriptGenerationDependencies) => provider,
} as const satisfies ShellScriptGenerationProviderPractice;

export const shellScriptGenerationBestPracticeDescriptor = {
  toolId: "shell.scriptGeneration",
  bestPractice: "runtime-governed-shell-script-generation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellScriptGenerationDependencyDeclarations,
} as const;

export function selectShellScriptGenerationPractice(
  dependencies: ShellScriptGenerationDependencies & {
    preferredProvider?: ShellScriptGenerationPracticeProviderName;
  } = {},
): ShellScriptGenerationPracticeSelection {
  return selectShellProviderPractice(
    shellScriptGenerationProviderPractices,
    dependencies,
    praxisNativeShellScriptGenerationPractice,
  );
}

function buildShellScriptGenerationPracticeAuditMetadata(
  selection: ShellScriptGenerationPracticeSelection,
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

function scriptGenerationProviderFailure(
  code: "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED",
  message: string,
): ShellScriptGenerationResult {
  return {
    ok: false,
    toolId: "shell.scriptGeneration",
    error: {
      code,
      message,
      boundary: code === "GOVERNANCE_REJECTED" ? "governance" : "contract",
      publicSafe: true,
      internalDetailExposed: false,
    },
    audit: [],
    events: ["basicTool.shell.scriptGeneration.rejected"],
  };
}

const shellScriptGenerationProviderErrorCodes = [
  "MISSING_COMMANDS",
  "INVALID_COMMAND",
  "INVALID_SHELL",
  "INVALID_SCRIPT_NAME",
  "INVALID_ENVIRONMENT",
  "INVALID_WORKING_DIRECTORY",
  "PERMISSION_DENIED",
  "SCOPE_REJECTED",
  "GOVERNANCE_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "REAL_EXECUTION_BLOCKED",
] as const;

const shellScriptGenerationProviderErrorBoundaries = ["input", "permission", "scope", "governance", "contract"] as const;

function normalizeShellScriptGenerationProviderResult(result: unknown): ShellScriptGenerationResult {
  const envelope = requireProviderResultEnvelope(result, "shell.scriptGeneration");
  const audit = requireProviderAudit(envelope) as readonly ShellScriptGenerationAuditEvent[];
  const events = requireProviderEvents(envelope);

  if (!envelope.ok) {
    return {
      ok: false,
      toolId: "shell.scriptGeneration",
      error: requireProviderFailureError(
        envelope,
        shellScriptGenerationProviderErrorCodes,
        shellScriptGenerationProviderErrorBoundaries,
      ),
      audit,
      events,
    };
  }

  return {
    ok: true,
    toolId: "shell.scriptGeneration",
    output: normalizeShellScriptGenerationOutput(requireRecordField(envelope, "output")),
    audit,
    events,
  };
}

export async function generateShellScriptPlanBestPractice(
  request: ShellScriptGenerationBestPracticeRequest = {},
): Promise<ShellScriptGenerationResult> {
  if (!isShellGenerationRecord(request) || shellGenerationDryRunEnabled(request.context)) {
    return generateShellScriptPlan(request);
  }

  const dispatch = evaluateShellGenerationProviderDispatch(request.context);
  if (!dispatch.ok) {
    return scriptGenerationProviderFailure(dispatch.code, dispatch.message);
  }

  const validation = generateShellScriptPlan({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (!validation.ok) {
    return validation;
  }

  const selection = selectShellScriptGenerationPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  if (selection.provider === undefined) {
    return scriptGenerationProviderFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.scriptGeneration provider-backed generation requires an injected runtime provider",
    );
  }

  try {
    const providerResult = await selection.provider({
      ...request,
      context: {
        ...request.context,
        auditMetadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...buildShellScriptGenerationPracticeAuditMetadata(selection),
        },
      },
    });
    return normalizeShellScriptGenerationProviderResult(providerResult);
  } catch {
    return scriptGenerationProviderFailure("PROVIDER_REJECTED", "shell.scriptGeneration provider rejected the generation request");
  }
}

export const shellScriptGenerationBaseToolDefinition = createShellBaseToolDefinition<
  ShellScriptGenerationHandlerInput,
  ShellScriptGenerationOutput
>({
  toolId: "shell.scriptGeneration",
  title: "Shell Script Generation",
  description: "Generate a guarded shell script plan without executing it.",
  summary: "Use shell.scriptGeneration to produce auditable script material for later runtime-governed execution.",
  storageGroup: "shellGeneration",
  riskLevel: "risky",
  permissionHints: ["shell:script:generate"],
  dependencies: shellScriptGenerationDependencyDeclarations,
  inputSchema: jsonSchema("shell.scriptGeneration.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.scriptGeneration.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellScriptGenerationResult): BaseToolInvokeResult<ShellScriptGenerationOutput> {
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

export const shellScriptGenerationHandler: BaseToolHandler<
  ShellScriptGenerationHandlerInput,
  ShellScriptGenerationOutput
> = {
  definition: shellScriptGenerationBaseToolDefinition,
  async invoke(request) {
    const input = isShellGenerationRecord(request.input) ? request.input as ShellScriptGenerationHandlerInput : {};
    const inputContext = isShellGenerationRecord(input.context) ? input.context : {};
    const auditMetadata = isShellGenerationRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined;
    const selection = selectShellScriptGenerationPractice({
      preferredProvider: input.preferredProvider,
    });
    return adaptResult(
      await generateShellScriptPlanBestPractice({
        ...input,
        executor: request.executor,
        context: {
          ...inputContext,
          runtimeId: typeof inputContext.runtimeId === "string" ? inputContext.runtimeId : request.runtimeId,
          invocationId: typeof inputContext.invocationId === "string" ? inputContext.invocationId : request.toolCallId,
          auditMetadata: injectRuntimeInvocationMetadata(
            {
              ...buildShellScriptGenerationPracticeAuditMetadata(selection),
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
