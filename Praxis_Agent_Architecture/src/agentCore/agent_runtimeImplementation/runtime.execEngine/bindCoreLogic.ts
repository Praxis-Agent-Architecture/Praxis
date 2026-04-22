/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 bind Core Logic 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeExecEngineBindingKind =
  | "coreLogic"
  | "ioTransceiver"
  | "eventExposurePlane"
  | "basicToolLayer";

export type RuntimeExecEngineBindingBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeExecEngineBindingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_BINDING_KIND"
  | "MISSING_BINDING_ID"
  | "RUNTIME_NOT_READY"
  | "MODULE_NOT_MOUNTED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type RuntimeExecEngineBindingGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeExecEngineBindingCaller = {
  kind: "application" | "official-module" | "runtime-surface" | "inspection" | "debug";
  id: string;
};

export type RuntimeExecEngineMountedModule = {
  id: string;
  ready?: boolean;
  version?: string;
};

export type RuntimeExecEngineBindingTrace = {
  correlationId?: string;
  sessionId?: string;
};

export type RuntimeExecEngineBindingRequest = {
  runtimeId?: string;
  bindingKind?: RuntimeExecEngineBindingKind;
  bindingId?: string;
  caller?: RuntimeExecEngineBindingCaller;
  runtimeReady?: boolean;
  moduleMounted?: boolean;
  mountedModule?: RuntimeExecEngineMountedModule;
  capabilities?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: RuntimeExecEngineBindingGate;
  governance?: RuntimeExecEngineBindingGate;
  trace?: RuntimeExecEngineBindingTrace;
};

export type RuntimeExecEngineBindingSnapshot = {
  runtimeId: string;
  bindingKind: RuntimeExecEngineBindingKind;
  bindingId: string;
  surface: "runtime.execEngine";
  lifecycle: "bound";
  caller?: RuntimeExecEngineBindingCaller;
  mountedModule?: RuntimeExecEngineMountedModule;
  capabilities: readonly string[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  trace: RuntimeExecEngineBindingTrace;
  governanceRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeExecEngineBindingError = {
  code: RuntimeExecEngineBindingErrorCode;
  message: string;
  boundary: RuntimeExecEngineBindingBoundary;
  bindingSafe: true;
};

export type RuntimeExecEngineBindingResult =
  | {
      ok: true;
      binding: RuntimeExecEngineBindingSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeExecEngineBindingError;
      events: readonly string[];
    };

export type RuntimeExecEngineBindingDefaults = {
  bindingKind: RuntimeExecEngineBindingKind;
  bindingId: string;
  capabilities: readonly string[];
  eventNamePrefix: string;
};

export type BindCoreLogicRequest = Omit<RuntimeExecEngineBindingRequest, "bindingKind">;

export type BindCoreLogicResult = RuntimeExecEngineBindingResult;

export const DEFAULT_CORE_LOGIC_BINDING_CAPABILITIES = [
  "mainLoop",
  "stateEngine",
  "reuseInvoker",
] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanCaller(
  caller: RuntimeExecEngineBindingCaller | undefined,
): RuntimeExecEngineBindingCaller | undefined {
  if (caller === undefined || isBlank(caller.id)) {
    return undefined;
  }

  return {
    kind: caller.kind,
    id: caller.id.trim(),
  };
}

function cleanMountedModule(
  mountedModule: RuntimeExecEngineMountedModule | undefined,
): RuntimeExecEngineMountedModule | undefined {
  if (mountedModule === undefined || isBlank(mountedModule.id)) {
    return undefined;
  }

  return {
    id: mountedModule.id.trim(),
    ready: mountedModule.ready,
    version: mountedModule.version?.trim() || undefined,
  };
}

function failure(
  code: RuntimeExecEngineBindingErrorCode,
  message: string,
  boundary: RuntimeExecEngineBindingBoundary,
  eventNamePrefix: string,
): RuntimeExecEngineBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, bindingSafe: true },
    events: [`${eventNamePrefix}.rejected`],
  };
}

export function createRuntimeExecEngineBinding(
  request: RuntimeExecEngineBindingRequest | undefined,
  defaults: RuntimeExecEngineBindingDefaults,
): RuntimeExecEngineBindingResult {
  const eventNamePrefix = defaults.eventNamePrefix;

  if (request === undefined || !isPresentString(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime execEngine binding requires a runtimeId", "input", eventNamePrefix);
  }

  const runtimeId = request.runtimeId.trim();
  const bindingKind = request.bindingKind ?? defaults.bindingKind;
  if (bindingKind === undefined) {
    return failure(
      "MISSING_BINDING_KIND",
      "runtime execEngine binding requires a binding kind",
      "input",
      eventNamePrefix,
    );
  }

  const bindingId = request.bindingId?.trim() || defaults.bindingId;
  if (bindingId.length === 0) {
    return failure(
      "MISSING_BINDING_ID",
      "runtime execEngine binding requires a binding id",
      "input",
      eventNamePrefix,
    );
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "runtime must be ready before binding execution engine surfaces",
      "runtime-state",
      eventNamePrefix,
    );
  }

  if (request.moduleMounted === false || request.mountedModule?.ready === false) {
    return failure(
      "MODULE_NOT_MOUNTED",
      "execution engine surface is not mounted for this runtime",
      "runtime-state",
      eventNamePrefix,
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract rejected this execEngine binding",
      "contract",
      eventNamePrefix,
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected this execEngine binding",
      "governance",
      eventNamePrefix,
    );
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0
      ? requestedScopes
      : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `execEngine binding includes scopes outside runtime governance: ${deniedScopes.join(", ")}`,
      "scope",
      eventNamePrefix,
    );
  }

  return {
    ok: true,
    binding: {
      runtimeId,
      bindingKind,
      bindingId,
      surface: "runtime.execEngine",
      lifecycle: "bound",
      caller: cleanCaller(request.caller),
      mountedModule: cleanMountedModule(request.mountedModule),
      capabilities: cleanList(request.capabilities).length > 0 ? cleanList(request.capabilities) : defaults.capabilities,
      requestedScopes,
      grantedScopes,
      deniedScopes,
      trace: {
        correlationId: request.trace?.correlationId?.trim() || undefined,
        sessionId: request.trace?.sessionId?.trim() || undefined,
      },
      governanceRequired: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: [`${eventNamePrefix}.accepted`],
  };
}

export function bindCoreLogic(request?: BindCoreLogicRequest): BindCoreLogicResult {
  return createRuntimeExecEngineBinding(
    {
      ...request,
      bindingKind: "coreLogic",
    },
    {
      bindingKind: "coreLogic",
      bindingId: "runtime.execEngine.coreLogic",
      capabilities: DEFAULT_CORE_LOGIC_BINDING_CAPABILITIES,
      eventNamePrefix: "runtime.execEngine.coreLogic.binding",
    },
  );
}
