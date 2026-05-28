/*
 * 文件定位：Agent 执行引擎 / Pre-compact context governance contract。
 * 核心目的：在 context compact 真正执行前，用一次性治理视图去噪 projectContext/sessionSummary。
 * 边界：不是常态 CMP/RAG/memory agent；不执行工具；失败不阻断原 compact。
 * 对接：承接 contextCompact、PromptPack assembly、PraxisRuntimeKernel 和应用注入的 one-shot governance executor。
 * 实现提示：保持协议和校验层轻量，runtime 负责触发时机、材料应用、审计记录和 fallback。
 */

import type {
  PromptPackMaterialKind,
  PromptPackSegmentKind,
} from "../promptPack/promptDefiner.js";

export type PreCompactGovernancePacketMaterial = {
  id: string;
  kind: PromptPackMaterialKind | (string & {});
  segmentKind: PromptPackSegmentKind;
  text: string;
  source?: string;
  trusted?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PreCompactGovernanceIndexedMaterial = {
  id: string;
  segmentKind: "memoryContext" | "retrievedContext" | "observations";
  summary: string;
  status?: string;
  refs: readonly string[];
  source?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PreCompactGovernancePacket = {
  kind: "praxis.preCompactGovernance.packet";
  version: 1;
  runtimeId: string;
  sessionId: string;
  turnIndex: number;
  trigger: "turnBoundary" | "toolLoopBoundary";
  currentUserTurnText: string;
  governanceInstruction: string;
  projectContext: readonly PreCompactGovernancePacketMaterial[];
  sessionSummary: readonly PreCompactGovernancePacketMaterial[];
  recentConversation: readonly PreCompactGovernancePacketMaterial[];
  memoryContext: readonly PreCompactGovernanceIndexedMaterial[];
  retrievedContext: readonly PreCompactGovernanceIndexedMaterial[];
  observations: readonly PreCompactGovernanceIndexedMaterial[];
  excludedSegmentKinds: readonly ["toolDeclarations", "assistantScratchpadPlan"];
  metadata: Readonly<Record<string, unknown>>;
};

export type PreCompactGovernanceFact = {
  text: string;
  reason?: string;
  evidenceRefs?: readonly string[];
};

export type PreCompactGovernanceRemovedNoise = {
  text: string;
  reason: "stale" | "duplicate" | "superseded" | "irrelevant" | "tool-noise" | "other";
  evidenceRefs?: readonly string[];
};

export type PreCompactGovernanceProjectContextUpdate = {
  id?: string;
  text: string;
  reason?: string;
  evidenceRefs?: readonly string[];
  confidence?: number;
};

export type PreCompactGovernanceResult = {
  kind: "praxis.preCompactGovernance.result";
  version: 1;
  sessionSummaryCandidate: {
    text: string;
    mode: "replace" | "append";
  };
  projectContextUpdates: readonly PreCompactGovernanceProjectContextUpdate[];
  staleClaims: readonly PreCompactGovernanceFact[];
  preservedFacts: readonly PreCompactGovernanceFact[];
  removedNoise: readonly PreCompactGovernanceRemovedNoise[];
  uncertainty: readonly PreCompactGovernanceFact[];
  evidenceRefs: readonly string[];
};

export type PreCompactGovernanceRecord = {
  kind: "praxis.preCompactGovernance.record";
  governanceId: string;
  sessionId: string;
  turnIndex: number;
  trigger: "turnBoundary" | "toolLoopBoundary";
  status: "completed" | "skipped" | "failed" | "invalid";
  packetMaterialRefs: readonly string[];
  appliedSessionSummary: boolean;
  appliedProjectContextUpdates: number;
  staleClaims: readonly PreCompactGovernanceFact[];
  preservedFacts: readonly PreCompactGovernanceFact[];
  removedNoise: readonly PreCompactGovernanceRemovedNoise[];
  uncertainty: readonly PreCompactGovernanceFact[];
  evidenceRefs: readonly string[];
  error?: { code: string; message: string; publicSafe: true };
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type PreCompactGovernanceExecutorRequest = {
  packet: PreCompactGovernancePacket;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PreCompactGovernanceExecutorResult =
  | {
      ok: true;
      result: PreCompactGovernanceResult;
      record: PreCompactGovernanceRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      record: PreCompactGovernanceRecord;
      events: readonly string[];
    };

export type PreCompactGovernanceExecutor = {
  govern(request: PreCompactGovernanceExecutorRequest): Promise<PreCompactGovernanceExecutorResult>;
};

export type PreCompactGovernanceModelResponse = string | Readonly<Record<string, unknown>>;

export type PreCompactGovernanceModelCaller = (
  packet: PreCompactGovernancePacket,
) => Promise<PreCompactGovernanceModelResponse>;

const preCompactGovernanceFactSchema = {
  oneOf: [
    { type: "string", minLength: 1 },
    {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 1 },
        reason: { type: "string" },
        evidenceRefs: { type: "array", items: { type: "string", minLength: 1 } },
      },
      additionalProperties: true,
    },
  ],
} as const;

export const PRE_COMPACT_GOVERNANCE_SCHEMA = {
  type: "object",
  required: [
    "kind",
    "version",
    "sessionSummaryCandidate",
    "projectContextUpdates",
    "staleClaims",
    "preservedFacts",
    "removedNoise",
    "uncertainty",
    "evidenceRefs",
  ],
  properties: {
    kind: { const: "praxis.preCompactGovernance.result" },
    version: { const: 1 },
    sessionSummaryCandidate: {
      type: "object",
      required: ["text", "mode"],
      properties: {
        text: { type: "string", minLength: 1 },
        mode: { enum: ["replace", "append"] },
      },
    },
    projectContextUpdates: {
      type: "array",
      items: {
        type: "object",
        required: ["text"],
        properties: {
          id: { type: "string" },
          text: { type: "string", minLength: 1 },
          reason: { type: "string" },
          evidenceRefs: { type: "array", items: { type: "string", minLength: 1 } },
          confidence: { type: "number" },
        },
        additionalProperties: true,
      },
    },
    staleClaims: { type: "array", items: preCompactGovernanceFactSchema },
    preservedFacts: { type: "array", items: preCompactGovernanceFactSchema },
    removedNoise: {
      type: "array",
      items: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", minLength: 1 },
          reason: { enum: ["stale", "duplicate", "superseded", "irrelevant", "tool-noise", "other"] },
          evidenceRefs: { type: "array", items: { type: "string", minLength: 1 } },
        },
        additionalProperties: true,
      },
    },
    uncertainty: { type: "array", items: preCompactGovernanceFactSchema },
    evidenceRefs: { type: "array", items: { type: "string", minLength: 1 } },
  },
} as const;

