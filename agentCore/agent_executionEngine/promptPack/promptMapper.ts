/*
 * 文件定位：Agent 执行引擎 / PromptPack 提示包层。
 * 核心目的：承载 prompt Mapper 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：维护 Praxis PromptPack 语义，不被某一家 provider 的 prompt 字段绑死。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  AssembledPromptMaterial,
  AssembledPromptToolDeclaration,
  AssembledPromptToolPack,
  AssembledPromptToolResult,
  AssembledPromptToolState,
  StandardPromptPack,
} from "./promptAssembler.js";
import type {
  PromptPackBoundary,
  PromptPackError,
  PromptPackErrorCode,
} from "./promptDefiner.js";

export type PromptMapperProvider = "openai" | "anthropic" | "gemini" | "custom";

export type PromptMapperRequest = {
  runtimeId?: string;
  sessionId?: string;
  promptPack?: StandardPromptPack;
  targetProvider?: PromptMapperProvider;
  targetModel?: string;
  openaiInstructionRole?: "developer" | "system";
};

export type PromptProviderPayload = {
  provider: PromptMapperProvider;
  model?: string;
  endpoint: "responses" | "messages" | "generateContent" | "custom";
  body: Readonly<Record<string, unknown>>;
};

export type MappedPromptBlocks = {
  system: string;
  user: string;
  tool: string;
};

export type MappedToolPayloads = {
  declarations: readonly AssembledPromptToolDeclaration[];
  results: readonly AssembledPromptToolResult[];
  callStates: readonly AssembledPromptToolState[];
};

export type MappedPromptPack = {
  kind: "praxis.promptPack.mapped";
  runtimeId: string;
  sessionId: string;
  targetProvider: PromptMapperProvider;
  targetModel?: string;
  sourcePromptPackId: string;
  blocks: MappedPromptBlocks;
  tools: MappedToolPayloads;
  providerPayload: PromptProviderPayload;
  providerPayloadCreated: true;
  unsafeSideEffects: false;
};

export type PromptMapperResult =
  | {
      ok: true;
      mappedPack: MappedPromptPack;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PromptPackError;
      events: readonly string[];
    };

export const promptMapperDescriptor = {
  capability: "prompt-mapper",
  route: "agent_executionEngine.promptPack",
  purpose: "map assembled Praxis PromptPack context into target provider payload shape",
  providerPayloadCreated: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(code: PromptPackErrorCode, message: string, boundary: PromptPackBoundary): PromptMapperResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["promptPack.mapping.rejected"],
  };
}

function renderMaterials(materials: readonly AssembledPromptMaterial[]): string {
  return materials
    .map((material) => [`<${material.kind} id="${material.id}">`, material.text, `</${material.kind}>`].join("\n"))
    .join("\n\n")
    .trim();
}

function groupPromptBlocks(materials: readonly AssembledPromptMaterial[], toolPack: AssembledPromptToolPack): MappedPromptBlocks {
  const systemMaterials = materials.filter((material) => material.kind === "system" || material.kind === "runtime");
  const structuredToolMaterialIds = new Set([
    ...toolPack.declarations.map((tool) => tool.materialId),
    ...toolPack.results.map((tool) => tool.materialId),
    ...toolPack.callStates.map((tool) => tool.materialId),
  ]);
  const toolPolicyMaterials = toolPack.policies;
  const userMaterials = materials.filter((material) =>
    !systemMaterials.includes(material) &&
    !toolPolicyMaterials.includes(material) &&
    !structuredToolMaterialIds.has(material.id)
  );

  return {
    system: renderMaterials(systemMaterials),
    user: renderMaterials(userMaterials),
    tool: renderMaterials(toolPolicyMaterials),
  };
}

function createOpenAiTools(tools: readonly AssembledPromptToolDeclaration[]): readonly Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

function createAnthropicTools(tools: readonly AssembledPromptToolDeclaration[]): readonly Record<string, unknown>[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function createGeminiTools(tools: readonly AssembledPromptToolDeclaration[]): readonly Record<string, unknown>[] {
  return tools.length === 0
    ? []
    : [{
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        })),
      }];
}

function createOpenAiToolResultItems(results: readonly AssembledPromptToolResult[]): readonly Record<string, unknown>[] {
  return results.map((result) => ({
    type: "function_call_output",
    call_id: result.callId ?? result.materialId,
    output: result.content,
  }));
}

function createOpenAiToolCallItems(callStates: readonly AssembledPromptToolState[]): readonly Record<string, unknown>[] {
  return callStates.map((state) => ({
    type: "function_call",
    call_id: state.callId ?? state.materialId,
    name: state.name ?? state.materialId,
    arguments: state.arguments ?? "{}",
  }));
}

function createAnthropicToolResultBlocks(results: readonly AssembledPromptToolResult[]): readonly Record<string, unknown>[] {
  return results.map((result) => ({
    type: "tool_result",
    tool_use_id: result.callId ?? result.materialId,
    content: result.content,
  }));
}

function createAnthropicToolUseBlocks(callStates: readonly AssembledPromptToolState[]): readonly Record<string, unknown>[] {
  return callStates.map((state) => ({
    type: "tool_use",
    id: state.callId ?? state.materialId,
    name: state.name ?? state.materialId,
    input: parseJsonObject(state.arguments),
  }));
}

function createGeminiFunctionResponseParts(results: readonly AssembledPromptToolResult[]): readonly Record<string, unknown>[] {
  return results.map((result) => ({
    functionResponse: {
      name: result.name ?? result.materialId,
      id: result.callId,
      response: { result: result.content },
    },
  }));
}

function createGeminiFunctionCallParts(callStates: readonly AssembledPromptToolState[]): readonly Record<string, unknown>[] {
  return callStates.map((state) => ({
    functionCall: {
      name: state.name ?? state.materialId,
      id: state.callId,
      args: parseJsonObject(state.arguments),
    },
  }));
}

function parseJsonObject(text: string | undefined): Record<string, unknown> {
  if (text === undefined || text.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed };
  } catch {
    return { raw: text };
  }
}

function createOpenAiPayload(input: {
  model?: string;
  blocks: MappedPromptBlocks;
  tools: MappedToolPayloads;
  instructionRole: "developer" | "system";
}): PromptProviderPayload {
  const inputMessages = [
    input.blocks.system
      ? { role: input.instructionRole, content: input.blocks.system }
      : undefined,
    input.blocks.tool
      ? { role: input.instructionRole, content: input.blocks.tool }
      : undefined,
    input.blocks.user
      ? { role: "user", content: input.blocks.user }
      : undefined,
    ...createOpenAiToolCallItems(input.tools.callStates),
    ...createOpenAiToolResultItems(input.tools.results),
  ].filter((message): message is { role: string; content: string } | Record<string, unknown> => message !== undefined);
  const tools = createOpenAiTools(input.tools.declarations);

  return {
    provider: "openai",
    model: input.model,
    endpoint: "responses",
    body: {
      ...(input.model ? { model: input.model } : {}),
      input: inputMessages,
      ...(tools.length > 0 ? { tools } : {}),
    },
  };
}

function createAnthropicPayload(input: { model?: string; blocks: MappedPromptBlocks; tools: MappedToolPayloads }): PromptProviderPayload {
  const system = [input.blocks.system, input.blocks.tool].filter(Boolean).join("\n\n");
  const toolUses = createAnthropicToolUseBlocks(input.tools.callStates);
  const toolResults = createAnthropicToolResultBlocks(input.tools.results);
  const messages: Array<{ role: "assistant" | "user"; content: unknown }> = [];
  if (toolUses.length > 0) {
    messages.push({ role: "assistant", content: toolUses });
  }
  const userContent = toolResults.length > 0
    ? [
        ...toolResults,
        ...(input.blocks.user ? [{ type: "text", text: input.blocks.user }] : []),
      ]
    : input.blocks.user || "Continue.";
  messages.push({ role: "user", content: userContent });
  const tools = createAnthropicTools(input.tools.declarations);
  return {
    provider: "anthropic",
    model: input.model,
    endpoint: "messages",
    body: {
      ...(input.model ? { model: input.model } : {}),
      ...(system ? { system } : {}),
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    },
  };
}

function createGeminiPayload(input: { model?: string; blocks: MappedPromptBlocks; tools: MappedToolPayloads }): PromptProviderPayload {
  const system = [input.blocks.system, input.blocks.tool].filter(Boolean).join("\n\n");
  const functionCallParts = createGeminiFunctionCallParts(input.tools.callStates);
  const functionResponseParts = createGeminiFunctionResponseParts(input.tools.results);
  const userParts = [
    ...(input.blocks.user ? [{ text: input.blocks.user }] : []),
    ...functionResponseParts,
  ];
  const tools = createGeminiTools(input.tools.declarations);
  const contents = [
    ...(functionCallParts.length > 0 ? [{ role: "model", parts: functionCallParts }] : []),
    { role: "user", parts: userParts.length > 0 ? userParts : [{ text: "Continue." }] },
  ];
  return {
    provider: "gemini",
    model: input.model,
    endpoint: "generateContent",
    body: {
      ...(input.model ? { model: input.model } : {}),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      ...(tools.length > 0 ? { config: { tools } } : {}),
    },
  };
}

function createCustomPayload(input: { model?: string; blocks: MappedPromptBlocks; tools: MappedToolPayloads }): PromptProviderPayload {
  return {
    provider: "custom",
    model: input.model,
    endpoint: "custom",
    body: {
      ...(input.model ? { model: input.model } : {}),
      prompt: input.blocks,
      tools: input.tools,
    },
  };
}

export function mapPromptMaterials(request?: PromptMapperRequest): PromptMapperResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before mapping PromptPack to provider payload", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before mapping PromptPack to provider payload", "input");
  }

  if (request.promptPack === undefined || request.promptPack.materials.length === 0) {
    return failure("EMPTY_MATERIALS", "PromptPack mapping requires an assembled promptPack", "material");
  }

  if (isBlank(request.targetProvider)) {
    return failure("MISSING_TARGET_PROVIDER", "PromptPack mapping requires a target provider", "input");
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";
  const targetProvider = request.targetProvider as PromptMapperProvider;
  const targetModel = request.targetModel?.trim() || request.promptPack.targetModel;
  const tools: MappedToolPayloads = {
    declarations: request.promptPack.toolPack.declarations,
    results: request.promptPack.toolPack.results,
    callStates: request.promptPack.toolPack.callStates,
  };
  const blocks = groupPromptBlocks(request.promptPack.materials, request.promptPack.toolPack);
  const providerPayload =
    targetProvider === "openai"
      ? createOpenAiPayload({
          model: targetModel,
          blocks,
          tools,
          instructionRole: request.openaiInstructionRole ?? "developer",
        })
      : targetProvider === "anthropic"
        ? createAnthropicPayload({ model: targetModel, blocks, tools })
        : targetProvider === "gemini"
          ? createGeminiPayload({ model: targetModel, blocks, tools })
          : createCustomPayload({ model: targetModel, blocks, tools });

  return {
    ok: true,
    mappedPack: {
      kind: "praxis.promptPack.mapped",
      runtimeId,
      sessionId,
      targetProvider,
      targetModel,
      sourcePromptPackId: `${request.promptPack.runtimeId}:${request.promptPack.sessionId}:assembled`,
      blocks,
      tools,
      providerPayload,
      providerPayloadCreated: true,
      unsafeSideEffects: false,
    },
    events: ["promptPack.mapping.accepted"],
  };
}
