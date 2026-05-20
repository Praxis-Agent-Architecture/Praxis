import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellSandboxEnforcementPractice } from "./anthropic.js";
import { deepmindShellSandboxEnforcementPractice } from "./deepmind.js";
import { openaiShellSandboxEnforcementPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  enforceShellSandbox,
  type ShellSandboxDecision,
  type ShellSandboxEnforcementOutput,
  type ShellSandboxEnforcementRequest,
  type ShellSandboxEnforcementResult,
} from "./core.js";
import {
  shellSandboxEnforcementDependencyDeclarations,
  type ShellSandboxEnforcementDependencies,
  type ShellSandboxEnforcementProvider,
  type ShellSandboxEnforcementProviderPractice,
  type ShellSandboxEnforcementPracticeProviderName,
} from "./dependencies.js";

export * from "./core.js";

export type ShellSandboxEnforcementBestPracticeRequest = ShellSandboxEnforcementRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellSandboxEnforcementPracticeProviderName;
  provider?: ShellSandboxEnforcementProvider;
};

export type ShellSandboxEnforcementHandlerInput = Omit<ShellSandboxEnforcementBestPracticeRequest, "executor">;

export type ShellSandboxEnforcementPracticeSelection = {
  providerName: ShellSandboxEnforcementPracticeProviderName;
  practice: ShellSandboxEnforcementProviderPractice;
  provider?: ShellSandboxEnforcementProvider;
};

export const shellSandboxEnforcementProviderPractices = [
  anthropicShellSandboxEnforcementPractice,
  openaiShellSandboxEnforcementPractice,
  deepmindShellSandboxEnforcementPractice,
] as const;

export const shellSandboxEnforcementBestPracticeDescriptor = {
  toolId: "shell.sandboxEnforcement",
  bestPractice: "runtime-governed-shell-sandbox-enforcement",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellSandboxEnforcementDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellSandboxEnforcementPracticeProviderName | undefined,
): readonly ShellSandboxEnforcementProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellSandboxEnforcementProviderPractices;
  }

  return [
    ...shellSandboxEnforcementProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellSandboxEnforcementProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellSandboxEnforcementPractice(
  dependencies: ShellSandboxEnforcementDependencies & {
    preferredProvider?: ShellSandboxEnforcementPracticeProviderName;
  } = {},
): ShellSandboxEnforcementPracticeSelection {
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
      notes: ["No injected or host shell sandbox enforcement provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function buildPracticeAuditMetadata(
  selection: ShellSandboxEnforcementPracticeSelection,
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

function contextFrom(value: unknown): ShellSandboxEnforcementRequest["context"] {
  return isRecord(value) ? value as ShellSandboxEnforcementRequest["context"] : undefined;
}

function metadataFrom(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function hasAffirmativeGuard(context: ShellSandboxEnforcementRequest["context"]): boolean {
  const guard = isRecord(context?.guard) ? context?.guard : undefined;
  if (guard?.allowed === false || guard?.accepted === false) {
    return false;
  }

  return guard?.allowed === true || guard?.accepted === true;
}

const sandboxDecisions = new Set<ShellSandboxDecision>(["enforced", "requires-approval", "rejected"]);

function normalizedStringList(value: unknown, fieldName: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`shell.sandboxEnforcement provider returned invalid ${fieldName}`);
  }

  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new Error(`shell.sandboxEnforcement provider returned invalid ${fieldName}`);
    }

    values.push(item);
  }

  return values;
}

function providerSandboxEnforcementPatch(
  value: unknown,
): Partial<Pick<ShellSandboxEnforcementOutput, "decision" | "reasons" | "requiresTapApproval">> {
  if (!isRecord(value)) {
    throw new Error("shell.sandboxEnforcement provider returned an invalid output envelope");
  }

  const patch: Partial<Pick<ShellSandboxEnforcementOutput, "decision" | "reasons" | "requiresTapApproval">> = {};
  if (value.decision !== undefined) {
    if (typeof value.decision !== "string" || !sandboxDecisions.has(value.decision as ShellSandboxDecision)) {
      throw new Error("shell.sandboxEnforcement provider returned invalid decision");
    }

    patch.decision = value.decision as ShellSandboxDecision;
  }

  const reasons = normalizedStringList(value.reasons, "reasons");
  if (reasons !== undefined) {
    patch.reasons = reasons;
  }

  if (value.requiresTapApproval !== undefined) {
    if (typeof value.requiresTapApproval !== "boolean") {
      throw new Error("shell.sandboxEnforcement provider returned invalid requiresTapApproval");
    }

    patch.requiresTapApproval = value.requiresTapApproval;
  }

  return patch;
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
  request: ShellSandboxEnforcementBestPracticeRequest,
): ShellSandboxEnforcementResult {
  return {
    ok: false,
    toolId: "shell.sandboxEnforcement",
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
        type: "agentCore.basicTool.shell.sandboxEnforcement.rejected",
        toolId: "shell.sandboxEnforcement",
        invocationId: request.context?.invocationId ?? "shell.sandboxEnforcement:runtime",
        dryRun: request.context?.dryRun !== false,
        workingDirectory: request.workingDirectory,
        metadata: { ...metadataFrom(request.context?.auditMetadata), code, boundary },
      },
    ],
    events: ["basicTool.shell.sandboxEnforcement.rejected"],
  };
}

