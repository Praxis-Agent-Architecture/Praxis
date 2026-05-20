import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler, BaseToolInvokeResult } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicShellPermissionControlPractice } from "./anthropic.js";
import { deepmindShellPermissionControlPractice } from "./deepmind.js";
import { openaiShellPermissionControlPractice } from "./openai.js";
import {
  buildShellPracticeAuditMetadata,
  createShellBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  controlShellExecutionPermission,
  shellExecutionPermissionValues,
  type ShellExecutionPermission,
  type ShellPermissionDecision,
  type ShellPermissionControlOutput,
  type ShellPermissionControlRequest,
  type ShellPermissionControlResult,
} from "./core.js";
import {
  shellPermissionControlDependencyDeclarations,
  type ShellPermissionControlDependencies,
  type ShellPermissionControlProvider,
  type ShellPermissionControlProviderPractice,
  type ShellPermissionControlPracticeProviderName,
} from "./dependencies.js";

export * from "./core.js";

export type ShellPermissionControlBestPracticeRequest = ShellPermissionControlRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: ShellPermissionControlPracticeProviderName;
  provider?: ShellPermissionControlProvider;
};

export type ShellPermissionControlHandlerInput = Omit<ShellPermissionControlBestPracticeRequest, "executor">;

export type ShellPermissionControlPracticeSelection = {
  providerName: ShellPermissionControlPracticeProviderName;
  practice: ShellPermissionControlProviderPractice;
  provider?: ShellPermissionControlProvider;
};

export const shellPermissionControlProviderPractices = [
  anthropicShellPermissionControlPractice,
  openaiShellPermissionControlPractice,
  deepmindShellPermissionControlPractice,
] as const;

