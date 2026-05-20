/*
 * 文件定位：Agent 运行态实现层 / 外部调控面。
 * 核心目的：承载 external Command Receiver 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ExternalControlBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type ExternalControlCallerKind = "application" | "official-module" | "operator" | "runtime-surface";

export type ExternalCommandKind = "read" | "mutate" | "invoke" | "mode" | "management" | "diagnostic";

export type ExternalControlTargetSurface =
  | "applicationSurface"
  | "officialModuleSurface"
  | "governancePlane"
  | "invocationMethod"
  | "managementPlane"
  | "inspection"
  | "debug"
  | "runtime.externalControl";

export type ExternalCommandEffect =
  | "read-runtime"
  | "mutate-runtime"
  | "invoke-tool"
  | "invoke-model"
  | "switch-mode"
  | "manage-runtime"
  | "inspect-runtime";

export type ExternalCommandReceiverErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_COMMAND_NAME"
  | "MISSING_TARGET_SURFACE"
  | "INVALID_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type ExternalControlGate = {
  accepted: boolean;
  reason?: string;
};

export type ExternalControlCaller = {
  kind: ExternalControlCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type ExternalControlTarget = {
  surface?: ExternalControlTargetSurface;
  operation?: string;
  resourceId?: string;
};

export type ExternalCommandTrace = {
  correlationId?: string;
  parentCommandId?: string;
  receivedAt?: string;
};

export type ExternalCommandReceiverRequest = {
  runtimeId?: string;
  commandId?: string;
  commandKind?: ExternalCommandKind;
  commandName?: string;
  caller?: ExternalControlCaller;
  target?: ExternalControlTarget;
  requestedEffects?: readonly ExternalCommandEffect[];
  payload?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
  trace?: ExternalCommandTrace;
  runtimeReady?: boolean;
  contract?: ExternalControlGate;
  governance?: ExternalControlGate;
};

export type ExternalCommandEnvelope = {
  surface: "runtime.externalControl";
  mode: "dry-run";
  runtimeId: string;
  commandId: string;
  commandKind: ExternalCommandKind;
  commandName: string;
  caller: ExternalControlCaller;
  target: {
    surface: ExternalControlTargetSurface;
    operation?: string;
    resourceId?: string;
  };
  requestedEffects: readonly ExternalCommandEffect[];
  payload: Readonly<Record<string, unknown>>;
  payloadKeys: readonly string[];
  trace: ExternalCommandTrace;
  route: "agent_runtimeImplementation.runtime.externalControl.externalCommandReceiver";
  audit: {
    dryRun: true;
    acceptedByReceiver: true;
    unsafeSideEffects: false;
    governanceRequired: true;
    contractSurface: "runtime.contractSurface";
  };
  metadata: Readonly<Record<string, unknown>>;
};

export type ExternalCommandReceiverError = {
  code: ExternalCommandReceiverErrorCode;
  message: string;
  boundary: ExternalControlBoundary;
  safeForInspection: true;
  internalDetailExposed: false;
};

export type ExternalCommandReceiverResult =
  | {
      ok: true;
      command: ExternalCommandEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExternalCommandReceiverError;
      events: readonly string[];
    };

export const externalCommandReceiverDescriptor = {
  surface: "runtime.externalControl",
  capability: "externalCommandReceiver",
  purpose: "normalize an external runtime control command into a governed dry-run envelope",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanExternalCommandEffects(
  values: readonly ExternalCommandEffect[] | undefined,
): readonly ExternalCommandEffect[] {
  return [...new Set(values ?? [])];
}

function failure(
  code: ExternalCommandReceiverErrorCode,
  message: string,
  boundary: ExternalControlBoundary,
): ExternalCommandReceiverResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.externalControl.commandReceiver.rejected"],
  };
}

function normalizeCaller(caller: ExternalControlCaller): ExternalControlCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
    sessionId: caller.sessionId?.trim() || undefined,
  };
}

function defaultEffects(commandKind: ExternalCommandKind): readonly ExternalCommandEffect[] {
  switch (commandKind) {
    case "read":
      return ["read-runtime"];
    case "mutate":
      return ["mutate-runtime"];
    case "invoke":
      return ["invoke-tool"];
    case "mode":
      return ["switch-mode"];
    case "management":
      return ["manage-runtime"];
    case "diagnostic":
      return ["inspect-runtime"];
  }
}

export function receiveExternalCommand(request?: ExternalCommandReceiverRequest): ExternalCommandReceiverResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "external command receiver requires runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "external command receiver requires a caller with a stable id", "input");
  }

  if (isBlank(request.commandName)) {
    return failure("MISSING_COMMAND_NAME", "external command receiver requires commandName", "input");
  }

  if (request.target?.surface === undefined) {
    return failure("MISSING_TARGET_SURFACE", "external command receiver requires a target surface", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return failure("INVALID_PAYLOAD", "external command payload must be a plain record", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "external command receiver requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the external command",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the external command",
      "governance",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const commandKind = request.commandKind ?? "diagnostic";
  const commandName = (request.commandName ?? "").trim();
  const commandId = request.commandId?.trim() || `${runtimeId}:external-command:${commandName}`;
  const requestedEffects = cleanExternalCommandEffects(request.requestedEffects);
  const payload = request.payload ?? {};

  return {
    ok: true,
    command: {
      surface: "runtime.externalControl",
      mode: "dry-run",
      runtimeId,
      commandId,
      commandKind,
      commandName,
      caller: normalizeCaller(request.caller),
      target: {
        surface: request.target.surface,
        operation: request.target.operation?.trim() || undefined,
        resourceId: request.target.resourceId?.trim() || undefined,
      },
      requestedEffects: requestedEffects.length > 0 ? requestedEffects : defaultEffects(commandKind),
      payload,
      payloadKeys: Object.keys(payload),
      trace: {
        correlationId: request.trace?.correlationId?.trim() || commandId,
        parentCommandId: request.trace?.parentCommandId?.trim() || undefined,
        receivedAt: request.trace?.receivedAt?.trim() || "dry-run",
      },
      route: "agent_runtimeImplementation.runtime.externalControl.externalCommandReceiver",
      audit: {
        dryRun: true,
        acceptedByReceiver: true,
        unsafeSideEffects: false,
        governanceRequired: true,
        contractSurface: "runtime.contractSurface",
      },
      metadata: request.metadata ?? {},
    },
    events: ["runtime.externalControl.commandReceiver.accepted"],
  };
}
