/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：定义 EphemeralProcedure 这一临时 BaseTool 编排合同。
 * 边界：只描述已有 BaseTool 的一次性执行计划，不生产新工具，不接管 TAP。
 * 对接：mainLoop 解释模型决策后交给 runtime 通过 BaseTool registry/handler/executor 执行。
 * 实现提示：只校验和归一化计划，真实执行必须留在 runtime BaseTool mount 链。
 */

export type EphemeralProcedureAuthor = "model" | "runtime";
export type EphemeralProcedureExecutionMode = "serial" | "parallel" | "mixed";
export type EphemeralProcedureRiskLevel = "low" | "medium" | "high";

export type EphemeralProcedureResourceHints = {
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxSteps?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type EphemeralProcedureExpectedOutput = {
  outputRef: string;
  kind?: "text" | "json" | "artifact" | "observation" | (string & {});
  description?: string;
};

export type EphemeralProcedureStep = {
  stepId: string;
  baseToolId: string;
  input: Readonly<Record<string, unknown>>;
  dependsOn: readonly string[];
  riskLevel: EphemeralProcedureRiskLevel;
  resourceHints: EphemeralProcedureResourceHints;
  outputRef: string;
};

export type EphemeralProcedurePlan = {
  kind: "praxis.ephemeralProcedurePlan";
  procedureId: string;
  purpose: string;
  author: EphemeralProcedureAuthor;
  executionMode: EphemeralProcedureExecutionMode;
  steps: readonly EphemeralProcedureStep[];
  dependencies: readonly string[];
  requiredBaseTools: readonly string[];
  riskLevel: EphemeralProcedureRiskLevel;
  approval: {
    required: boolean;
    reason?: string;
  };
  resourceLimits: EphemeralProcedureResourceHints;
  expectedOutputs: readonly EphemeralProcedureExpectedOutput[];
  mergeObservationPolicy: "append" | "replace" | "summarize" | (string & {});
  metadata: Readonly<Record<string, unknown>>;
};

export type EphemeralProcedureValidationError = {
  code:
    | "MISSING_PROCEDURE_ID"
    | "MISSING_PURPOSE"
    | "EMPTY_STEPS"
    | "MISSING_BASE_TOOL"
    | "DUPLICATE_STEP_ID"
    | "UNKNOWN_DEPENDENCY"
    | "TAP_NOT_ALLOWED";
  message: string;
  publicSafe: true;
};

export type EphemeralProcedureValidationResult =
  | { ok: true; plan: EphemeralProcedurePlan; events: readonly string[] }
  | { ok: false; error: EphemeralProcedureValidationError; events: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => readString(item)).filter((item): item is string => item !== undefined))]
    : [];
}

function readRiskLevel(value: unknown): EphemeralProcedureRiskLevel {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function readExecutionMode(value: unknown): EphemeralProcedureExecutionMode {
  return value === "serial" || value === "parallel" || value === "mixed" ? value : "serial";
}

function readResourceHints(value: unknown): EphemeralProcedureResourceHints {
  if (!isRecord(value)) {
    return {};
  }
  return {
    timeoutMs: typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs) ? value.timeoutMs : undefined,
    maxOutputBytes: typeof value.maxOutputBytes === "number" && Number.isFinite(value.maxOutputBytes) ? value.maxOutputBytes : undefined,
    maxSteps: typeof value.maxSteps === "number" && Number.isFinite(value.maxSteps) ? value.maxSteps : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function failure(
  code: EphemeralProcedureValidationError["code"],
  message: string,
): EphemeralProcedureValidationResult {
  return {
    ok: false,
    error: { code, message, publicSafe: true },
    events: ["agentCore.execution.ephemeralProcedure.rejected"],
  };
}

export function normalizeEphemeralProcedurePlan(input: unknown): EphemeralProcedureValidationResult {
  if (!isRecord(input)) {
    return failure("MISSING_PROCEDURE_ID", "EphemeralProcedure requires a procedure object");
  }

  const procedureId = readString(input.procedureId);
  if (procedureId === undefined) {
    return failure("MISSING_PROCEDURE_ID", "EphemeralProcedure requires a procedureId");
  }

  const purpose = readString(input.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "EphemeralProcedure requires a purpose");
  }

  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  if (rawSteps.length === 0) {
    return failure("EMPTY_STEPS", "EphemeralProcedure requires at least one BaseTool step");
  }

  const seen = new Set<string>();
  const steps: EphemeralProcedureStep[] = [];
  for (const [index, raw] of rawSteps.entries()) {
    if (!isRecord(raw)) {
      return failure("MISSING_BASE_TOOL", `EphemeralProcedure step ${index + 1} is not an object`);
    }
    const stepId = readString(raw.stepId) ?? `${procedureId}:step:${index + 1}`;
    if (seen.has(stepId)) {
      return failure("DUPLICATE_STEP_ID", `EphemeralProcedure step ${stepId} is duplicated`);
    }
    seen.add(stepId);
    const baseToolId = readString(raw.baseToolId);
    if (baseToolId === undefined) {
      return failure("MISSING_BASE_TOOL", `EphemeralProcedure step ${stepId} requires baseToolId`);
    }
    if (baseToolId.startsWith("tap.") || baseToolId.startsWith("tap/")) {
      return failure("TAP_NOT_ALLOWED", "EphemeralProcedure cannot create or invoke TAP capability in this layer");
    }
    steps.push({
      stepId,
      baseToolId,
      input: isRecord(raw.input) ? raw.input : {},
      dependsOn: readStringArray(raw.dependsOn),
      riskLevel: readRiskLevel(raw.riskLevel),
      resourceHints: readResourceHints(raw.resourceHints),
      outputRef: readString(raw.outputRef) ?? `${procedureId}:output:${stepId}`,
    });
  }

  for (const step of steps) {
    const unknown = step.dependsOn.find((dependency) => !seen.has(dependency));
    if (unknown !== undefined) {
      return failure("UNKNOWN_DEPENDENCY", `EphemeralProcedure step ${step.stepId} depends on unknown step ${unknown}`);
    }
  }

  const requiredBaseTools = [...new Set([
    ...readStringArray(input.requiredBaseTools),
    ...steps.map((step) => step.baseToolId),
  ])];

  return {
    ok: true,
    plan: {
      kind: "praxis.ephemeralProcedurePlan",
      procedureId,
      purpose,
      author: input.author === "runtime" ? "runtime" : "model",
      executionMode: readExecutionMode(input.executionMode),
      steps,
      dependencies: readStringArray(input.dependencies),
      requiredBaseTools,
      riskLevel: readRiskLevel(input.riskLevel),
      approval: {
        required: Boolean(isRecord(input.approval) ? input.approval.required : input.approvalRequired),
        reason: isRecord(input.approval) ? readString(input.approval.reason) : readString(input.approvalReason),
      },
      resourceLimits: readResourceHints(input.resourceLimits),
      expectedOutputs: Array.isArray(input.expectedOutputs)
        ? input.expectedOutputs.filter(isRecord).map((output, index) => ({
            outputRef: readString(output.outputRef) ?? `${procedureId}:expected:${index + 1}`,
            kind: readString(output.kind),
            description: readString(output.description),
          }))
        : [],
      mergeObservationPolicy: readString(input.mergeObservationPolicy) ?? "append",
      metadata: isRecord(input.metadata) ? input.metadata : {},
    },
    events: ["agentCore.execution.ephemeralProcedure.accepted"],
  };
}
