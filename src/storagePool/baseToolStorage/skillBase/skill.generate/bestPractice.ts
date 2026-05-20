import type { BaseToolExecutorPort } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSkillGeneratePractice } from "./anthropic.js";
import { deepmindSkillGeneratePractice } from "./deepmind.js";
import { openaiSkillGeneratePractice } from "./openai.js";
import { buildSkillBasePracticeAuditMetadata, createSkillBaseCoreHandler, createSkillBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../_shared/baseToolAdapter.js";
import { executeSkillGenerate as executeSkillGenerateCore, type SkillGenerateOutput, type SkillGenerateRequest } from "./core.js";
import { skillGenerateDependencyDeclarations, type SkillGenerateProviderPractice } from "./dependencies.js";
import type { SkillBasePracticeProviderName } from "../_shared/baseToolAdapter.js";

export { planSkillGeneration, skillGenerateDescriptor, executeSkillGenerate as executeSkillGenerateCore } from "./core.js";
export type { SkillGenerateErrorCode, SkillGenerateFileKind, SkillGenerateOutput, SkillGenerateRequestedFile, SkillGenerateRequest, SkillGenerateResult, SkillGenerateTarget } from "./core.js";

export type SkillGenerateBestPracticeRequest = SkillGenerateRequest & { executor?: BaseToolExecutorPort; preferredProvider?: SkillBasePracticeProviderName };
export type SkillGenerateHandlerInput = Omit<SkillGenerateBestPracticeRequest, "executor">;

const practices = [anthropicSkillGeneratePractice, openaiSkillGeneratePractice, deepmindSkillGeneratePractice] as const;

function ordered(preferredProvider?: SkillBasePracticeProviderName): readonly SkillGenerateProviderPractice[] {
  return preferredProvider === undefined ? practices : [...practices.filter((practice) => practice.providerName === preferredProvider), ...practices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectSkillGeneratePractice(dependencies: SkillGenerateBestPracticeRequest = {}) {
  for (const practice of ordered(dependencies.preferredProvider)) {
    const provider = practice.createProvider({ executor: dependencies.executor, provider: dependencies.provider });
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native" as const, practice: { providerName: "praxis-native" as const, source: { kind: "praxis-native" as const, label: "Praxis dry-run fallback", path: undefined }, directCliSupport: false, sideEffectPolicy: "runtime-governed" as const, notes: ["No runtime filesystem writer is available; dry-run remains available."], createProvider: () => undefined }, provider: undefined };
}

export async function executeSkillGenerate(request: SkillGenerateBestPracticeRequest = {}): ReturnType<typeof executeSkillGenerateCore> {
  const selection = selectSkillGeneratePractice(request);
  return executeSkillGenerateCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }) } } });
}

export const skillGenerateBaseToolDefinition = createSkillBaseToolDefinition<SkillGenerateHandlerInput, SkillGenerateOutput>({
  toolId: "skill.generate",
  title: "Skill Generate",
  description: "Generate a local SKILL.md package through governed runtime filesystem support.",
  summary: "Use skill.generate to create skill directories and initial SKILL.md files.",
  riskLevel: "risky",
  permissionHints: ["skill:write", "filesystem:write"],
  dependencies: skillGenerateDependencyDeclarations,
  inputSchema: jsonSchema("skill.generate.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("skill.generate.output", { type: "object", additionalProperties: true }),
});

export const skillGenerateHandler: BaseToolHandler<SkillGenerateHandlerInput, SkillGenerateOutput> = createSkillBaseCoreHandler(skillGenerateBaseToolDefinition, async (request) => {
  const selection = selectSkillGeneratePractice({ ...request.input, executor: request.executor });
  return executeSkillGenerateCore({ ...request.input, provider: selection.provider, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, sessionId: request.input.context?.sessionId ?? request.sessionId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }), request.input.context?.auditMetadata, request) } });
});