export function preCompactGovernanceInstruction(): string {
  return [
    "Praxis preCompactGovernance:",
    "You are a one-shot context governance utility. Do not call tools.",
    "Read the compact governance packet and remove stale, duplicated, superseded, or irrelevant context before compact.",
    "The main editable target is sessionSummary. ProjectContext may be updated, but only from evidence in the packet.",
    "Never rewrite stable runtime rules, tool declarations, current user input, or hidden scratchpad.",
    "Return only JSON matching praxis.preCompactGovernance.result v1.",
  ].join("\n");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function schemaError(message: string): { code: string; message: string; publicSafe: true } {
  return { code: "INVALID_PRE_COMPACT_GOVERNANCE_SCHEMA", message, publicSafe: true };
}

function requiredArray(record: Record<string, unknown>, field: string): {
  ok: true;
  value: readonly unknown[];
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  const value = record[field];
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: schemaError(`preCompactGovernance result requires array field ${field}`),
    };
  }
  return { ok: true, value };
}

function normalizeEvidenceRefs(value: unknown, field: string): {
  ok: true;
  value: readonly string[];
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: schemaError(`${field}.evidenceRefs must be an array when present`) };
  const refs: string[] = [];
  for (const [index, item] of value.entries()) {
    const ref = stringValue(item);
    if (ref === undefined) {
      return { ok: false, error: schemaError(`${field}.evidenceRefs[${index}] must be a non-empty string`) };
    }
    refs.push(ref);
  }
  return { ok: true, value: refs };
}

