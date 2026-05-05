/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：定义官方模块能向 runtime 申请和使用哪些能力。
 * 能力要求1：需要约束 CMP/MP/TAP/multiagent 的能力读取、调用和事件订阅范围。
 * 能力要求2：它是官方模块稳定依赖 agentCore 的契约文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficialModuleKind = "CMP" | "MP" | "TAP" | "multiagent";

export type OfficialModuleCapabilityChannel = "read" | "invoke" | "subscribe";

export type OfficialModuleSurfaceBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type OfficialModuleCapabilityContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MODULE_ID"
  | "MISSING_MODULE_KIND"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CAPABILITY_CHANNEL"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "CAPABILITY_NOT_GRANTED";

export type OfficialModuleGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficialModuleCapabilityGrant = {
  capabilityId: string;
  channels: readonly OfficialModuleCapabilityChannel[];
  description?: string;
};

export type OfficialModuleCapabilityUse = {
  capabilityId: string;
  channel: OfficialModuleCapabilityChannel;
  reason?: string;
};

export type OfficialModuleCapabilityContractRequest = {
  runtimeId?: string;
  moduleId?: string;
  moduleKind?: OfficialModuleKind;
  requestedCapabilities?: readonly OfficialModuleCapabilityUse[];
  allowedCapabilities?: readonly OfficialModuleCapabilityGrant[];
  runtimeReady?: boolean;
  contract?: OfficialModuleGate;
  governance?: OfficialModuleGate;
};

export type OfficialModuleCapabilityContract = {
  runtimeId: string;
  moduleId: string;
  moduleKind: OfficialModuleKind;
  grantedCapabilities: readonly OfficialModuleCapabilityUse[];
  allowedCapabilities: readonly OfficialModuleCapabilityGrant[];
  contractSurface: "runtime.officialModuleSurface";
  requiresRuntimeGovernance: true;
  moduleStrategyImplemented: false;
  unsafeSideEffects: false;
};

export type OfficialModuleCapabilityContractError = {
  code: OfficialModuleCapabilityContractErrorCode;
  message: string;
  boundary: OfficialModuleSurfaceBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OfficialModuleCapabilityContractResult =
  | {
      ok: true;
      contract: OfficialModuleCapabilityContract;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleCapabilityContractError;
      events: readonly string[];
    };

export const DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS: Readonly<
  Record<OfficialModuleKind, readonly OfficialModuleCapabilityGrant[]>
> = {
  CMP: [
    { capabilityId: "runtime.context", channels: ["read", "subscribe"] },
    { capabilityId: "runtime.task", channels: ["read"] },
    { capabilityId: "runtime.invocation", channels: ["invoke"] },
    { capabilityId: "runtime.capability", channels: ["read"] },
  ],
  MP: [
    { capabilityId: "runtime.memory", channels: ["read", "invoke"] },
    { capabilityId: "runtime.state", channels: ["read", "subscribe"] },
    { capabilityId: "runtime.context", channels: ["read"] },
    { capabilityId: "runtime.invocation", channels: ["invoke"] },
  ],
  TAP: [
    { capabilityId: "runtime.tool", channels: ["read", "invoke", "subscribe"] },
    { capabilityId: "runtime.approval", channels: ["read", "invoke"] },
    { capabilityId: "runtime.governance", channels: ["read", "invoke"] },
    { capabilityId: "runtime.invocation", channels: ["invoke"] },
  ],
  multiagent: [
    { capabilityId: "runtime.agent.spawn", channels: ["invoke"] },
    { capabilityId: "runtime.agent.resume", channels: ["invoke"] },
    { capabilityId: "runtime.agent.interrupt", channels: ["invoke"] },
    { capabilityId: "runtime.agent.coordination", channels: ["read", "invoke", "subscribe"] },
    { capabilityId: "runtime.surface.reuse", channels: ["read"] },
  ],
};

const OFFICIAL_MODULE_CAPABILITY_CHANNELS = new Set<OfficialModuleCapabilityChannel>(["read", "invoke", "subscribe"]);

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isKnownCapabilityChannel(value: unknown): value is OfficialModuleCapabilityChannel {
  return (
    typeof value === "string" &&
    OFFICIAL_MODULE_CAPABILITY_CHANNELS.has(value as OfficialModuleCapabilityChannel)
  );
}

function capabilityShapeFailure(
  capabilities: readonly OfficialModuleCapabilityUse[] | undefined,
): OfficialModuleCapabilityContractResult | undefined {
  for (const capability of capabilities ?? []) {
    if (isBlank(capability.capabilityId)) {
      return failure(
        "MISSING_CAPABILITY_ID",
        "official module capability requests require a capabilityId",
        "input",
      );
    }

    if (!isKnownCapabilityChannel(capability.channel)) {
      return failure(
        "MISSING_CAPABILITY_CHANNEL",
        "official module capability requests require a supported capability channel",
        "input",
      );
    }
  }

  return undefined;
}

function cleanCapabilities(
  capabilities: readonly OfficialModuleCapabilityUse[] | undefined,
): readonly OfficialModuleCapabilityUse[] {
  const seen = new Set<string>();
  const cleaned: OfficialModuleCapabilityUse[] = [];

  for (const capability of capabilities ?? []) {
    const capabilityId = capability.capabilityId.trim();
    const key = capabilityId + ":" + capability.channel;
    if (capabilityId.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    const reason = capability.reason?.trim();
    cleaned.push({
      capabilityId,
      channel: capability.channel,
      ...(reason ? { reason } : {}),
    });
  }

  return cleaned;
}

function cleanGrants(
  grants: readonly OfficialModuleCapabilityGrant[] | undefined,
): readonly OfficialModuleCapabilityGrant[] {
  const seen = new Set<string>();
  const cleaned: OfficialModuleCapabilityGrant[] = [];

  for (const grant of grants ?? []) {
    const capabilityId = grant.capabilityId.trim();
    if (capabilityId.length === 0 || seen.has(capabilityId)) {
      continue;
    }

    seen.add(capabilityId);
    const description = grant.description?.trim();
    cleaned.push({
      capabilityId,
      channels: [...new Set(grant.channels)],
      ...(description ? { description } : {}),
    });
  }

  return cleaned;
}

function failure(
  code: OfficialModuleCapabilityContractErrorCode,
  message: string,
  boundary: OfficialModuleSurfaceBoundary,
): OfficialModuleCapabilityContractResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["runtime.officialModule.capabilityContract.rejected"],
  };
}

