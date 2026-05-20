/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：桥接应用生命周期和 runtime 生命周期。
 * 能力要求1：需要处理应用启动、暂停、卸载、重载与 runtime boot/resume/shutdown 的对应关系。
 * 能力要求2：不能把应用生命周期和 agentCore 内部生命周期混成同一个对象。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ApplicationLifecycleSignal = "start" | "pause" | "unload" | "reload";

export type RuntimeLifecycleState = "cold" | "ready" | "paused" | "shutting-down" | "stopped";

export type RuntimeLifecycleCommand = "boot" | "resume" | "shutdown";

export type ApplicationLifecycleBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_APPLICATION_ID"
  | "MISSING_APPLICATION_SIGNAL"
  | "GOVERNANCE_REJECTED"
  | "INVALID_RUNTIME_STATE";

export type ApplicationLifecycleBridgeError = {
  code: ApplicationLifecycleBridgeErrorCode;
  message: string;
  boundary: "input" | "governance" | "runtime-state";
};

export type ApplicationLifecycleBridgeGate = {
  accepted: boolean;
  reason?: string;
};

export type ApplicationLifecycleBridgeRequest = {
  runtimeId: string;
  applicationId: string;
  applicationSignal?: ApplicationLifecycleSignal;
  runtimeState?: RuntimeLifecycleState;
  governance?: ApplicationLifecycleBridgeGate;
};

export type RuntimeLifecycleTransition = {
  command: RuntimeLifecycleCommand;
  from: RuntimeLifecycleState;
  preserveApplicationSession: boolean;
  dryRun: true;
};

export type ApplicationLifecycleBridgePlan = {
  runtimeId: string;
  applicationId: string;
  applicationSignal: ApplicationLifecycleSignal;
  runtimeState: RuntimeLifecycleState;
  runtimeTransitions: readonly RuntimeLifecycleTransition[];
  lifecycleBoundaries: {
    application: "external-application-lifecycle";
    runtime: "agentcore-runtime-lifecycle";
  };
  unsafeSideEffects: false;
};

export type ApplicationLifecycleBridgeResult =
  | {
      ok: true;
      plan: ApplicationLifecycleBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationLifecycleBridgeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: ApplicationLifecycleBridgeErrorCode,
  message: string,
  boundary: ApplicationLifecycleBridgeError["boundary"],
): ApplicationLifecycleBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.lifecycle.bridge.rejected"],
  };
}

function lifecycleTransitions(
  signal: ApplicationLifecycleSignal,
  state: RuntimeLifecycleState,
): readonly RuntimeLifecycleTransition[] | undefined {
  switch (signal) {
    case "start":
      if (state === "cold" || state === "stopped") {
        return [{ command: "boot", from: state, preserveApplicationSession: false, dryRun: true }];
      }

      if (state === "paused") {
        return [{ command: "resume", from: state, preserveApplicationSession: true, dryRun: true }];
      }

      return [];
    case "pause":
      if (state === "ready") {
        return [{ command: "shutdown", from: state, preserveApplicationSession: true, dryRun: true }];
      }

      if (state === "paused" || state === "stopped") {
        return [];
      }

      return undefined;
    case "unload":
      if (state === "ready" || state === "paused") {
        return [{ command: "shutdown", from: state, preserveApplicationSession: false, dryRun: true }];
      }

      if (state === "stopped" || state === "cold") {
        return [];
      }

      return undefined;
    case "reload":
      if (state === "ready" || state === "paused") {
        return [
          { command: "shutdown", from: state, preserveApplicationSession: false, dryRun: true },
          { command: "boot", from: "stopped", preserveApplicationSession: false, dryRun: true },
        ];
      }

      if (state === "cold" || state === "stopped") {
        return [{ command: "boot", from: state, preserveApplicationSession: false, dryRun: true }];
      }

      return undefined;
  }
}

export function planApplicationLifecycleBridge(
  request: ApplicationLifecycleBridgeRequest,
): ApplicationLifecycleBridgeResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before bridging application lifecycle", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure(
      "MISSING_APPLICATION_ID",
      "applicationId is required before bridging application lifecycle",
      "input",
    );
  }

  if (request.applicationSignal === undefined) {
    return failure(
      "MISSING_APPLICATION_SIGNAL",
      "applicationSignal is required before planning runtime lifecycle commands",
      "input",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application lifecycle bridge was rejected by governance",
      "governance",
    );
  }

  const runtimeState = request.runtimeState ?? "cold";
  const runtimeTransitions = lifecycleTransitions(request.applicationSignal, runtimeState);

  if (runtimeTransitions === undefined) {
    return failure(
      "INVALID_RUNTIME_STATE",
      `application signal ${request.applicationSignal} cannot be bridged from runtime state ${runtimeState}`,
      "runtime-state",
    );
  }

  return {
    ok: true,
    plan: {
      runtimeId: request.runtimeId.trim(),
      applicationId: request.applicationId.trim(),
      applicationSignal: request.applicationSignal,
      runtimeState,
      runtimeTransitions,
      lifecycleBoundaries: {
        application: "external-application-lifecycle",
        runtime: "agentcore-runtime-lifecycle",
      },
      unsafeSideEffects: false,
    },
    events:
      runtimeTransitions.length > 0
        ? ["application.lifecycle.bridge.planned"]
        : ["application.lifecycle.bridge.noop"],
  };
}
