import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildCodeBasePracticeAuditMetadata, createCodeBaseCoreHandler, createCodeBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicCodeBenchmarkPractice } from "./anthropic.js";
import { deepmindCodeBenchmarkPractice } from "./deepmind.js";
import { openaiCodeBenchmarkPractice } from "./openai.js";
import { codeBenchmarkDescriptor, executeCodeBenchmark as executeCodeBenchmarkCore, planCodeBenchmark, type CodeBenchmarkOutput, type CodeBenchmarkProvider, type CodeBenchmarkRequest, type CodeBenchmarkResult } from "./core.js";
import { codeBenchmarkDependencyDeclarations, type CodeBenchmarkDependencies, type CodeBenchmarkPracticeProviderName, type CodeBenchmarkProviderPractice } from "./dependencies.js";

export * from "./core.js";

export type CodeBenchmarkBestPracticeRequest = CodeBenchmarkRequest & { executor?: BaseToolExecutorPort; preferredProvider?: CodeBenchmarkPracticeProviderName };
export type CodeBenchmarkHandlerInput = Omit<CodeBenchmarkBestPracticeRequest, "executor">;
export type CodeBenchmarkPracticeSelection = { providerName: CodeBenchmarkPracticeProviderName; practice: CodeBenchmarkProviderPractice; provider?: CodeBenchmarkProvider };
export const codeBenchmarkProviderPractices = [anthropicCodeBenchmarkPractice, openaiCodeBenchmarkPractice, deepmindCodeBenchmarkPractice] as const;
export const codeBenchmarkBestPracticeDescriptor = { toolId: "code.benchmark", bestPractice: "storage-owned-code-benchmark-with-runtime-process-support", sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"], providerOrder: ["anthropic", "openai", "deepmind"], dependencies: codeBenchmarkDependencyDeclarations } as const;

function orderedPractices(preferredProvider: CodeBenchmarkPracticeProviderName | undefined): readonly CodeBenchmarkProviderPractice[] {
  if (preferredProvider === undefined) return codeBenchmarkProviderPractices;
  return [...codeBenchmarkProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeBenchmarkProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}
export function selectCodeBenchmarkPractice(dependencies: CodeBenchmarkDependencies & { preferredProvider?: CodeBenchmarkPracticeProviderName } = {}): CodeBenchmarkPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host process provider is available; dry-run remains available."], createProvider: () => undefined } };
}
function practiceAuditMetadata(selection: CodeBenchmarkPracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}
export async function executeCodeBenchmark(request: CodeBenchmarkBestPracticeRequest = {}): ReturnType<typeof executeCodeBenchmarkCore> {
  const selection = selectCodeBenchmarkPractice({ executor: request.executor, provider: request.provider, preferredProvider: request.preferredProvider });
  return executeCodeBenchmarkCore({ ...request, provider: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } });
}
const invocationContextSchema = { type: "object", additionalProperties: true, properties: { runtimeId: { type: "string" }, sessionId: { type: "string" }, invocationId: { type: "string" }, dryRun: { type: "boolean" }, guard: { type: "object", additionalProperties: true } } } as const;
export const codeBenchmarkBaseToolDefinition = createCodeBaseToolDefinition<CodeBenchmarkHandlerInput, CodeBenchmarkOutput>({
  toolId: "code.benchmark",
  title: "Code Benchmark",
  description: "Run a fixed benchmark target through governed runtime process support.",
  summary: "Use code.benchmark for bounded benchmark runs instead of free-form shell loops.",
  storageGroup: "testCode",
  riskLevel: "risky",
  permissionHints: ["workspace:read", "process:spawn"],
  dependencies: codeBenchmarkDependencyDeclarations,
  inputSchema: jsonSchema("code.benchmark.input", { type: "object", additionalProperties: true, required: ["workspaceRoot", "benchmarkTarget"], properties: { workspaceRoot: { type: "string" }, benchmarkTarget: { type: "string" }, command: { type: "array", items: { type: "string" } }, metric: { type: "string" }, iterations: { type: "integer", minimum: 1, maximum: 20 }, warmup: { type: "integer", minimum: 0, maximum: 20 }, timeoutMs: { type: "integer", minimum: 1, maximum: 600000 }, dryRun: { type: "boolean" }, context: invocationContextSchema } }),
  outputSchema: jsonSchema("code.benchmark.output", { type: "object", additionalProperties: true }),
});
export const codeBenchmarkHandler: BaseToolHandler<CodeBenchmarkHandlerInput, CodeBenchmarkOutput> = createCodeBaseCoreHandler(codeBenchmarkBaseToolDefinition, async (request) => {
  const selection = selectCodeBenchmarkPractice({ ...request.input, executor: request.executor, provider: request.input.provider });
  const inputContext = request.input.context ?? {};
  return executeCodeBenchmarkCore({ ...request.input, provider: selection.provider, context: { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) } });
});

export type { CodeBenchmarkResult };
export { codeBenchmarkDescriptor, planCodeBenchmark };