export async function executeShellSandboxEnforcement(
  request: ShellSandboxEnforcementBestPracticeRequest = {},
): Promise<ShellSandboxEnforcementResult> {
  const selection = selectShellSandboxEnforcementPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const requestContext = contextFrom(request.context);
  const auditMetadata = {
    ...metadataFrom(requestContext?.auditMetadata),
    ...buildPracticeAuditMetadata(selection),
  };
  const planned = enforceShellSandbox({
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
      "shell.sandboxEnforcement requires an affirmative runtime guard before real provider dispatch",
      "governance",
      request,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.sandboxEnforcement requires a runtime shell guard provider for real dispatch",
      "provider",
      request,
    );
  }

  try {
    const providerRequest: ShellSandboxEnforcementRequest = {
      command: planned.output.command,
      workingDirectory: planned.output.workingDirectory,
      requestedPaths: planned.output.requestedPaths,
      accessIntents: planned.output.accessIntents,
      policy: {
        ...(isRecord(request.policy) ? request.policy : {}),
        sandboxRoots: planned.output.sandboxRoots,
      },
      context: { ...requestContext, auditMetadata },
    };
    const providerOutput = await selection.provider(
      providerRequest,
      { ...requestContext, auditMetadata },
    );
    const providerPatch = providerSandboxEnforcementPatch(providerOutput);
    return {
      ok: true,
      toolId: "shell.sandboxEnforcement",
      output: {
        ...planned.output,
        ...providerPatch,
        dryRun: false,
        providerCalled: true,
        executionBlocked: true,
        baseToolAppliedSandbox: false,
        runtimeGuardRequired: true,
      },
      audit: [
        {
          type: "agentCore.basicTool.shell.sandboxEnforcement.provider",
          toolId: "shell.sandboxEnforcement",
          invocationId: requestContext?.invocationId ?? "shell.sandboxEnforcement:runtime",
          dryRun: false,
          workingDirectory: planned.output.workingDirectory,
          metadata: auditMetadata,
        },
      ],
      events: ["basicTool.shell.sandboxEnforcement.providerCalled"],
    };
  } catch (error) {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage(error, "shell.sandboxEnforcement provider rejected the request"),
      "provider",
      request,
    );
  }
}

export function buildShellSandboxEnforcementBestPractice(
  request: ShellSandboxEnforcementBestPracticeRequest = {},
): ShellSandboxEnforcementResult {
  const selection = selectShellSandboxEnforcementPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const requestContext = contextFrom(request.context);
  return enforceShellSandbox({
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

export const shellSandboxEnforcementBaseToolDefinition = createShellBaseToolDefinition<
  ShellSandboxEnforcementHandlerInput,
  ShellSandboxEnforcementOutput
>({
  toolId: "shell.sandboxEnforcement",
  title: "Shell Sandbox Enforcement",
  description: "Validate shell working directories and requested paths against runtime sandbox roots.",
  summary: "Use shell.sandboxEnforcement to create a dry-run sandbox decision before shell execution.",
  storageGroup: "executionGuard",
  riskLevel: "risky",
  permissionHints: ["shell:sandbox"],
  dependencies: shellSandboxEnforcementDependencyDeclarations,
  inputSchema: jsonSchema("shell.sandboxEnforcement.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.sandboxEnforcement.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellSandboxEnforcementResult): BaseToolInvokeResult<ShellSandboxEnforcementOutput> {
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

export const shellSandboxEnforcementHandler: BaseToolHandler<
  ShellSandboxEnforcementHandlerInput,
  ShellSandboxEnforcementOutput
> = {
  definition: shellSandboxEnforcementBaseToolDefinition,
  async invoke(request) {
    const input = isRecord(request.input) ? request.input as ShellSandboxEnforcementHandlerInput : {};
    const inputContext = contextFrom(input.context);
    return adaptResult(
      await executeShellSandboxEnforcement({
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
