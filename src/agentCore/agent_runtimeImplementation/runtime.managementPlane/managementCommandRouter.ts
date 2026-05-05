/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 management Command Router 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeAccessSession, RuntimeAccessSessionGate } from "./runtimeAccessSession.js";
import type {
  ManagementCommandEffect,
  ManagementCommandEnvelope,
  ManagementPolicyDecision,
  ManagementPolicyRule,
} from "./managementPolicyGate.js";
import { evaluateManagementPolicyGate } from "./managementPolicyGate.js";

export type ManagementCommandRouteBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "session"
  | "router";

export type ManagementCommandRouterErrorCode =
  | "MISSING_COMMAND"
  | "MISSING_SESSION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "POLICY_REJECTED"
  | "POLICY_DENIED"
  | "ROUTE_NOT_FOUND"
  | "ROUTE_NOT_READY";

export type ManagementCommandRoute = {
  routeId: string;
  commandNames?: readonly string[];
  targetSurfaces?: readonly string[];
  requiredEffects?: readonly ManagementCommandEffect[];
  handlerRef?: string;
  mounted?: boolean;
  ready?: boolean;
};

export type ManagementCommandRouterRequest = {
  command?: ManagementCommandEnvelope;
  session?: RuntimeAccessSession;
  routes?: readonly ManagementCommandRoute[];
  policyRules?: readonly ManagementPolicyRule[];
  allowedEffects?: readonly ManagementCommandEffect[];
  runtimeReady?: boolean;
  nowIso?: string;
  contract?: RuntimeAccessSessionGate;
  governance?: RuntimeAccessSessionGate;
};

export type ManagementCommandRoutePlan = {
  runtimeId: string;
  commandId: string;
  commandName: string;
  routeId: string;
  targetSurface: string;
  handlerRef?: string;
  dispatchMode: "dry-run";
  policyStatus: ManagementPolicyDecision["status"];
  approvalRequired: boolean;
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type ManagementCommandRouterError = {
  code: ManagementCommandRouterErrorCode;
  message: string;
  boundary: ManagementCommandRouteBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type ManagementCommandRouterResult =
  | {
      ok: true;
      plan: ManagementCommandRoutePlan;
      policy: ManagementPolicyDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ManagementCommandRouterError;
      policy?: ManagementPolicyDecision;
      events: readonly string[];
    };

export const managementCommandRouterDescriptor = {
  surface: "runtime.managementPlane",
  capability: "managementCommandRouter",
  purpose: "route management command envelopes to a dry-run runtime surface plan after policy checks",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanEffects(values: readonly ManagementCommandEffect[] | undefined): readonly ManagementCommandEffect[] {
  return [...new Set(values ?? [])];
}

function includesPattern(values: readonly string[] | undefined, value: string): boolean {
  const cleaned = cleanList(values);
  return cleaned.length === 0 || cleaned.includes("*") || cleaned.includes(value);
}

function routeHasEffects(route: ManagementCommandRoute, requestedEffects: readonly ManagementCommandEffect[]): boolean {
  return cleanEffects(route.requiredEffects).every((effect) => requestedEffects.includes(effect));
}

function failure(
  code: ManagementCommandRouterErrorCode,
  message: string,
  boundary: ManagementCommandRouteBoundary,
  policy?: ManagementPolicyDecision,
): ManagementCommandRouterResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForApplication: true,
      internalDetailExposed: false,
    },
    policy,
    events: ["runtime.management.commandRouter.rejected"],
  };
}

function findRoute(
  routes: readonly ManagementCommandRoute[] | undefined,
  commandName: string,
  targetSurface: string,
  requestedEffects: readonly ManagementCommandEffect[],
): ManagementCommandRoute | undefined {
  return (routes ?? []).find(
    (route) =>
      route.mounted !== false &&
      includesPattern(route.commandNames, commandName) &&
      includesPattern(route.targetSurfaces, targetSurface) &&
      routeHasEffects(route, requestedEffects),
  );
}

export function routeManagementCommand(
  request: ManagementCommandRouterRequest = {},
): ManagementCommandRouterResult {
  if (request.command === undefined) {
    return failure("MISSING_COMMAND", "management command router requires a command envelope", "input");
  }

  if (request.session === undefined) {
    return failure("MISSING_SESSION", "management command router requires a runtime access session", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "management command router requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the command router",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the command router",
      "governance",
    );
  }

  const policyResult = evaluateManagementPolicyGate({
    command: request.command,
    session: request.session,
    rules: request.policyRules,
    allowedEffects: request.allowedEffects,
    runtimeReady: request.runtimeReady,
    nowIso: request.nowIso,
    contract: request.contract,
    governance: request.governance,
  });

  if (!policyResult.ok) {
    return failure("POLICY_REJECTED", policyResult.error.message, policyResult.error.boundary);
  }

  if (policyResult.decision.status === "deny") {
    return failure("POLICY_DENIED", policyResult.decision.reason, "governance", policyResult.decision);
  }

  const route = findRoute(
    request.routes,
    policyResult.decision.commandName,
    policyResult.decision.targetSurface,
    policyResult.decision.requestedEffects,
  );

  if (route === undefined) {
    return failure(
      "ROUTE_NOT_FOUND",
      "management command router could not find a mounted route for the command",
      "router",
      policyResult.decision,
    );
  }

  if (route.ready === false) {
    return failure(
      "ROUTE_NOT_READY",
      `management command route ${route.routeId} is not ready`,
      "runtime-state",
      policyResult.decision,
    );
  }

  return {
    ok: true,
    policy: policyResult.decision,
    plan: {
      runtimeId: policyResult.decision.runtimeId,
      commandId: policyResult.decision.commandId,
      commandName: policyResult.decision.commandName,
      routeId: route.routeId,
      targetSurface: policyResult.decision.targetSurface,
      handlerRef: route.handlerRef?.trim() || undefined,
      dispatchMode: "dry-run",
      policyStatus: policyResult.decision.status,
      approvalRequired: policyResult.decision.approvalRequired,
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.management.commandRouter.planned"],
  };
}
