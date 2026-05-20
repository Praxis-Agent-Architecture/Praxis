import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSkillManagementPractice } from "./anthropic.js";
import { deepmindSkillManagementPractice } from "./deepmind.js";
import { openaiSkillManagementPractice } from "./openai.js";
import { buildSkillBasePracticeAuditMetadata, createSkillBaseCoreHandler, createSkillBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../_shared/baseToolAdapter.js";
import { executeSkillManagement as executeSkillManagementCore, type SkillManagementOutput, type SkillManagementRequest } from "./core.js";
import { skillManagementDependencyDeclarations, type SkillManagementProviderPractice } from "./dependencies.js";
import type { SkillBasePracticeProviderName } from "../_shared/baseToolAdapter.js";

export { planSkillManagement, skillManagementDescriptor, executeSkillManagement as executeSkillManagementCore } from "./core.js";
export type { SkillManagementAction, SkillManagementErrorCode, SkillManagementOutput, SkillManagementRequest, SkillManagementResult, SkillManagementTarget } from "./core.js";

export type SkillManagementBestPracticeRequest = SkillManagementRequest & { executor?: BaseToolExecutorPort; preferredProvider?: SkillBasePracticeProviderName };
export type SkillManagementHandlerInput = Omit<SkillManagementBestPracticeRequest, "executor">;
const practices = [anthropicSkillManagementPractice, openaiSkillManagementPractice, deepmindSkillManagementPractice] as const;
function ordered(preferredProvider?: SkillBasePracticeProviderName): readonly SkillManagementProviderPractice[] {
  return preferredProvider === undefined ? practices : [...practices.filter((practice) => practice.providerName === preferredProvider), ...practices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectSkillManagementPractice(dependencies: SkillManagementBestPracticeRequest = {}) {
  for (const practice of ordered(dependencies.preferredProvider)) {
    const provider = practice.createProvider({ executor: dependencies.executor, provider: dependencies.provider });
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native" as const, practice: { providerName: "praxis-native" as const, source: { kind: "praxis-native" as const, label: "Praxis dry-run fallback", path: undefined }, directCliSupport: false, sideEffectPolicy: "runtime-governed" as const, notes: ["No runtime filesystem provider is available; dry-run remains available."], createProvider: () => undefined }, provider: undefined };
}
export async function executeSkillManagement(request: SkillManagementBestPracticeRequest = {}): ReturnType<typeof executeSkillManagementCore> {
  const selection = selectSkillManagementPractice(request);
  return executeSkillManagementCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }) } } });
}
export const skillManagementBaseToolDefinition = createSkillBaseToolDefinition<SkillManagementHandlerInput, SkillManagementOutput>({ toolId: "skill.management", title: "Skill Management", description: "List, inspect, activate, load, enable, disable, install, link, and reload local skills.", summary: "Use skill.management for skill registry management and activate/load semantics.", riskLevel: "risky", permissionHints: ["skill:read", "skill:write", "filesystem:read", "filesystem:write"], dependencies: skillManagementDependencyDeclarations, inputSchema: jsonSchema("skill.management.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("skill.management.output", { type: "object", additionalProperties: true }) });
export const skillManagementHandler: BaseToolHandler<SkillManagementHandlerInput, SkillManagementOutput> = createSkillBaseCoreHandler(skillManagementBaseToolDefinition, async (request) => {
  const selection = selectSkillManagementPractice({ ...request.input, executor: request.executor });
  return executeSkillManagementCore({ ...request.input, provider: selection.provider, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, sessionId: request.input.context?.sessionId ?? request.sessionId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }), request.input.context?.auditMetadata, request) } });
});
