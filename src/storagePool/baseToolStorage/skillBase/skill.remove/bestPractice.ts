import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSkillRemovePractice } from "./anthropic.js";
import { deepmindSkillRemovePractice } from "./deepmind.js";
import { openaiSkillRemovePractice } from "./openai.js";
import { buildSkillBasePracticeAuditMetadata, createSkillBaseCoreHandler, createSkillBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../_shared/baseToolAdapter.js";
import { executeSkillRemove as executeSkillRemoveCore, type SkillRemoveOutput, type SkillRemoveRequest } from "./core.js";
import { skillRemoveDependencyDeclarations, type SkillRemoveProviderPractice } from "./dependencies.js";
import type { SkillBasePracticeProviderName } from "../_shared/baseToolAdapter.js";

export { planSkillRemove, skillRemoveDescriptor, executeSkillRemove as executeSkillRemoveCore } from "./core.js";
export type { SkillRemoveErrorCode, SkillRemoveMode, SkillRemoveOutput, SkillRemoveRequest, SkillRemoveResult, SkillRemoveTarget } from "./core.js";

export type SkillRemoveBestPracticeRequest = SkillRemoveRequest & { executor?: BaseToolExecutorPort; preferredProvider?: SkillBasePracticeProviderName };
export type SkillRemoveHandlerInput = Omit<SkillRemoveBestPracticeRequest, "executor">;
const practices = [anthropicSkillRemovePractice, openaiSkillRemovePractice, deepmindSkillRemovePractice] as const;
function ordered(preferredProvider?: SkillBasePracticeProviderName): readonly SkillRemoveProviderPractice[] {
  return preferredProvider === undefined ? practices : [...practices.filter((practice) => practice.providerName === preferredProvider), ...practices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectSkillRemovePractice(dependencies: SkillRemoveBestPracticeRequest = {}) {
  for (const practice of ordered(dependencies.preferredProvider)) {
    const provider = practice.createProvider({ executor: dependencies.executor, provider: dependencies.provider });
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native" as const, practice: { providerName: "praxis-native" as const, source: { kind: "praxis-native" as const, label: "Praxis dry-run fallback", path: undefined }, directCliSupport: false, sideEffectPolicy: "runtime-governed" as const, notes: ["No runtime filesystem remover is available; dry-run remains available."], createProvider: () => undefined }, provider: undefined };
}
export async function executeSkillRemove(request: SkillRemoveBestPracticeRequest = {}): ReturnType<typeof executeSkillRemoveCore> {
  const selection = selectSkillRemovePractice(request);
  return executeSkillRemoveCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }) } } });
}
export const skillRemoveBaseToolDefinition = createSkillBaseToolDefinition<SkillRemoveHandlerInput, SkillRemoveOutput>({ toolId: "skill.remove", title: "Skill Remove", description: "Disable, unlink, or purge a local skill package through governed runtime filesystem support.", summary: "Use skill.remove for guarded skill removal without plugin semantics.", riskLevel: "dangerous", permissionHints: ["skill:write", "filesystem:write"], dependencies: skillRemoveDependencyDeclarations, inputSchema: jsonSchema("skill.remove.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("skill.remove.output", { type: "object", additionalProperties: true }) });
export const skillRemoveHandler: BaseToolHandler<SkillRemoveHandlerInput, SkillRemoveOutput> = createSkillBaseCoreHandler(skillRemoveBaseToolDefinition, async (request) => {
  const selection = selectSkillRemovePractice({ ...request.input, executor: request.executor });
  return executeSkillRemoveCore({ ...request.input, provider: selection.provider, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, sessionId: request.input.context?.sessionId ?? request.sessionId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }), request.input.context?.auditMetadata, request) } });
});
