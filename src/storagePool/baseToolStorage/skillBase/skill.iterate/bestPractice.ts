import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSkillIteratePractice } from "./anthropic.js";
import { deepmindSkillIteratePractice } from "./deepmind.js";
import { openaiSkillIteratePractice } from "./openai.js";
import { buildSkillBasePracticeAuditMetadata, createSkillBaseCoreHandler, createSkillBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../_shared/baseToolAdapter.js";
import { executeSkillIterate as executeSkillIterateCore, type SkillIterateOutput, type SkillIterateRequest } from "./core.js";
import { skillIterateDependencyDeclarations, type SkillIterateProviderPractice } from "./dependencies.js";
import type { SkillBasePracticeProviderName } from "../_shared/baseToolAdapter.js";

export { planSkillIteration, skillIterateDescriptor, executeSkillIterate as executeSkillIterateCore } from "./core.js";
export type { SkillIterateErrorCode, SkillIterateOutput, SkillIterateRequest, SkillIterateResult, SkillIterateTarget, SkillIterationOperation, SkillIterationOperationKind } from "./core.js";

export type SkillIterateBestPracticeRequest = SkillIterateRequest & { executor?: BaseToolExecutorPort; preferredProvider?: SkillBasePracticeProviderName };
export type SkillIterateHandlerInput = Omit<SkillIterateBestPracticeRequest, "executor">;

const practices = [anthropicSkillIteratePractice, openaiSkillIteratePractice, deepmindSkillIteratePractice] as const;
function ordered(preferredProvider?: SkillBasePracticeProviderName): readonly SkillIterateProviderPractice[] {
  return preferredProvider === undefined ? practices : [...practices.filter((practice) => practice.providerName === preferredProvider), ...practices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectSkillIteratePractice(dependencies: SkillIterateBestPracticeRequest = {}) {
  for (const practice of ordered(dependencies.preferredProvider)) {
    const provider = practice.createProvider({ executor: dependencies.executor, provider: dependencies.provider });
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native" as const, practice: { providerName: "praxis-native" as const, source: { kind: "praxis-native" as const, label: "Praxis dry-run fallback", path: undefined }, directCliSupport: false, sideEffectPolicy: "runtime-governed" as const, notes: ["No runtime filesystem reader/writer is available; dry-run remains available."], createProvider: () => undefined }, provider: undefined };
}
export async function executeSkillIterate(request: SkillIterateBestPracticeRequest = {}): ReturnType<typeof executeSkillIterateCore> {
  const selection = selectSkillIteratePractice(request);
  return executeSkillIterateCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }) } } });
}
export const skillIterateBaseToolDefinition = createSkillBaseToolDefinition<SkillIterateHandlerInput, SkillIterateOutput>({ toolId: "skill.iterate", title: "Skill Iterate", description: "Iterate an existing skill package through governed runtime filesystem support.", summary: "Use skill.iterate to modify SKILL.md and skill support files with a patch-style plan.", riskLevel: "risky", permissionHints: ["skill:write", "filesystem:write"], dependencies: skillIterateDependencyDeclarations, inputSchema: jsonSchema("skill.iterate.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("skill.iterate.output", { type: "object", additionalProperties: true }) });
export const skillIterateHandler: BaseToolHandler<SkillIterateHandlerInput, SkillIterateOutput> = createSkillBaseCoreHandler(skillIterateBaseToolDefinition, async (request) => {
  const selection = selectSkillIteratePractice({ ...request.input, executor: request.executor });
  return executeSkillIterateCore({ ...request.input, provider: selection.provider, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, sessionId: request.input.context?.sessionId ?? request.sessionId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }), request.input.context?.auditMetadata, request) } });
});
