/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Operator Console 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  cleanRuntimeManagementList,
  hasRuntimeManagementText,
  type RuntimeManagementBoundary,
  type RuntimeManagementError,
  type RuntimeManagementGate,
  type RuntimeManagementSurface,
} from "./runtimeManagementPlane.js";

export type RuntimeOperatorRole = "admin" | "maintainer" | "observer" | "automation" | (string & {});

export type RuntimeOperatorConsoleVerb =
  | "inspect"
  | "route-command"
  | "plan-mutation"
  | "govern-resource"
  | "request-rollback"
  | "open-access-session"
  | (string & {});

export type RuntimeOperatorIdentity = {
  operatorId?: string;
  role?: RuntimeOperatorRole;
  sessionId?: string;
};

export type RuntimeOperatorCommandInput = {
  commandId?: string;
  verb?: RuntimeOperatorConsoleVerb;
  targetSurface?: RuntimeManagementSurface;
  requestedScopes?: readonly string[];
  reason?: string;
  payload?: Readonly<Record<string, unknown>>;
};

export type RuntimeOperatorCommandEnvelope = {
  commandId: string;
  verb: RuntimeOperatorConsoleVerb;
  targetSurface: RuntimeManagementSurface;
  requestedScopes: readonly string[];
  reason?: string;
  auditTags: readonly string[];
  payload: Readonly<Record<string, unknown>>;
  dryRunOnly: true;
};

export type RuntimeOperatorConsoleSession = {
  runtimeId: string;
  operator: {
    operatorId: string;
    role: RuntimeOperatorRole;
    sessionId?: string;
  };
  route: "runtime.managementPlane.operatorConsole";
  phase: "accepted";
  commands: readonly RuntimeOperatorCommandEnvelope[];
  commandIds: readonly string[];
  forwardedSurfaces: readonly RuntimeManagementSurface[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  auditRequired: true;
  governanceChecked: true;
  contractChecked: true;
  mockableEnvelope: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeOperatorConsoleErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_OPERATOR"
  | "MISSING_COMMANDS"
  | "MISSING_COMMAND_ID"
  | "MISSING_COMMAND_VERB"
  | "MISSING_TARGET_SURFACE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeOperatorConsoleError = Omit<RuntimeManagementError, "code"> & {
  code: RuntimeOperatorConsoleErrorCode;
};

export type RuntimeOperatorConsoleRequest = {
  runtimeId?: string;
  operator?: RuntimeOperatorIdentity;
  commands?: readonly RuntimeOperatorCommandInput[];
  runtimeReady?: boolean;
  allowedScopes?: readonly string[];
  contract?: RuntimeManagementGate;
  governance?: RuntimeManagementGate;
};

export type RuntimeOperatorConsoleResult =
  | {
      ok: true;
      console: RuntimeOperatorConsoleSession;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeOperatorConsoleError;
      events: readonly string[];
    };

function rejectRuntimeOperatorConsole(
  code: RuntimeOperatorConsoleErrorCode,
  message: string,
  boundary: RuntimeManagementBoundary,
): RuntimeOperatorConsoleResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["runtime.managementPlane.operatorConsole.rejected"],
  };
}

function normalizeOperator(operator: RuntimeOperatorIdentity): RuntimeOperatorConsoleSession["operator"] {
  const normalized: RuntimeOperatorConsoleSession["operator"] = {
    operatorId: (operator.operatorId ?? "").trim(),
    role: operator.role ?? "observer",
  };

  const sessionId = operator.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function createCommandEnvelope(
  command: RuntimeOperatorCommandInput,
): RuntimeOperatorCommandEnvelope | RuntimeOperatorConsoleResult {
  const commandId = command.commandId?.trim();
  const verb = command.verb?.trim();
  const targetSurface = command.targetSurface?.trim();

  if (!hasRuntimeManagementText(commandId)) {
    return rejectRuntimeOperatorConsole(
      "MISSING_COMMAND_ID",
      "runtime operator console commands require a commandId",
      "input",
    );
  }

  if (!hasRuntimeManagementText(verb)) {
    return rejectRuntimeOperatorConsole(
      "MISSING_COMMAND_VERB",
      `runtime operator command ${commandId} requires a verb`,
      "input",
    );
  }

  if (!hasRuntimeManagementText(targetSurface)) {
    return rejectRuntimeOperatorConsole(
      "MISSING_TARGET_SURFACE",
      `runtime operator command ${commandId} requires a targetSurface`,
      "management-surface",
    );
  }

  const requestedScopes = cleanRuntimeManagementList(command.requestedScopes);

  return {
    commandId,
    verb,
    targetSurface,
    requestedScopes,
    reason: command.reason?.trim(),
    auditTags: cleanRuntimeManagementList(["runtime.managementPlane", targetSurface, verb, ...requestedScopes]),
    payload: command.payload ?? {},
    dryRunOnly: true,
  };
}

export function openRuntimeOperatorConsole(
  request?: RuntimeOperatorConsoleRequest,
): RuntimeOperatorConsoleResult {
  if (request === undefined || !hasRuntimeManagementText(request.runtimeId)) {
    return rejectRuntimeOperatorConsole("MISSING_RUNTIME_ID", "runtime operator console requires a runtimeId", "input");
  }

  if (request.operator === undefined || !hasRuntimeManagementText(request.operator.operatorId)) {
    return rejectRuntimeOperatorConsole(
      "MISSING_OPERATOR",
      "runtime operator console requires an operator identity",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeOperatorConsole(
      "RUNTIME_NOT_READY",
      "runtime operator console can only open against a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeOperatorConsole(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime operator console was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeOperatorConsole(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime operator console was rejected by governance",
      "governance",
    );
  }

  if ((request.commands ?? []).length === 0) {
    return rejectRuntimeOperatorConsole(
      "MISSING_COMMANDS",
      "runtime operator console requires at least one guarded command envelope",
      "input",
    );
  }

  const commands: RuntimeOperatorCommandEnvelope[] = [];
  for (const command of request.commands ?? []) {
    const envelope = createCommandEnvelope(command);
    if ("ok" in envelope) {
      return envelope;
    }

    commands.push(envelope);
  }

  const requestedScopes = cleanRuntimeManagementList(commands.flatMap((command) => command.requestedScopes));
  const allowedScopes = cleanRuntimeManagementList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0
      ? requestedScopes
      : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return rejectRuntimeOperatorConsole(
      "SCOPE_DENIED",
      `runtime operator console includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  return {
    ok: true,
    console: {
      runtimeId: request.runtimeId.trim(),
      operator: normalizeOperator(request.operator),
      route: "runtime.managementPlane.operatorConsole",
      phase: "accepted",
      commands,
      commandIds: commands.map((command) => command.commandId),
      forwardedSurfaces: cleanRuntimeManagementList(commands.map((command) => command.targetSurface)),
      requestedScopes,
      grantedScopes,
      auditRequired: true,
      governanceChecked: true,
      contractChecked: true,
      mockableEnvelope: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.managementPlane.operatorConsole.accepted"],
  };
}
