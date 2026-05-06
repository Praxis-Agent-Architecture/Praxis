/*
 * 文件定位：agent_interfaceAdapter / 外部接口统一信封。
 * 核心目的：让 CLI、TUI、Raxode、Raxos 或自定义应用用同一种 envelope 接走 runtime 事件、审批、状态和管理命令。
 * 边界：只定义和校验接口信封，不实现 TAP/CMP/MP/multiagent 具体策略。
 */

export type InterfaceEnvelopeKind =
  | "event"
  | "approval"
  | "approvalResolution"
  | "state"
  | "management"
  | "debug"
  | "repair"
  | "toolObservation"
  | "modelObservation";

export type InterfaceEnvelopeSurface =
  | "cli"
  | "tui"
  | "raxode"
  | "raxos"
  | "application"
  | "officialModule"
  | "custom";

export type InterfaceEnvelope = {
  envelopeId: string;
  kind: InterfaceEnvelopeKind;
  surface: InterfaceEnvelopeSurface;
  runtimeId: string;
  sessionId?: string;
  correlationId?: string;
  payload: unknown;
  publicSafe: true;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type InterfaceEnvelopeValidationErrorCode =
  | "MISSING_ENVELOPE_ID"
  | "MISSING_KIND"
  | "MISSING_SURFACE"
  | "MISSING_RUNTIME_ID"
  | "UNSAFE_PAYLOAD";

export type InterfaceEnvelopeValidationResult =
  | { ok: true; envelope: InterfaceEnvelope; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: InterfaceEnvelopeValidationErrorCode;
        message: string;
        boundary: "input" | "safety";
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: InterfaceEnvelopeValidationErrorCode,
  message: string,
  boundary: "input" | "safety",
): InterfaceEnvelopeValidationResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.interfaceEnvelope.rejected"],
  };
}

export function createInterfaceEnvelope(input: Omit<InterfaceEnvelope, "createdAt" | "metadata" | "publicSafe"> & {
  createdAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
  publicSafe?: boolean;
}): InterfaceEnvelopeValidationResult {
  if (!hasText(input.envelopeId)) {
    return failure("MISSING_ENVELOPE_ID", "interface envelope requires an envelopeId", "input");
  }
  if (!hasText(input.kind)) {
    return failure("MISSING_KIND", "interface envelope requires a kind", "input");
  }
  if (!hasText(input.surface)) {
    return failure("MISSING_SURFACE", "interface envelope requires a target surface", "input");
  }
  if (!hasText(input.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "interface envelope requires a runtimeId", "input");
  }
  if (input.publicSafe === false) {
    return failure("UNSAFE_PAYLOAD", "interface envelope payload must be public-safe before leaving agentCore", "safety");
  }

  return {
    ok: true,
    envelope: {
      envelopeId: input.envelopeId.trim(),
      kind: input.kind,
      surface: input.surface,
      runtimeId: input.runtimeId.trim(),
      sessionId: input.sessionId?.trim() || undefined,
      correlationId: input.correlationId?.trim() || undefined,
      payload: input.payload,
      publicSafe: true,
      createdAt: input.createdAt ?? new Date(0).toISOString(),
      metadata: input.metadata ?? {},
    },
    events: ["agentCore.interfaceEnvelope.created"],
  };
}

export function approvalInterfaceEnvelope(input: {
  approvalId: string;
  runtimeId: string;
  sessionId?: string;
  surface?: InterfaceEnvelopeSurface;
  payload: unknown;
  createdAt?: string;
}): InterfaceEnvelopeValidationResult {
  return createInterfaceEnvelope({
    envelopeId: `approval:${input.approvalId}`,
    kind: "approval",
    surface: input.surface ?? "application",
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    payload: input.payload,
    createdAt: input.createdAt,
    metadata: { approvalId: input.approvalId },
  });
}
