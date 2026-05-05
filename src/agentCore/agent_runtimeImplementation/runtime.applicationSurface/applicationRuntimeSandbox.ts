/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：隔离应用扩展对 runtime 内部状态的影响。
 * 能力要求1：需要允许应用扩展能力，但所有扩展都应经过契约和治理约束。
 * 能力要求2：它让 agentCore 能被第三方应用复用，同时保持内核稳定。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ApplicationRuntimeSandboxEffect = "filesystem" | "network" | "shell" | "provider" | "runtime-state";

export type ApplicationRuntimeSandboxErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_APPLICATION_ID"
  | "MISSING_EXTENSION_ID"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "INTERNAL_STATE_MUTATION_DENIED";

export type ApplicationRuntimeSandboxError = {
  code: ApplicationRuntimeSandboxErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "runtime-state";
};

export type ApplicationRuntimeSandboxGate = {
  accepted: boolean;
  reason?: string;
};

export type ApplicationRuntimeExtensionRequest = {
  extensionId: string;
  requestedCapabilities?: readonly string[];
  requestedEffects?: readonly ApplicationRuntimeSandboxEffect[];
  mutatesInternalState?: boolean;
};

export type ApplicationRuntimeSandboxRequest = {
  runtimeId: string;
  applicationId: string;
  extension?: ApplicationRuntimeExtensionRequest;
  allowedCapabilities?: readonly string[];
  contract?: ApplicationRuntimeSandboxGate;
  governance?: ApplicationRuntimeSandboxGate;
};

export type ApplicationRuntimeSandboxEnvelope = {
  sandboxId: string;
  runtimeId: string;
  applicationId: string;
  extensionId: string;
  grantedCapabilities: readonly string[];
  deniedCapabilities: readonly string[];
  blockedEffects: readonly ApplicationRuntimeSandboxEffect[];
  dryRun: true;
  unsafeSideEffects: false;
  internalStateMutable: false;
};

export type ApplicationRuntimeSandboxResult =
  | {
      ok: true;
      envelope: ApplicationRuntimeSandboxEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationRuntimeSandboxError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanEffects(
  values: readonly ApplicationRuntimeSandboxEffect[] | undefined,
): readonly ApplicationRuntimeSandboxEffect[] {
  return [...new Set(values ?? [])];
}

function failure(
  code: ApplicationRuntimeSandboxErrorCode,
  message: string,
  boundary: ApplicationRuntimeSandboxError["boundary"],
): ApplicationRuntimeSandboxResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.runtime.sandbox.rejected"],
  };
}

export function createApplicationRuntimeSandbox(
  request: ApplicationRuntimeSandboxRequest,
): ApplicationRuntimeSandboxResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before creating an application sandbox", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure(
      "MISSING_APPLICATION_ID",
      "applicationId is required before creating an application sandbox",
      "input",
    );
  }

  if (request.extension === undefined || isBlank(request.extension.extensionId)) {
    return failure(
      "MISSING_EXTENSION_ID",
      "extensionId is required before creating an application sandbox",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "application extension contract was rejected",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application extension was rejected by governance",
      "governance",
    );
  }

  if (request.extension.mutatesInternalState === true) {
    return failure(
      "INTERNAL_STATE_MUTATION_DENIED",
      "application extensions cannot mutate agentCore runtime internal state directly",
      "runtime-state",
    );
  }

  const requestedCapabilities = cleanList(request.extension.requestedCapabilities);
  const allowedCapabilities = cleanList(request.allowedCapabilities);
  const grantedCapabilities =
    allowedCapabilities.length === 0
      ? requestedCapabilities
      : requestedCapabilities.filter((capability) => allowedCapabilities.includes(capability));
  const deniedCapabilities =
    allowedCapabilities.length === 0
      ? []
      : requestedCapabilities.filter((capability) => !allowedCapabilities.includes(capability));
  const blockedEffects = cleanEffects(request.extension.requestedEffects);
  const runtimeId = request.runtimeId.trim();
  const applicationId = request.applicationId.trim();
  const extensionId = request.extension.extensionId.trim();

  return {
    ok: true,
    envelope: {
      sandboxId: `${runtimeId}:${applicationId}:${extensionId}`,
      runtimeId,
      applicationId,
      extensionId,
      grantedCapabilities,
      deniedCapabilities,
      blockedEffects,
      dryRun: true,
      unsafeSideEffects: false,
      internalStateMutable: false,
    },
    events: blockedEffects.length > 0
      ? ["application.runtime.sandbox.created", "application.runtime.sandbox.effects.blocked"]
      : ["application.runtime.sandbox.created"],
  };
}
