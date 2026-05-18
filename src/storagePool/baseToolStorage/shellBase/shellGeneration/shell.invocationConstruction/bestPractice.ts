import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { anthropicShellInvocationConstructionPractice } from "./anthropic.js";
import { deepmindShellInvocationConstructionPractice } from "./deepmind.js";
import { openaiShellInvocationConstructionPractice } from "./openai.js";
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
  constructShellInvocation,
  type ShellInvocationConstructionAuditEvent,
  type ShellInvocationConstructionRequest,
  type ShellInvocationConstructionResult,
  type ShellInvocationEnvelope,
} from "./core.js";
import {
  type ShellInvocationConstructionDependencies,
  normalizeShellInvocationEnvelope,
  shellInvocationConstructionDependencyDeclarations,
  type ShellInvocationConstructionProvider,
  type ShellInvocationConstructionPracticeProviderName,
  type ShellInvocationConstructionProviderPractice,
} from "./dependencies.js";

export type ShellInvocationConstructionBestPracticeRequest = ShellInvocationConstructionRequest & {
  executor?: BaseToolExecutorPort;
  provider?: ShellInvocationConstructionProvider;
  preferredProvider?: ShellInvocationConstructionPracticeProviderName;
};

export type ShellInvocationConstructionHandlerInput = Omit<ShellInvocationConstructionBestPracticeRequest, "executor" | "provider">;

export type ShellInvocationConstructionPracticeSelection = {
  providerName: ShellInvocationConstructionPracticeProviderName;
  practice: ShellInvocationConstructionProviderPractice;
  provider?: ShellInvocationConstructionProvider;
};

export const shellInvocationConstructionProviderPractices = [
  anthropicShellInvocationConstructionPractice,
  openaiShellInvocationConstructionPractice,
  deepmindShellInvocationConstructionPractice,
] as const satisfies readonly ShellInvocationConstructionProviderPractice[];