export const shellPermissionControlBestPracticeDescriptor = {
  toolId: "shell.permissionControl",
  bestPractice: "runtime-governed-shell-permission-control",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellPermissionControlDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellPermissionControlPracticeProviderName | undefined,
): readonly ShellPermissionControlProviderPractice[] {
  if (preferredProvider === undefined) {
    return shellPermissionControlProviderPractices;
  }

  return [
    ...shellPermissionControlProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellPermissionControlProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellPermissionControlPractice(
  dependencies: ShellPermissionControlDependencies & {
    preferredProvider?: ShellPermissionControlPracticeProviderName;
  } = {},
): ShellPermissionControlPracticeSelection {
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
      notes: ["No injected or host shell permission control provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function buildPracticeAuditMetadata(
  selection: ShellPermissionControlPracticeSelection,
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

function contextFrom(value: unknown): ShellPermissionControlRequest["context"] {
  return isRecord(value) ? value as ShellPermissionControlRequest["context"] : undefined;
}

function metadataFrom(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function hasAffirmativeGuard(context: ShellPermissionControlRequest["context"]): boolean {
  const guard = isRecord(context?.guard) ? context?.guard : undefined;
  if (guard?.allowed === false || guard?.accepted === false) {
    return false;
  }

  return guard?.allowed === true || guard?.accepted === true;
}

const permissionDecisions = new Set<ShellPermissionDecision>(["granted", "denied", "approval-required"]);
const validShellExecutionPermissions = new Set<ShellExecutionPermission>(shellExecutionPermissionValues);

function normalizedPermissionList(value: unknown, fieldName: string): readonly ShellExecutionPermission[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`shell.permissionControl provider returned invalid ${fieldName}`);
  }

  const permissions: ShellExecutionPermission[] = [];
  for (const item of value) {
    const permission = typeof item === "string" ? item.trim() : "";
    if (!validShellExecutionPermissions.has(permission as ShellExecutionPermission)) {
      throw new Error(`shell.permissionControl provider returned invalid ${fieldName}`);
    }

    permissions.push(permission as ShellExecutionPermission);
  }

  return [...new Set(permissions)];
}

function providerPermissionControlPatch(
  value: unknown,
): Partial<Pick<ShellPermissionControlOutput, "decision" | "grantedPermissions" | "missingPermissions" | "approvalId">> {
  if (!isRecord(value)) {
    throw new Error("shell.permissionControl provider returned an invalid output envelope");
  }

  const patch: Partial<Pick<ShellPermissionControlOutput, "decision" | "grantedPermissions" | "missingPermissions" | "approvalId">> = {};
  if (value.decision !== undefined) {
    if (typeof value.decision !== "string" || !permissionDecisions.has(value.decision as ShellPermissionDecision)) {
      throw new Error("shell.permissionControl provider returned invalid decision");
    }

    patch.decision = value.decision as ShellPermissionDecision;
  }

  const grantedPermissions = normalizedPermissionList(value.grantedPermissions, "grantedPermissions");
  if (grantedPermissions !== undefined) {
    patch.grantedPermissions = grantedPermissions;
  }

  const missingPermissions = normalizedPermissionList(value.missingPermissions, "missingPermissions");
  if (missingPermissions !== undefined) {
    patch.missingPermissions = missingPermissions;
  }

  if (value.approvalId !== undefined) {
    if (typeof value.approvalId !== "string") {
      throw new Error("shell.permissionControl provider returned invalid approvalId");
    }

    patch.approvalId = value.approvalId.trim() || undefined;
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
  request: ShellPermissionControlBestPracticeRequest,
): ShellPermissionControlResult {
  return {
    ok: false,
    toolId: "shell.permissionControl",
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
        type: "agentCore.basicTool.shell.permissionControl.rejected",
        toolId: "shell.permissionControl",
        invocationId: request.context?.invocationId ?? "shell.permissionControl:runtime",
        dryRun: request.context?.dryRun !== false,
        workingDirectory: request.workingDirectory,
        metadata: { ...metadataFrom(request.context?.auditMetadata), code, boundary },
      },
    ],
    events: ["basicTool.shell.permissionControl.rejected"],
  };
}

export async function executeShellPermissionControl(
  request: ShellPermissionControlBestPracticeRequest = {},
): Promise<ShellPermissionControlResult> {
  const selection = selectShellPermissionControlPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const requestContext = contextFrom(request.context);
  const auditMetadata = {
    ...metadataFrom(requestContext?.auditMetadata),
    ...buildPracticeAuditMetadata(selection),
  };
  const planned = controlShellExecutionPermission({
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
      "shell.permissionControl requires an affirmative runtime guard before real provider dispatch",
      "governance",
      request,
    );
  }

  if (selection.provider === undefined) {
    return runtimeFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.permissionControl requires a runtime shell guard provider for real dispatch",
      "provider",
      request,
    );
  }

  try {
    const providerRequest: ShellPermissionControlRequest = {
      command: planned.output.command,
      workingDirectory: planned.output.workingDirectory,
      requestedPermissions: planned.output.requestedPermissions,
      riskLevel: request.riskLevel === "high" || request.riskLevel === "medium" ? request.riskLevel : "low",
      context: { ...requestContext, auditMetadata },
    };
    const providerOutput = await selection.provider(
      providerRequest,
      { ...requestContext, auditMetadata },
    );
    const providerPatch = providerPermissionControlPatch(providerOutput);
    return {
      ok: true,
      toolId: "shell.permissionControl",
      output: {
        ...planned.output,
        ...providerPatch,
        dryRun: false,
        providerCalled: true,
        executionBlocked: true,
        finalAuthorizationGranted: false,
        runtimeGuardRequired: true,
      },
      audit: [
        {
          type: "agentCore.basicTool.shell.permissionControl.provider",
          toolId: "shell.permissionControl",
          invocationId: requestContext?.invocationId ?? "shell.permissionControl:runtime",
          dryRun: false,
          workingDirectory: planned.output.workingDirectory,
          metadata: auditMetadata,
        },
      ],
      events: ["basicTool.shell.permissionControl.providerCalled"],
    };
  } catch (error) {
    return runtimeFailure(
      "PROVIDER_REJECTED",
      providerRejectedMessage(error, "shell.permissionControl provider rejected the request"),
      "provider",
      request,
    );
  }
}

export function buildShellPermissionControlBestPractice(
  request: ShellPermissionControlBestPracticeRequest = {},
): ShellPermissionControlResult {
  const selection = selectShellPermissionControlPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  const requestContext = contextFrom(request.context);
  return controlShellExecutionPermission({
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

export const shellPermissionControlBaseToolDefinition = createShellBaseToolDefinition<
  ShellPermissionControlHandlerInput,
  ShellPermissionControlOutput
>({
  toolId: "shell.permissionControl",
  title: "Shell Permission Control",
  description: "Resolve requested shell execution permissions against runtime/TAP governance material.",
  summary: "Use shell.permissionControl to create a dry-run shell permission decision before execution.",
  storageGroup: "executionGuard",
  riskLevel: "risky",
  permissionHints: ["shell:validate", "shell:execute"],
  dependencies: shellPermissionControlDependencyDeclarations,
  inputSchema: jsonSchema("shell.permissionControl.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("shell.permissionControl.output", { type: "object", additionalProperties: true }),
});

function adaptResult(result: ShellPermissionControlResult): BaseToolInvokeResult<ShellPermissionControlOutput> {
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

export const shellPermissionControlHandler: BaseToolHandler<
  ShellPermissionControlHandlerInput,
  ShellPermissionControlOutput
> = {
  definition: shellPermissionControlBaseToolDefinition,
  async invoke(request) {
    const input = isRecord(request.input) ? request.input as ShellPermissionControlHandlerInput : {};
    const inputContext = contextFrom(input.context);
    return adaptResult(
      await executeShellPermissionControl({
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
