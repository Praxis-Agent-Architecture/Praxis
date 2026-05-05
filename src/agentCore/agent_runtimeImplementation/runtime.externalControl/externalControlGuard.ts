/*
 * 文件定位：Agent 运行态实现层 / 外部调控面。
 * 核心目的：承载 external Control Guard 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ExternalCommandEffect,
  ExternalCommandEnvelope,
  ExternalControlBoundary,
  ExternalControlGate,
} from "./externalCommandReceiver.js";

export type ExternalControlPermission =
  | "runtime.read"
  | "runtime.write"
  | "tool.invoke"
  | "model.invoke"
  | "mode.switch"
  | "runtime.manage"
  | "runtime.inspect";

export type ExternalControlGuardErrorCode =
  | "MISSING_COMMAND"
  | "MISSING_COMMAND_EFFECT"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "EFFECT_NOT_ALLOWED"
  | "SCOPE_DENIED";

export type ExternalControlGuardRequest = {
  command?: ExternalCommandEnvelope;
  grantedScopes?: readonly string[];
  allowedEffects?: readonly ExternalCommandEffect[];
  runtimeReady?: boolean;
  contract?: ExternalControlGate;
  governance?: ExternalControlGate;
};

export type ExternalControlGuardDecision = {
  status: "allow";
  runtimeId: string;
  commandId: string;
  commandName: string;
  targetSurface: string;
  allowedEffects: readonly ExternalCommandEffect[];
  requiredScopes: readonly ExternalControlPermission[];
  grantedScopes: readonly string[];
  missingScopes: readonly string[];
  canReadRuntime: boolean;
  canMutateRuntime: boolean;
  canInvokeTool: boolean;
  canInvokeModel: boolean;
  canSwitchMode: boolean;
  canManageRuntime: boolean;
  canInspectRuntime: boolean;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ExternalControlGuardError = {
  code: ExternalControlGuardErrorCode;
  message: string;
  boundary: ExternalControlBoundary;
  safeForInspection: true;
  internalDetailExposed: false;
};

export type ExternalControlGuardResult =
  | {
      ok: true;
      decision: ExternalControlGuardDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExternalControlGuardError;
      events: readonly string[];
    };

export const externalControlPermissionByEffect: Record<ExternalCommandEffect, ExternalControlPermission> = {
  "read-runtime": "runtime.read",
  "mutate-runtime": "runtime.write",
  "invoke-tool": "tool.invoke",
  "invoke-model": "model.invoke",
  "switch-mode": "mode.switch",
  "manage-runtime": "runtime.manage",
  "inspect-runtime": "runtime.inspect",
};

export const externalControlGuardDescriptor = {
  surface: "runtime.externalControl",
  capability: "externalControlGuard",
  purpose: "check external control effects against runtime scope before dispatch",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function cleanEffects(values: readonly ExternalCommandEffect[] | undefined): readonly ExternalCommandEffect[] {
  return [...new Set(values ?? [])];
}

function cleanScopes<T extends string>(values: readonly T[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanPermissions(
  values: readonly ExternalControlPermission[] | undefined,
): readonly ExternalControlPermission[] {
  return [...new Set(values ?? [])];
}

function failure(
  code: ExternalControlGuardErrorCode,
  message: string,
  boundary: ExternalControlBoundary,
): ExternalControlGuardResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.externalControl.guard.rejected"],
  };
}

export function guardExternalControl(request: ExternalControlGuardRequest = {}): ExternalControlGuardResult {
  if (request.command === undefined) {
    return failure("MISSING_COMMAND", "external control guard requires a received command envelope", "input");
  }

  if (request.command.requestedEffects.length === 0) {
    return failure("MISSING_COMMAND_EFFECT", "external control guard requires at least one requested effect", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "external control guard requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the external control command",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the external control command",
      "governance",
    );
  }

  const requestedEffects = cleanEffects(request.command.requestedEffects);
  const allowedEffects = cleanEffects(request.allowedEffects);
  const deniedEffect =
    allowedEffects.length === 0 ? undefined : requestedEffects.find((effect) => !allowedEffects.includes(effect));

  if (deniedEffect !== undefined) {
    return failure(
      "EFFECT_NOT_ALLOWED",
      `external control effect ${deniedEffect} is outside the allowed runtime control scope`,
      "scope",
    );
  }

  const requiredScopes = cleanPermissions(requestedEffects.map((effect) => externalControlPermissionByEffect[effect]));
  const grantedScopes = cleanScopes(request.grantedScopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));

  if (missingScopes.length > 0) {
    return failure("SCOPE_DENIED", `external control command is missing permission: ${missingScopes.join(", ")}`, "scope");
  }

  return {
    ok: true,
    decision: {
      status: "allow",
      runtimeId: request.command.runtimeId,
      commandId: request.command.commandId,
      commandName: request.command.commandName,
      targetSurface: request.command.target.surface,
      allowedEffects: requestedEffects,
      requiredScopes,
      grantedScopes,
      missingScopes,
      canReadRuntime: requestedEffects.includes("read-runtime"),
      canMutateRuntime: requestedEffects.includes("mutate-runtime"),
      canInvokeTool: requestedEffects.includes("invoke-tool"),
      canInvokeModel: requestedEffects.includes("invoke-model"),
      canSwitchMode: requestedEffects.includes("switch-mode"),
      canManageRuntime: requestedEffects.includes("manage-runtime"),
      canInspectRuntime: requestedEffects.includes("inspect-runtime"),
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.externalControl.guard.allowed"],
  };
}