const praxisNativeShellInvocationConstructionPractice = {
  providerName: "praxis-native",
  source: {
    kind: "praxis-native",
    label: "Praxis deterministic shell invocation construction core",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Used for metadata only when no provider-specific practice is selected; dry-run still uses the deterministic core directly."],
  createProvider: ({ provider }: ShellInvocationConstructionDependencies) => provider,
} as const satisfies ShellInvocationConstructionProviderPractice;

export const shellInvocationConstructionBestPracticeDescriptor = {
  toolId: "shell.invocationConstruction",
  bestPractice: "runtime-governed-shell-invocation-construction",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellInvocationConstructionDependencyDeclarations,
} as const;

export function selectShellInvocationConstructionPractice(
  dependencies: ShellInvocationConstructionDependencies & {
    preferredProvider?: ShellInvocationConstructionPracticeProviderName;
  } = {},
): ShellInvocationConstructionPracticeSelection {
  return selectShellProviderPractice(
    shellInvocationConstructionProviderPractices,
    dependencies,
    praxisNativeShellInvocationConstructionPractice,
  );
}

function buildShellInvocationConstructionPracticeAuditMetadata(
  selection: ShellInvocationConstructionPracticeSelection,
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

function invocationConstructionProviderFailure(
  code: "GOVERNANCE_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED",
  message: string,
): ShellInvocationConstructionResult {
  return {
    ok: false,
    toolId: "shell.invocationConstruction",
    error: {
      code,
      message,
      boundary: code === "GOVERNANCE_REJECTED" ? "governance" : "contract",
      publicSafe: true,
      internalDetailExposed: false,
    },
    audit: [],
    events: ["basicTool.shell.invocationConstruction.rejected"],
  };
}

const shellInvocationConstructionProviderErrorCodes = [
  "MISSING_COMMAND",
  "MISSING_GUARD",
  "INVALID_COMMAND",
  "INVALID_GUARD",
  "GUARD_BLOCKED",
  "PERMISSION_DENIED",
  "GOVERNANCE_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "REAL_EXECUTION_BLOCKED",
] as const;

const shellInvocationConstructionProviderErrorBoundaries = ["input", "permission", "contract", "governance"] as const;

function normalizeShellInvocationConstructionProviderResult(result: unknown): ShellInvocationConstructionResult {
  const envelope = requireProviderResultEnvelope(result, "shell.invocationConstruction");
  const audit = requireProviderAudit(envelope) as readonly ShellInvocationConstructionAuditEvent[];
  const events = requireProviderEvents(envelope);

  if (!envelope.ok) {
    return {
      ok: false,
      toolId: "shell.invocationConstruction",
      error: requireProviderFailureError(
        envelope,
        shellInvocationConstructionProviderErrorCodes,
        shellInvocationConstructionProviderErrorBoundaries,
      ),
      audit,
      events,
    };
  }

  return {
    ok: true,
    toolId: "shell.invocationConstruction",
    invocation: normalizeShellInvocationEnvelope(requireRecordField(envelope, "invocation")),
    audit,
    events,
  };
}

export async function constructShellInvocationBestPractice(
  request: ShellInvocationConstructionBestPracticeRequest = {},
): Promise<ShellInvocationConstructionResult> {
  if (!isShellGenerationRecord(request) || shellGenerationDryRunEnabled(request.context)) {
    return constructShellInvocation(request);
  }

  const dispatch = evaluateShellGenerationProviderDispatch(request.context);
  if (!dispatch.ok) {
    return invocationConstructionProviderFailure(dispatch.code, dispatch.message);
  }

  const validation = constructShellInvocation({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (!validation.ok) {
    return validation;
  }

  const selection = selectShellInvocationConstructionPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  if (selection.provider === undefined) {
    return invocationConstructionProviderFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.invocationConstruction provider-backed generation requires an injected runtime provider",
    );
  }

  try {
    const providerResult = await selection.provider({
      ...request,
      context: {
        ...request.context,
        auditMetadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...buildShellInvocationConstructionPracticeAuditMetadata(selection),
        },
      },
    });
    return normalizeShellInvocationConstructionProviderResult(providerResult);
  } catch {
    return invocationConstructionProviderFailure(
      "PROVIDER_REJECTED",
      "shell.invocationConstruction provider rejected the generation request",
    );
  }
}

export const shellInvocationConstructionBaseToolDefinition = createShellBaseToolDefinition<
  ShellInvocationConstructionHandlerInput,
  ShellInvocationEnvelope
>({
  toolId: "shell.invocationConstruction",
  title: "Shell Invocation Construction",
  description: "Build a runtime-visible shell invocation envelope from generated command and guard material.",
  summary: "Use shell.invocationConstruction after command generation and execution guard evaluation.",
  storageGroup: "shellGeneration",
  riskLevel: "normal",
  permissionHints: ["shell:generate"],
  dependencies: shellInvocationConstructionDependencyDeclarations,
  inputSchema: jsonSchema("shell.invocationConstruction.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.invocationConstruction.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellInvocationConstructionResult): BaseToolInvokeResult<ShellInvocationEnvelope> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: result.toolId,
      error: { code: result.error.code, message: result.error.message, publicSafe: true },
      events: result.events,
    };
  }
  return { ok: true, toolId: result.toolId, output: result.invocation, events: result.events, metadata: { audit: result.audit } };
}

export const shellInvocationConstructionHandler: BaseToolHandler<
  ShellInvocationConstructionHandlerInput,
  ShellInvocationEnvelope
> = {
  definition: shellInvocationConstructionBaseToolDefinition,
  async invoke(request) {
    const input = isShellGenerationRecord(request.input) ? request.input as ShellInvocationConstructionHandlerInput : {};
    const inputContext = isShellGenerationRecord(input.context) ? input.context : {};
    const auditMetadata = isShellGenerationRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined;
    const selection = selectShellInvocationConstructionPractice({
      preferredProvider: input.preferredProvider,
    });
    return adaptResult(
      await constructShellInvocationBestPractice({
        ...input,
        executor: request.executor,
        context: {
          ...inputContext,
          runtimeId: typeof inputContext.runtimeId === "string" ? inputContext.runtimeId : request.runtimeId,
          sessionId: typeof inputContext.sessionId === "string" ? inputContext.sessionId : request.sessionId,
          invocationId: typeof inputContext.invocationId === "string" ? inputContext.invocationId : request.toolCallId,
          auditMetadata: injectRuntimeInvocationMetadata(
            {
              ...buildShellInvocationConstructionPracticeAuditMetadata(selection),
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
