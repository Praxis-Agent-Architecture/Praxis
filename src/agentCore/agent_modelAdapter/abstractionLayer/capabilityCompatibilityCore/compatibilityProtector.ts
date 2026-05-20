/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 compatibility Protector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { InterfaceCapabilityDescriptor } from "./interfaceCapabilityExtraction.js";
import type { InterfaceFormatDescriptor } from "./interfaceFormatExtraction.js";
import type { InterfaceScopeDecision } from "./interfaceScope.js";

export type CompatibilityProtectorTrace = {
  correlationId?: string;
  bridgeId?: string;
};

export type CompatibilityProtectorRequest = {
  providerId?: string;
  interfaceId?: string;
  availableCapabilities?: readonly InterfaceCapabilityDescriptor[];
  requiredCapabilities?: readonly string[];
  availableFormats?: readonly InterfaceFormatDescriptor[];
  requiredFormats?: readonly string[];
  scopeDecision?: InterfaceScopeDecision;
  trace?: CompatibilityProtectorTrace;
};

export type CompatibilityGapKind = "capability" | "format" | "scope";

export type CompatibilityGap = {
  kind: CompatibilityGapKind;
  requested: string;
  reason: string;
};

export type CompatibilityProtectionReport = {
  providerId: string;
  interfaceId: string;
  compatible: boolean;
  requiredCapabilities: readonly string[];
  requiredFormats: readonly string[];
  capabilityGaps: readonly CompatibilityGap[];
  formatGaps: readonly CompatibilityGap[];
  scopeGaps: readonly CompatibilityGap[];
  bridgeable: boolean;
  trace: CompatibilityProtectorTrace;
  unsafeSideEffects: false;
};

export type CompatibilityProtectorErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_AVAILABLE_CAPABILITIES"
  | "MISSING_AVAILABLE_FORMATS";

export type CompatibilityProtectorError = {
  code: CompatibilityProtectorErrorCode;
  message: string;
  boundary: "input" | "contract";
  publicSafe: true;
};

export type CompatibilityProtectorResult =
  | {
      ok: true;
      report: CompatibilityProtectionReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CompatibilityProtectorError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function toCompatibilityToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => toCompatibilityToken(value)).filter(Boolean))];
}

function failure(
  code: CompatibilityProtectorErrorCode,
  message: string,
  boundary: CompatibilityProtectorError["boundary"],
): CompatibilityProtectorResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.compatibilityProtector.rejected"],
  };
}

function cleanTrace(trace: CompatibilityProtectorTrace | undefined): CompatibilityProtectorTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    bridgeId: trace?.bridgeId?.trim() || undefined,
  };
}

function capabilityTokens(capability: InterfaceCapabilityDescriptor): readonly string[] {
  return [capability.id, capability.name, ...capability.aliases].map((value) => toCompatibilityToken(value));
}

function buildMissingGaps(
  kind: "capability" | "format",
  requestedValues: readonly string[],
  availableValues: readonly string[],
): readonly CompatibilityGap[] {
  return requestedValues
    .filter((requested) => !availableValues.includes(requested))
    .map((requested) => ({
      kind,
      requested,
      reason: `${kind} is not present in the extracted interface abstraction`,
    }));
}

export function protectCapabilityCompatibility(
  request?: CompatibilityProtectorRequest,
): CompatibilityProtectorResult {
  if (request === undefined || isBlank(request.providerId)) {
    return failure("MISSING_PROVIDER_ID", "compatibility protector requires a providerId", "input");
  }

  if (isBlank(request.interfaceId)) {
    return failure("MISSING_INTERFACE_ID", "compatibility protector requires an interfaceId", "input");
  }

  if (request.availableCapabilities === undefined) {
    return failure(
      "MISSING_AVAILABLE_CAPABILITIES",
      "compatibility protector requires extracted capability descriptors",
      "contract",
    );
  }

  if (request.availableFormats === undefined) {
    return failure(
      "MISSING_AVAILABLE_FORMATS",
      "compatibility protector requires extracted format descriptors",
      "contract",
    );
  }

  const requiredCapabilities = cleanList(request.requiredCapabilities);
  const requiredFormats = cleanList(request.requiredFormats);
  const availableCapabilityTokens = [
    ...new Set(request.availableCapabilities.flatMap((capability) => capabilityTokens(capability))),
  ];
  const availableFormatTokens = [
    ...new Set(request.availableFormats.flatMap((format) => [format.id, format.name].map((value) => toCompatibilityToken(value)))),
  ];

  const capabilityGaps = buildMissingGaps("capability", requiredCapabilities, availableCapabilityTokens);
  const formatGaps = buildMissingGaps("format", requiredFormats, availableFormatTokens);
  const scopeGaps: CompatibilityGap[] = [];

  if (request.scopeDecision !== undefined && !request.scopeDecision.accepted) {
    for (const capability of request.scopeDecision.missingCapabilities) {
      scopeGaps.push({
        kind: "scope",
        requested: capability,
        reason: "capability is outside the approved interface scope",
      });
    }

    for (const format of request.scopeDecision.missingFormats) {
      scopeGaps.push({
        kind: "scope",
        requested: format,
        reason: "format is outside the approved interface scope",
      });
    }
  }

  const compatible = capabilityGaps.length === 0 && formatGaps.length === 0 && scopeGaps.length === 0;

  return {
    ok: true,
    report: {
      providerId: (request.providerId ?? "").trim(),
      interfaceId: (request.interfaceId ?? "").trim(),
      compatible,
      requiredCapabilities,
      requiredFormats,
      capabilityGaps,
      formatGaps,
      scopeGaps,
      bridgeable: compatible,
      trace: cleanTrace(request.trace),
      unsafeSideEffects: false,
    },
    events: [
      compatible
        ? "agentCore.modelAdapter.compatibilityProtector.compatible"
        : "agentCore.modelAdapter.compatibilityProtector.gapDetected",
    ],
  };
}
