import type { BaseToolExecutorPort } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSkillSummarizePractice } from "./anthropic.js";
import { deepmindSkillSummarizePractice } from "./deepmind.js";
import { openaiSkillSummarizePractice } from "./openai.js";
import { buildSkillBasePracticeAuditMetadata, createSkillBaseCoreHandler, createSkillBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../_shared/baseToolAdapter.js";
import { executeSkillSummarize as executeSkillSummarizeCore, type SkillSummarizeOutput, type SkillSummarizeRequest } from "./core.js";
import { skillSummarizeDependencyDeclarations, type SkillSummarizeProviderPractice } from "./dependencies.js";
import type { SkillBasePracticeProviderName } from "../_shared/baseToolAdapter.js";

export { planSkillSummarize, skillSummarizeDescriptor, executeSkillSummarize as executeSkillSummarizeCore } from "./core.js";
export type { SkillSummarizeErrorCode, SkillSummarizeOutput, SkillSummarizeRequest, SkillSummarizeResult, SkillSummarizeTarget, SkillSummarySource } from "./core.js";

export type SkillSummarizeBestPracticeRequest = SkillSummarizeRequest & { executor?: BaseToolExecutorPort; preferredProvider?: SkillBasePracticeProviderName };
export type SkillSummarizeHandlerInput = Omit<SkillSummarizeBestPracticeRequest, "executor">;
const practices = [anthropicSkillSummarizePractice, openaiSkillSummarizePractice, deepmindSkillSummarizePractice] as const;
function ordered(preferredProvider?: SkillBasePracticeProviderName): readonly SkillSummarizeProviderPractice[] {
  return preferredProvider === undefined ? practices : [...practices.filter((practice) => practice.providerName === preferredProvider), ...practices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectSkillSummarizePractice(dependencies: SkillSummarizeBestPracticeRequest = {}) {
  for (const practice of ordered(dependencies.preferredProvider)) {
    const provider = practice.createProvider({ executor: dependencies.executor, provider: dependencies.provider });
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native" as const, practice: { providerName: "praxis-native" as const, source: { kind: "praxis-native" as const, label: "Praxis dry-run fallback", path: undefined }, directCliSupport: false, sideEffectPolicy: "read-only" as const, notes: ["No runtime filesystem reader is available; extractive summaries from provided excerpts still work."], createProvider: () => undefined }, provider: undefined };
}
export async function executeSkillSummarize(request: SkillSummarizeBestPracticeRequest = {}): ReturnType<typeof executeSkillSummarizeCore> {
  const selection = selectSkillSummarizePractice(request);
  return executeSkillSummarizeCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }) } } });
}
export const skillSummarizeBaseToolDefinition = createSkillBaseToolDefinition<SkillSummarizeHandlerInput, SkillSummarizeOutput>({ toolId: "skill.summarize", title: "Skill Summarize", description: "Summarize local skill packages into model-visible metadata lines and concise bullets.", summary: "Use skill.summarize to produce budgeted skill metadata before activate/load.", riskLevel: "normal", permissionHints: ["skill:read"], dependencies: skillSummarizeDependencyDeclarations, inputSchema: jsonSchema("skill.summarize.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("skill.summarize.output", { type: "object", additionalProperties: true }) });
export const skillSummarizeHandler: BaseToolHandler<SkillSummarizeHandlerInput, SkillSummarizeOutput> = createSkillBaseCoreHandler(skillSummarizeBaseToolDefinition, async (request) => {
  const selection = selectSkillSummarizePractice({ ...request.input, executor: request.executor });
  return executeSkillSummarizeCore({ ...request.input, provider: selection.provider, context: { ...request.input.context, runtimeId: request.input.context?.runtimeId ?? request.runtimeId, sessionId: request.input.context?.sessionId ?? request.sessionId, invocationId: request.input.context?.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata(buildSkillBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }), request.input.context?.auditMetadata, request) } });
});
