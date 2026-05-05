/*
 * 文件定位：Agent 模型适配层 / agentCore 内部桥接层。
 * 核心目的：测试模型适配桥接层暴露给 agentCore 的实际调用接口是否可用。
 * 能力要求1：需要覆盖从抽象层结果到 agentCore 内部调用入口的最小连通性。
 * 能力要求2：它用于防止 provider 已接入但 agentCore 仍不能稳定调用的假接通。
 * 边界：负责进入 agentCore 前的最后适配，不重新处理上游 endpoint 细节。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ApplicationModelAdapter,
  ApplicationModelInvocationInput,
  ApplicationModelInvocationResult,
} from "./applicationAdapter.js";

export type ApplicationInterfaceProbeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "compatibility"
  | "invocation";

export type ApplicationInterfaceProbeRequest = {
  runtimeId?: string;
  probeId?: string;
  adapter?: ApplicationModelAdapter;
  expectedCapabilityIds?: readonly string[];
  expectedFormatIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  sampleInput?: ApplicationModelInvocationInput;
  executeDryRun?: boolean;
};

export type ApplicationInterfaceProbeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_PROBE_ID"
  | "MISSING_ADAPTER"
  | "RUNTIME_MISMATCH"
  | "ADAPTER_NOT_READY"
  | "SCOPE_DENIED"
  | "DRY_RUN_FAILED";

export type ApplicationInterfaceProbeError = {
  code: ApplicationInterfaceProbeErrorCode;
  message: string;
  boundary: ApplicationInterfaceProbeBoundary;
  safeForRuntimeInspection: true;
};

export type ApplicationInterfaceGap = {
  kind: "capability" | "format";
  id: string;
  reason: "missing" | "unavailable";
};

export type ApplicationInterfaceProbeReport = {
  kind: "agentCore.modelAdapter.applicationInterfaceProbe";
  runtimeId: string;
  probeId: string;
  adapterId: string;
  interfaceUsable: boolean;
  gaps: readonly ApplicationInterfaceGap[];
  acceptedScopes: readonly string[];
  dryRun: {
    executed: boolean;
    ok: boolean;
    providerPayloadCreated: false;
    unsafeSideEffects: false;
  };
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type ApplicationInterfaceProbeResult =
  | {
      ok: true;
      report: ApplicationInterfaceProbeReport;
      invocation?: ApplicationModelInvocationResult;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationInterfaceProbeError;
      events: readonly string[];
    };

export const applicationInterfaceTestDescriptor = {
  capability: "application-interface-test",
  route: "agent_modelAdapter.bridgingLayer",
  purpose: "probe the direct agentCore-facing model adapter interface without reaching provider APIs",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ApplicationInterfaceProbeErrorCode,
  message: string,
  boundary: ApplicationInterfaceProbeBoundary,
): ApplicationInterfaceProbeResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.applicationInterfaceTest.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | ApplicationInterfaceProbeResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `application interface probe scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function interfaceGaps(
  adapter: ApplicationModelAdapter,
  expectedCapabilityIds: readonly string[] | undefined,
  expectedFormatIds: readonly string[] | undefined,
): readonly ApplicationInterfaceGap[] {
  const gaps: ApplicationInterfaceGap[] = [];
  const capabilities = new Map(adapter.capabilities.map((capability) => [capability.capabilityId, capability]));
  const formats = new Map(adapter.formats.map((format) => [format.formatId, format]));

  for (const capabilityId of cleanList(expectedCapabilityIds)) {
    const capability = capabilities.get(capabilityId);
    if (capability === undefined) {
      gaps.push({ kind: "capability", id: capabilityId, reason: "missing" });
    } else if (!capability.available) {
      gaps.push({ kind: "capability", id: capabilityId, reason: "unavailable" });
    }
  }

  for (const formatId of cleanList(expectedFormatIds)) {
    const format = formats.get(formatId);
    if (format === undefined) {
      gaps.push({ kind: "format", id: formatId, reason: "missing" });
    } else if (!format.available) {
      gaps.push({ kind: "format", id: formatId, reason: "unavailable" });
    }
  }

  return gaps;
}

function defaultSampleInput(probeId: string): ApplicationModelInvocationInput {
  return {
    invocationId: `${probeId}:dry-run`,
    prompt: "agentCore application interface dry-run probe",
    metadata: { probe: true },
  };
}

export async function runApplicationModelInterfaceProbe(
  request?: ApplicationInterfaceProbeRequest,
): Promise<ApplicationInterfaceProbeResult> {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "application interface probe requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const probeId = request.probeId?.trim();

  if (!probeId) {
    return failure("MISSING_PROBE_ID", "application interface probe requires probeId", "input");
  }

  if (request.adapter === undefined) {
    return failure("MISSING_ADAPTER", "application interface probe requires an application model adapter", "input");
  }

  if (request.adapter.runtimeId !== runtimeId) {
    return failure("RUNTIME_MISMATCH", "application interface probe adapter belongs to a different runtime", "contract");
  }

  if (request.adapter.readiness !== "ready") {
    return failure("ADAPTER_NOT_READY", "application interface probe requires a ready adapter", "compatibility");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const gaps = interfaceGaps(request.adapter, request.expectedCapabilityIds, request.expectedFormatIds);
  const shouldExecuteDryRun = request.executeDryRun !== false;
  const invocation = shouldExecuteDryRun
    ? await request.adapter.invoke(request.sampleInput ?? defaultSampleInput(probeId))
    : undefined;

  if (invocation !== undefined && !invocation.ok) {
    return failure("DRY_RUN_FAILED", invocation.error.message, invocation.error.boundary);
  }

  const interfaceUsable = gaps.length === 0 && (invocation === undefined || invocation.ok);

  return {
    ok: true,
    report: {
      kind: "agentCore.modelAdapter.applicationInterfaceProbe",
      runtimeId,
      probeId,
      adapterId: request.adapter.adapterId,
      interfaceUsable,
      gaps,
      acceptedScopes,
      dryRun: {
        executed: shouldExecuteDryRun,
        ok: invocation?.ok ?? false,
        providerPayloadCreated: false,
        unsafeSideEffects: false,
      },
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    invocation,
    events: [
      interfaceUsable
        ? "modelAdapter.applicationInterfaceTest.interfaceUsable"
        : "modelAdapter.applicationInterfaceTest.gapDetected",
    ],
  };
}
