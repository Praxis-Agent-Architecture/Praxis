import type { BaseToolExecutorPort } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSkillRipgrepPractice } from "./anthropic.js";
import { deepmindSkillRipgrepPractice } from "./deepmind.js";
import { openaiSkillRipgrepPractice } from "./openai.js";
import { buildSkillBasePracticeAuditMetadata, createSkillBaseCoreHandler, createSkillBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../_shared/baseToolAdapter.js";
import { executeSkillRipgrep as executeSkillRipgrepCore, type SkillRipgrepOutput, type SkillRipgrepRequest } from "./core.js";
import { skillRipgrepDependencyDeclarations, type SkillRipgrepProviderPractice } from "./dependencies.js";
import type { SkillBasePracticeProviderName } from "../_shared/baseToolAdapter.js";

export { planSkillRipgrep, skillRipgrepDescriptor, executeSkillRipgrep as executeSkillRipgrepCore } from "./core.js";
export type { SkillRipgrepErrorCode, SkillRipgrepOutput, SkillRipgrepRequest, SkillRipgrepResult, SkillRipgrepTarget } from "./core.js";

export type SkillRipgrepBestPracticeRequest = SkillRipgrepRequest & { executor?: BaseToolExecutorPort; preferredProvider?: SkillBasePracticeProviderName };
export type SkillRipgrepHandlerInput = Omit<SkillRipgrepBestPracticeRequest, "executor">;
const practices = [anthropicSkillRipgrepPractice, openaiSkillRipgrepPractice, deepmindSkillRipgrepPractice] as const;
function ordered(preferredProvider?: SkillBasePracticeProviderName): readonly SkillRipgrepProviderPractice[] {
  return preferredProvider === undefined ? practices : [...practices.filter((practice) => practice.providerName === preferredProvider), ...practices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectSkillRipgrepPractice(dependencies: SkillRipgrepBestPracticeRequest = {}) {
  for (const practice of ordered(dependencies.preferredProvider)) {
    const provider = practice.createProvider({ executor: dependencies.executor, provider: dependencies.provider });
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native" as const, practice: { providerName: "praxis-native" as const, source: { kind: "praxis-native" as const, label: "Praxis dry-run fallback", path: undefined }, directCliSupport: false, sideEffectPolicy: "read-only" as const, notes: ["No runtime ripgrep provider is available; dry-run remains available."], createProvider: () => undefined }, provider: undefined };
}
export async function executeSkillRipgrep(request: SkillRipgrepBestPracticeRequest = {}): ReturnType<typeof executeSkillRipgrepCore> {
  const selection = selectSkillRipgrepPractice(request);
  return executeSkillRipgrepCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }) } } });
}
export const skillRipgrepBaseToolDefinition = createSkillBaseToolDefinition<SkillRipgrepHandlerInput, SkillRipgrepOutput>({ toolId: "skill.ripgrep", title: "Skill Ripgrep", description: "Search local skill packages through governed runtime ripgrep support.", summary: "Use skill.ripgrep for precise search across SKILL.md, references, scripts, assets, and examples.", riskLevel: "normal", permissionHints: ["skill:read", "filesystem:read"], dependencies: skillRipgrepDependencyDeclarations, inputSchema: jsonSchema("skill.ripgrep.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("skill.ripgrep.output", { type: "object", additionalProperties: true }) });
export const skillRipgrepHandler: BaseToolHandler<SkillRipgrepHandlerInput, SkillRipgrepOutput> = createSkillBaseCoreHandler(skillRipgrepBaseToolDefinition, async (request) => {
  const selection = selectSkillRipgrepPractice({ ...request.input, executor: request.executor });
  return executeSkillRipgrepCore({ ...request.input, provider: selection.provider, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, sessionId: request.input.context?.sessionId ?? request.sessionId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }), request.input.context?.auditMetadata, request) } });
});