function findMissingCapability(
  requestedCapabilities: readonly OfficialModuleCapabilityUse[],
  allowedCapabilities: readonly OfficialModuleCapabilityGrant[],
): OfficialModuleCapabilityUse | undefined {
  return requestedCapabilities.find((capability) => {
    const grant = allowedCapabilities.find((allowed) => allowed.capabilityId === capability.capabilityId);
    return grant === undefined || !grant.channels.includes(capability.channel);
  });
}

export function defineOfficialModuleCapabilityContract(
  request?: OfficialModuleCapabilityContractRequest,
): OfficialModuleCapabilityContractResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "official module capability contract requires a runtimeId", "input");
  }

  if (isBlank(request.moduleId)) {
    return failure("MISSING_MODULE_ID", "official module capability contract requires a moduleId", "input");
  }

  if (request.moduleKind === undefined) {
    return failure("MISSING_MODULE_KIND", "official module capability contract requires a module kind", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "official modules can only receive runtime capabilities from a ready runtime",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "official module capability contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "official module capability contract was rejected by governance",
      "governance",
    );
  }

  const capabilityShapeError = capabilityShapeFailure(request.requestedCapabilities);
  if (capabilityShapeError !== undefined) {
    return capabilityShapeError;
  }

  const requestedCapabilities = cleanCapabilities(request.requestedCapabilities);
  const allowedCapabilities = cleanGrants(
    request.allowedCapabilities ?? DEFAULT_OFFICIAL_MODULE_CAPABILITY_GRANTS[request.moduleKind],
  );
  const missingCapability = findMissingCapability(requestedCapabilities, allowedCapabilities);
  if (missingCapability !== undefined) {
    return failure(
      "CAPABILITY_NOT_GRANTED",
      `capability ${missingCapability.capabilityId}:${missingCapability.channel} is outside this official module runtime contract`,
      "scope",
    );
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const moduleId = request.moduleId?.trim() ?? "";

  return {
    ok: true,
    contract: {
      runtimeId,
      moduleId,
      moduleKind: request.moduleKind,
      grantedCapabilities: requestedCapabilities,
      allowedCapabilities,
      contractSurface: "runtime.officialModuleSurface",
      requiresRuntimeGovernance: true,
      moduleStrategyImplemented: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.officialModule.capabilityContract.defined"],
  };
}