function normalizeStringList(value: unknown, field: string): {
  ok: true;
  value: readonly string[];
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  if (!Array.isArray(value)) return { ok: false, error: schemaError(`${field} must be an array`) };
  const items: string[] = [];
  for (const [index, item] of value.entries()) {
    const text = stringValue(item);
    if (text === undefined) return { ok: false, error: schemaError(`${field}[${index}] must be a non-empty string`) };
    items.push(text);
  }
  return { ok: true, value: items };
}

function normalizeFactList(value: unknown, field: string): {
  ok: true;
  value: readonly PreCompactGovernanceFact[];
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  if (!Array.isArray(value)) return { ok: false, error: schemaError(`${field} must be an array`) };
  const facts: PreCompactGovernanceFact[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item === "string") {
      const text = stringValue(item);
      if (text === undefined) return { ok: false, error: schemaError(`${field}[${index}] must not be empty`) };
      facts.push({ text });
      continue;
    }
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: schemaError(`${field}[${index}] must be a string or fact object`) };
    }
    const record = item as Record<string, unknown>;
    const text = stringValue(record.text ?? record.claim ?? record.fact);
    if (text === undefined) return { ok: false, error: schemaError(`${field}[${index}] requires non-empty text`) };
    const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs, `${field}[${index}]`);
    if (!evidenceRefs.ok) return evidenceRefs;
    facts.push({
      text,
      ...(stringValue(record.reason) === undefined ? {} : { reason: stringValue(record.reason) }),
      ...(evidenceRefs.value.length === 0 ? {} : { evidenceRefs: evidenceRefs.value }),
    });
  }
  return { ok: true, value: facts };
}

function normalizeProjectContextUpdateList(value: unknown): {
  ok: true;
  value: readonly PreCompactGovernanceProjectContextUpdate[];
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  if (!Array.isArray(value)) return { ok: false, error: schemaError("projectContextUpdates must be an array") };
  const updates: PreCompactGovernanceProjectContextUpdate[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: schemaError(`projectContextUpdates[${index}] must be an object`) };
    }
    const record = item as Record<string, unknown>;
    const text = stringValue(record.text ?? record.update ?? record.claim);
    if (text === undefined) return { ok: false, error: schemaError(`projectContextUpdates[${index}] requires non-empty text`) };
    const confidence = numberValue(record.confidence);
    const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs, `projectContextUpdates[${index}]`);
    if (!evidenceRefs.ok) return evidenceRefs;
    updates.push({
      ...(stringValue(record.id) === undefined ? {} : { id: stringValue(record.id) }),
      text,
      ...(stringValue(record.reason) === undefined ? {} : { reason: stringValue(record.reason) }),
      ...(evidenceRefs.value.length === 0 ? {} : { evidenceRefs: evidenceRefs.value }),
      ...(confidence === undefined ? {} : { confidence }),
    });
  }
  return { ok: true, value: updates };
}

function normalizeRemovedNoiseList(value: unknown): {
  ok: true;
  value: readonly PreCompactGovernanceRemovedNoise[];
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  if (!Array.isArray(value)) return { ok: false, error: schemaError("removedNoise must be an array") };
  const items: PreCompactGovernanceRemovedNoise[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: schemaError(`removedNoise[${index}] must be an object`) };
    }
    const record = item as Record<string, unknown>;
    const text = stringValue(record.text ?? record.claim ?? record.fact);
    if (text === undefined) return { ok: false, error: schemaError(`removedNoise[${index}] requires non-empty text`) };
    const reason = stringValue(record.reason);
    const allowedReasons = ["stale", "duplicate", "superseded", "irrelevant", "tool-noise", "other"] as const;
    const normalizedReason = allowedReasons.find((candidate) => candidate === reason) ?? "other";
    const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs, `removedNoise[${index}]`);
    if (!evidenceRefs.ok) return evidenceRefs;
    items.push({
      text,
      reason: normalizedReason,
      ...(evidenceRefs.value.length === 0 ? {} : { evidenceRefs: evidenceRefs.value }),
    });
  }
  return { ok: true, value: items };
}

