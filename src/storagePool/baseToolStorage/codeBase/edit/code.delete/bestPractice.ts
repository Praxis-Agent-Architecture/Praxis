import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildCodeBasePracticeAuditMetadata, createCodeBaseCoreHandler, createCodeBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { CodeEditContext } from "../_shared/editCore.js";
import { anthropicCodeDeletePractice } from "./anthropic.js";
import { deepmindCodeDeletePractice } from "./deepmind.js";
import { codeDeleteDependencyDeclarations, type CodeDeleteDependencies, type CodeDeletePracticeProviderName, type CodeDeleteProviderPractice } from "./dependencies.js";
import { openaiCodeDeletePractice } from "./openai.js";
import {
  codeDeleteDescriptor,
  executeCodeDelete as executeCodeDeleteCore,
  planCodeDelete,
  type CodeDeleteOutput,
  type CodeDeleteProvider,
  type CodeDeleteRequest,
  type CodeDeleteResult,
} from "./core.js";

export * from "./core.js";

export type CodeDeleteBestPracticeRequest = CodeDeleteRequest & { executor?: BaseToolExecutorPort; preferredProvider?: CodeDeletePracticeProviderName };
export type CodeDeleteHandlerInput = Omit<CodeDeleteBestPracticeRequest, "executor">;
export type CodeDeletePracticeSelection = { providerName: CodeDeletePracticeProviderName; practice: CodeDeleteProviderPractice; provider?: CodeDeleteProvider };

export const codeDeleteProviderPractices = [anthropicCodeDeletePractice, openaiCodeDeletePractice, deepmindCodeDeletePractice] as const;
export const codeDeleteBestPracticeDescriptor = {
  toolId: "code.delete",
  bestPractice: "storage-owned-code-delete-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeDeleteDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeDeletePracticeProviderName | undefined): readonly CodeDeleteProviderPractice[] {
  if (preferredProvider === undefined) return codeDeleteProviderPractices;
  return [...codeDeleteProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeDeleteProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectCodeDeletePractice(dependencies: CodeDeleteDependencies & { preferredProvider?: CodeDeletePracticeProviderName } = {}): CodeDeletePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host filesystem delete provider is available; dry-run remains available."], createProvider: () => undefined },
  };
}

function practiceAuditMetadata(selection: CodeDeletePracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeCodeDelete(request: CodeDeleteBestPracticeRequest = {}): ReturnType<typeof executeCodeDeleteCore> {
  const selection = selectCodeDeletePractice({ executor: request.executor, provider: request.deleter ?? request.provider, preferredProvider: request.preferredProvider });
  return executeCodeDeleteCore({ ...request, deleter: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } });
}

const invocationContextSchema = { type: "object", additionalProperties: true, properties: { runtimeId: { type: "string" }, sessionId: { type: "string" }, invocationId: { type: "string" }, dryRun: { type: "boolean" }, workspaceRoot: { type: "string" }, guard: { type: "object", additionalProperties: true } } } as const;

export const codeDeleteBaseToolDefinition = createCodeBaseToolDefinition<CodeDeleteHandlerInput, CodeDeleteOutput>({
  toolId: "code.delete",
  title: "Code Delete",
  description: "Apply a governed file, directory, or line-range delete through runtime filesystem support.",
  summary: "Use code.delete for scoped deletes instead of rm, sed -i, or shell file rewrites.",
  storageGroup: "edit",
  riskLevel: "risky",
  permissionHints: ["filesystem:read", "filesystem:write", "filesystem:delete"],
  dependencies: codeDeleteDependencyDeclarations,
  inputSchema: jsonSchema("code.delete.input", { type: "object", additionalProperties: true, properties: { workspaceRoot: { type: "string" }, targetPath: { type: "string" }, deleteKind: { enum: ["file", "directory", "code-range"] }, range: { type: "object", additionalProperties: true }, reason: { type: "string" }, dryRun: { type: "boolean" }, context: invocationContextSchema } }),
  outputSchema: jsonSchema("code.delete.output", { type: "object", additionalProperties: true }),
});

export const codeDeleteHandler: BaseToolHandler<CodeDeleteHandlerInput, CodeDeleteOutput> = createCodeBaseCoreHandler(
  codeDeleteBaseToolDefinition,
  async (request) => {
    const selection = selectCodeDeletePractice({ ...request.input, executor: request.executor, provider: request.input.deleter ?? request.input.provider });
    const inputContext = request.input.context ?? {};
    const context: CodeEditContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeCodeDeleteCore({ ...request.input, deleter: selection.provider, context });
  },
);

export type { CodeDeleteResult };
export { codeDeleteDescriptor, planCodeDelete };
