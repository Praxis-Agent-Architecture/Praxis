/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 management Policy Gate 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeAccessSession, RuntimeAccessSessionActorKind, RuntimeAccessSessionGate } from "./runtimeAccessSession.js";
import { isRuntimeAccessSessionActive } from "./runtimeAccessSession.js";

export type ManagementCommandEffect =
  | "read-runtime"
  | "inspect-runtime"
  | "invoke-runtime"
  | "mutate-runtime"
  | "manage-runtime"
  | "switch-mode"
  | "bridge-governance";

export type ManagementPolicyDecisionStatus = "allow" | "deny" | "requires-approval" | "dry-run-only";

export type ManagementPolicyBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope" | "session";

export type ManagementPolicyGateErrorCode =
  | "MISSING_COMMAND"
  | "MISSING_COMMAND_ID"
  | "MISSING_COMMAND_NAME"
  | "MISSING_SESSION"
  | "SESSION_EXPIRED"
  | "RUNTIME_MISMATCH"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "EFFECT_NOT_ALLOWED";

export type ManagementCommandEnvelope = {
  runtimeId?: string;
  commandId?: string;
  commandName?: string;
  targetSurface?: string;
  requestedEffects?: readonly ManagementCommandEffect[];
  requiredScopes?: readonly string[];
  dryRun?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ManagementPolicyRuleMatch = {
  commandNames?: readonly string[];
  targetSurfaces?: readonly string[];
  effects?: readonly ManagementCommandEffect[];
  actorKinds?: readonly RuntimeAccessSessionActorKind[];
  requiredScopes?: readonly string[];
};

export type ManagementPolicyRule = {
  id: string;
  status: ManagementPolicyDecisionStatus;
  reason?: string;
  priority?: number;
  match?: ManagementPolicyRuleMatch;
  approvalToken?: string;
};

export type ManagementPolicyGateRequest = {
  command?: ManagementCommandEnvelope;
  session?: RuntimeAccessSession;
  rules?: readonly ManagementPolicyRule[];
  allowedEffects?: readonly ManagementCommandEffect[];
  runtimeReady?: boolean;
  nowIso?: string;
  contract?: RuntimeAccessSessionGate;
  governance?: RuntimeAccessSessionGate;
};

export type ManagementPolicyDecision = {
  status: ManagementPolicyDecisionStatus;
  runtimeId: string;
  commandId: string;
  commandName: string;
  targetSurface: string;
  actorId: string;
  actorKind: RuntimeAccessSessionActorKind;
  matchedRuleIds: readonly string[];
  requestedEffects: readonly ManagementCommandEffect[];
  requiredScopes: readonly string[];
  grantedScopes: readonly string[];
  missingScopes: readonly string[];
  reason: string;
  approvalRequired: boolean;
  approvalToken?: string;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ManagementPolicyGateError = {
  code: ManagementPolicyGateErrorCode;
  message: string;
  boundary: ManagementPolicyBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type ManagementPolicyGateResult =
  | {
      ok: true;
      decision: ManagementPolicyDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ManagementPolicyGateError;
      events: readonly string[];
    };

export const managementPermissionByEffect: Record<ManagementCommandEffect, string> = {
  "read-runtime": "runtime.read",
  "inspect-runtime": "runtime.inspect",
  "invoke-runtime": "runtime.invoke",
  "mutate-runtime": "runtime.write",
  "manage-runtime": "runtime.manage",
  "switch-mode": "mode.switch",
  "bridge-governance": "module.requestGovernance",
};

export const managementPolicyGateDescriptor = {
  surface: "runtime.managementPlane",
  capability: "managementPolicyGate",
  purpose: "classify management commands against access session scopes and management policy rules",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanEffects(values: readonly ManagementCommandEffect[] | undefined): readonly ManagementCommandEffect[] {
  return [...new Set(values ?? [])];
}

function includesPattern(values: readonly string[] | undefined, value: string): boolean {
  const cleaned = cleanList(values);
  return cleaned.includes("*") || cleaned.includes(value);
}

function failure(
  code: ManagementPolicyGateErrorCode,
  message: string,
  boundary: ManagementPolicyBoundary,
): ManagementPolicyGateResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForApplication: true,
      internalDetailExposed: false,
    },
    events: ["runtime.management.policyGate.rejected"],
  };
}

function ruleMatches(
  rule: ManagementPolicyRule,
  command: ManagementCommandEnvelope,
  session: RuntimeAccessSession,
  commandName: string,
  targetSurface: string,
  requestedEffects: readonly ManagementCommandEffect[],
): boolean {
  const match = rule.match;
  if (match === undefined) {
    return true;
  }

  if (match.commandNames !== undefined && !includesPattern(match.commandNames, commandName)) {
    return false;
  }

  if (match.targetSurfaces !== undefined && !includesPattern(match.targetSurfaces, targetSurface)) {
    return false;
  }

  if (match.actorKinds !== undefined && !match.actorKinds.includes(session.actor.kind)) {
    return false;
  }

  if (match.effects !== undefined && !cleanEffects(match.effects).some((effect) => requestedEffects.includes(effect))) {
    return false;
  }

  return cleanList(match.requiredScopes).every((scope) => session.scopes.includes(scope));
}

function selectRule(
  rules: readonly ManagementPolicyRule[] | undefined,
  command: ManagementCommandEnvelope,
  session: RuntimeAccessSession,
  commandName: string,
  targetSurface: string,
  requestedEffects: readonly ManagementCommandEffect[],
): ManagementPolicyRule | undefined {
  return [...(rules ?? [])]
    .filter((rule) => !isBlank(rule.id) && ruleMatches(rule, command, session, commandName, targetSurface, requestedEffects))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
}

export function evaluateManagementPolicyGate(
  request: ManagementPolicyGateRequest = {},
): ManagementPolicyGateResult {
  if (request.command === undefined) {
    return failure("MISSING_COMMAND", "management policy gate requires a command envelope", "input");
  }

  if (request.session === undefined) {
    return failure("MISSING_SESSION", "management policy gate requires a runtime access session", "session");
  }

  if (!isRuntimeAccessSessionActive(request.session, request.nowIso)) {
    return failure("SESSION_EXPIRED", "management policy gate cannot use an expired runtime access session", "session");
  }

  if (isBlank(request.command.commandId)) {
    return failure("MISSING_COMMAND_ID", "management policy gate requires a stable commandId", "input");
  }

  if (isBlank(request.command.commandName)) {
    return failure("MISSING_COMMAND_NAME", "management policy gate requires a commandName", "input");
  }

  if (!isBlank(request.command.runtimeId) && request.command.runtimeId?.trim() !== request.session.runtimeId) {
    return failure("RUNTIME_MISMATCH", "management command runtimeId does not match the access session", "session");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "management policy gate requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the management command",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the management command",
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
      `management command effect ${deniedEffect} is outside the allowed management scope`,
      "scope",
    );
  }

  const runtimeId = request.session.runtimeId;
  const commandId = (request.command.commandId ?? "").trim();
  const commandName = (request.command.commandName ?? "").trim();
  const targetSurface = request.command.targetSurface?.trim() || "runtime.managementPlane";
  const effectScopes = requestedEffects.map((effect) => managementPermissionByEffect[effect]);
  const requiredScopes = cleanList([...(request.command.requiredScopes ?? []), ...effectScopes]);
  const missingScopes = requiredScopes.filter((scope) => !request.session?.scopes.includes(scope));

  if (missingScopes.length > 0) {
    return {
      ok: true,
      decision: {
        status: "deny",
        runtimeId,
        commandId,
        commandName,
        targetSurface,
        actorId: request.session.actor.id,
        actorKind: request.session.actor.kind,
        matchedRuleIds: [],
        requestedEffects,
        requiredScopes,
        grantedScopes: request.session.scopes,
        missingScopes,
        reason: `management command is missing scope: ${missingScopes.join(", ")}`,
        approvalRequired: false,
        dryRun: true,
        unsafeSideEffects: false,
      },
      events: ["runtime.management.policyGate.denied"],
    };
  }

  const matchedRule = selectRule(
    request.rules,
    request.command,
    request.session,
    commandName,
    targetSurface,
    requestedEffects,
  );
  const status = matchedRule?.status ?? "allow";

  return {
    ok: true,
    decision: {
      status,
      runtimeId,
      commandId,
      commandName,
      targetSurface,
      actorId: request.session.actor.id,
      actorKind: request.session.actor.kind,
      matchedRuleIds: matchedRule === undefined ? [] : [matchedRule.id],
      requestedEffects,
      requiredScopes,
      grantedScopes: request.session.scopes,
      missingScopes: [],
      reason: matchedRule?.reason ?? "management command passed session scope and policy checks",
      approvalRequired: status === "requires-approval",
      approvalToken: matchedRule?.approvalToken,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.management.policyGate.${status}`],
  };
}