export function parsePreCompactGovernanceResult(raw: PreCompactGovernanceModelResponse): {
  ok: true;
  result: PreCompactGovernanceResult;
} | {
  ok: false;
  error: { code: string; message: string; publicSafe: true };
} {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: { code: "INVALID_PRE_COMPACT_GOVERNANCE_JSON", message: "preCompactGovernance returned invalid JSON", publicSafe: true },
      };
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      error: { code: "INVALID_PRE_COMPACT_GOVERNANCE_RESULT", message: "preCompactGovernance result must be an object", publicSafe: true },
    };
  }
  const record = parsed as Record<string, unknown>;
  if (record.kind !== "praxis.preCompactGovernance.result" || record.version !== 1) {
    return {
      ok: false,
      error: { code: "INVALID_PRE_COMPACT_GOVERNANCE_VERSION", message: "preCompactGovernance result must use praxis.preCompactGovernance.result v1", publicSafe: true },
    };
  }
  const summaryCandidate = record.sessionSummaryCandidate;
  if (typeof summaryCandidate !== "object" || summaryCandidate === null) {
    return {
      ok: false,
      error: { code: "MISSING_PRE_COMPACT_SESSION_SUMMARY", message: "preCompactGovernance result is missing sessionSummaryCandidate", publicSafe: true },
    };
  }
  const summaryRecord = summaryCandidate as Record<string, unknown>;
  const summaryText = stringValue(summaryRecord.text);
  const summaryMode = summaryRecord.mode === "append" ? "append" : summaryRecord.mode === "replace" ? "replace" : undefined;
  if (summaryText === undefined || summaryMode === undefined) {
    return {
      ok: false,
      error: { code: "INVALID_PRE_COMPACT_SESSION_SUMMARY", message: "sessionSummaryCandidate requires non-empty text and mode replace|append", publicSafe: true },
    };
  }
  for (const field of [
    "projectContextUpdates",
    "staleClaims",
    "preservedFacts",
    "removedNoise",
    "uncertainty",
    "evidenceRefs",
  ] as const) {
    const validation = requiredArray(record, field);
    if (!validation.ok) return validation;
  }
  const projectContextUpdates = normalizeProjectContextUpdateList(record.projectContextUpdates);
  if (!projectContextUpdates.ok) return projectContextUpdates;
  const staleClaims = normalizeFactList(record.staleClaims, "staleClaims");
  if (!staleClaims.ok) return staleClaims;
  const preservedFacts = normalizeFactList(record.preservedFacts, "preservedFacts");
  if (!preservedFacts.ok) return preservedFacts;
  const removedNoise = normalizeRemovedNoiseList(record.removedNoise);
  if (!removedNoise.ok) return removedNoise;
  const uncertainty = normalizeFactList(record.uncertainty, "uncertainty");
  if (!uncertainty.ok) return uncertainty;
  const evidenceRefs = normalizeStringList(record.evidenceRefs, "evidenceRefs");
  if (!evidenceRefs.ok) return evidenceRefs;
  return {
    ok: true,
    result: {
      kind: "praxis.preCompactGovernance.result",
      version: 1,
      sessionSummaryCandidate: { text: summaryText, mode: summaryMode },
      projectContextUpdates: projectContextUpdates.value,
      staleClaims: staleClaims.value,
      preservedFacts: preservedFacts.value,
      removedNoise: removedNoise.value,
      uncertainty: uncertainty.value,
      evidenceRefs: evidenceRefs.value,
    },
  };
}

export function createSkippedPreCompactGovernanceRecord(input: {
  packet: PreCompactGovernancePacket;
  reason: string;
  now?: string;
}): PreCompactGovernanceRecord {
  const createdAt = input.now ?? new Date().toISOString();
  return {
    kind: "praxis.preCompactGovernance.record",
    governanceId: `${input.packet.sessionId}:preCompactGovernance:${createdAt}`,
    sessionId: input.packet.sessionId,
    turnIndex: input.packet.turnIndex,
    trigger: input.packet.trigger,
    status: "skipped",
    packetMaterialRefs: packetMaterialRefs(input.packet),
    appliedSessionSummary: false,
    appliedProjectContextUpdates: 0,
    staleClaims: [],
    preservedFacts: [],
    removedNoise: [],
    uncertainty: [],
    evidenceRefs: [],
    error: { code: "PRE_COMPACT_GOVERNANCE_SKIPPED", message: input.reason, publicSafe: true },
    createdAt,
    metadata: {},
    publicSafe: true,
  };
}

export function createNoopPreCompactGovernanceExecutor(reason = "preCompactGovernance executor not configured"): PreCompactGovernanceExecutor {
  return {
    async govern(request) {
      return {
        ok: false,
        record: createSkippedPreCompactGovernanceRecord({ packet: request.packet, reason, now: request.now }),
        events: ["preCompactGovernance.skipped"],
      };
    },
  };
}

export function createModelPreCompactGovernanceExecutor(input: {
  caller: PreCompactGovernanceModelCaller;
}): PreCompactGovernanceExecutor {
  return {
    async govern(request) {
      const createdAt = request.now ?? new Date().toISOString();
      const governanceId = `${request.packet.sessionId}:preCompactGovernance:${createdAt}`;
      const baseRecord = {
        kind: "praxis.preCompactGovernance.record" as const,
        governanceId,
        sessionId: request.packet.sessionId,
        turnIndex: request.packet.turnIndex,
        trigger: request.packet.trigger,
        packetMaterialRefs: packetMaterialRefs(request.packet),
        createdAt,
        metadata: request.metadata ?? {},
        publicSafe: true as const,
      };
      try {
        const raw = await input.caller(request.packet);
        const parsed = parsePreCompactGovernanceResult(raw);
        if (!parsed.ok) {
          return {
            ok: false,
            record: {
              ...baseRecord,
              status: "invalid" as const,
              appliedSessionSummary: false,
              appliedProjectContextUpdates: 0,
              staleClaims: [],
              preservedFacts: [],
              removedNoise: [],
              uncertainty: [],
              evidenceRefs: [],
              error: parsed.error,
            },
            events: ["preCompactGovernance.invalid"],
          };
        }
        return {
          ok: true,
          result: parsed.result,
          record: {
            ...baseRecord,
            status: "completed" as const,
            appliedSessionSummary: true,
            appliedProjectContextUpdates: parsed.result.projectContextUpdates.length,
            staleClaims: parsed.result.staleClaims,
            preservedFacts: parsed.result.preservedFacts,
            removedNoise: parsed.result.removedNoise,
            uncertainty: parsed.result.uncertainty,
            evidenceRefs: parsed.result.evidenceRefs,
          },
          events: ["preCompactGovernance.completed"],
        };
      } catch (error) {
        return {
          ok: false,
          record: {
            ...baseRecord,
            status: "failed" as const,
            appliedSessionSummary: false,
            appliedProjectContextUpdates: 0,
            staleClaims: [],
            preservedFacts: [],
            removedNoise: [],
            uncertainty: [],
            evidenceRefs: [],
            error: {
              code: "PRE_COMPACT_GOVERNANCE_FAILED",
              message: error instanceof Error ? error.message : "preCompactGovernance executor failed",
              publicSafe: true,
            },
          },
          events: ["preCompactGovernance.failed"],
        };
      }
    },
  };
}

export function packetMaterialRefs(packet: PreCompactGovernancePacket): readonly string[] {
  return [
    ...packet.projectContext.map((material) => material.id),
    ...packet.sessionSummary.map((material) => material.id),
    ...packet.recentConversation.map((material) => material.id),
    ...packet.memoryContext.map((material) => material.id),
    ...packet.retrievedContext.map((material) => material.id),
    ...packet.observations.map((material) => material.id),
    "runtime.input.currentUserTurn",
  ];
}
