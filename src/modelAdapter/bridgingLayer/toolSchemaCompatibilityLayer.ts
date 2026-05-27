/*
 * 文件定位：Agent 模型适配层 / provider tool schema 兼容桥。
 * 核心目的：把 Praxis 内部工具声明 lower 成 OpenAI/Claude/Gemini 可接受的工具 schema，
 * 并把 provider tool call raise 回 Praxis-native toolId。
 * 边界：只做 schema/transport 形状转换，不执行工具，不绕过 runtime governance。
 */

import { createHash } from "node:crypto";
import type { AgentManifest } from "../../runtimeImplementation/runtimeAgentManifest.js";

export type ProviderToolSchemaFamily =
  | "openaiResponses"
  | "openaiChatCompletions"
  | "anthropicMessages"
  | "geminiGenerateContent";
export type PraxisToolProviderKind = "baseTool" | "tap" | "mcp-static" | "dynamic";

export type ProviderToolNameMapping = {
  providerName: string;
  toolId: string;
};

export type PraxisToolDeclaration = {
  toolId: string;
  family?: string;
  group?: string;
  providerName: string;
  providerKind: PraxisToolProviderKind;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
};

export type ProviderToolDeclarationBundle = {
  providerFamily: ProviderToolSchemaFamily;
  tools: readonly Readonly<Record<string, unknown>>[];
  mappings: readonly ProviderToolNameMapping[];
  declarationHash: string;
  providerPayload: Readonly<Record<string, unknown>>;
  cacheHintPlan: ProviderCacheHintPlan;
  warnings: readonly string[];
};

export type ProviderToolCallEnvelope = {
  callId: string;
  providerName: string;
  toolId: string;
  arguments: Readonly<Record<string, unknown>>;
  providerFamily?: ProviderToolSchemaFamily;
  malformedArguments?: string;
  providerRawRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ProviderToolResultEnvelope = {
  callId: string;
  providerName: string;
  toolId: string;
  content: readonly ProviderToolResultContentBlock[];
  isError?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ProviderToolResultContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; uri: string; text?: string; blob?: string; mimeType?: string };

export type ProviderCacheHintPlan = {
  providerFamily: ProviderToolSchemaFamily;
  stableToolDeclarationHash: string;
  cacheablePrefixKinds: readonly ["tools", "system", "messages"];
  providerHints: Readonly<Record<string, unknown>>;
  cacheRiskWarnings: readonly string[];
};

export type LowerPraxisToolsForProviderRequest = {
  providerFamily: ProviderToolSchemaFamily;
  manifest?: AgentManifest;
  tools?: readonly AgentManifest["harness"]["tools"][number][];
  mappings?: readonly ProviderToolNameMapping[];
  includeRuntimeDecisionTools?: boolean;
  visibleToolIds?: readonly string[];
};

export type RaiseProviderToolCallsRequest = {
  providerFamily?: ProviderToolSchemaFamily;
  raw: unknown;
  mappings?: readonly ProviderToolNameMapping[];
  providerRawRef?: string;
};

export type LowerProviderToolResultRequest = {
  providerFamily: ProviderToolSchemaFamily;
  result: ProviderToolResultEnvelope;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function providerKindFor(tool: AgentManifest["harness"]["tools"][number]): PraxisToolProviderKind {
  const explicit = tool.metadata?.toolProviderKind;
  if (explicit === "tap" || explicit === "officialTap") return "tap";
  if (explicit === "mcp" || explicit === "mcp-static") return "mcp-static";
  if (explicit === "dynamic" || explicit === "external-dynamic") return "dynamic";
  if (tool.toolId.startsWith("mcp.")) return "mcp-static";
  if (tool.toolId.startsWith("tap.") || tool.family === "tap") return "tap";
  return "baseTool";
}

function providerKindSortWeight(kind: PraxisToolProviderKind): number {
  if (kind === "baseTool") return 0;
  if (kind === "tap") return 1;
  if (kind === "mcp-static") return 2;
  return 3;
}

const PROVIDER_TOOL_DESCRIPTION_MAX_CHARS = 320;

function compareProviderTools(
  left: AgentManifest["harness"]["tools"][number],
  right: AgentManifest["harness"]["tools"][number],
): number {
  const kindDelta = providerKindSortWeight(providerKindFor(left)) - providerKindSortWeight(providerKindFor(right));
  if (kindDelta !== 0) return kindDelta;
  return left.toolId < right.toolId ? -1 : left.toolId > right.toolId ? 1 : 0;
}

export function providerToolName(toolId: string): string {
  const normalized = toolId.replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/^_+/u, "");
  return `praxis_tool_${normalized || "tool"}`.slice(0, 64);
}

export function createProviderToolMappings(
  tools: readonly AgentManifest["harness"]["tools"][number][],
): readonly ProviderToolNameMapping[] {
  const usedProviderNames = new Set<string>();
  return tools.map((tool) => {
    const baseProviderName = providerToolName(tool.toolId);
    let providerName = baseProviderName;
    let suffix = 2;
    while (usedProviderNames.has(providerName)) {
      const suffixText = `_${suffix}`;
      providerName = `${baseProviderName.slice(0, 64 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }
    usedProviderNames.add(providerName);
    return { providerName, toolId: tool.toolId };
  });
}

function compactProviderToolDescription(tool: AgentManifest["harness"]["tools"][number]): string {
  const base = tool.description?.trim().replace(/\s+/gu, " ")
    ?? `Praxis BaseTool ${tool.toolId}. Use this mounted runtime tool only when its family/group/toolId matches the evidence or action needed.`;
  const prefix = [
    `toolId=${tool.toolId}`,
    tool.family === undefined ? "" : `family=${tool.family}`,
    tool.group === undefined ? "" : `group=${tool.group}`,
  ].filter(Boolean).join("; ");
  const text = `${prefix}; ${base}`;
  if (text.length <= PROVIDER_TOOL_DESCRIPTION_MAX_CHARS) return text;
  return `${text.slice(0, PROVIDER_TOOL_DESCRIPTION_MAX_CHARS - 3).trimEnd()}...`;
}

function sanitizeNestedSchema(schema: unknown): unknown {
  if (schema === true || schema === false) {
    return {};
  }
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeNestedSchema(item));
  }
  if (!isRecord(schema)) {
    return schema;
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (value === undefined) continue;
    output[key] = sanitizeNestedSchema(value);
  }
  if (output.const !== undefined && output.enum === undefined) {
    output.enum = [output.const];
    delete output.const;
  }
  if (output.type === "array" && output.items === undefined) {
    output.items = { type: "string" };
  }
  if (output.type === "object" && output.properties === undefined) {
    output.properties = {};
  }
  return output;
}

export function normalizeProviderInputSchema(inputSchema: unknown): Readonly<Record<string, unknown>> {
  if (inputSchema === true || inputSchema === undefined || inputSchema === null) {
    return { type: "object", properties: {} };
  }
  if (inputSchema === false) {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  if (!isRecord(inputSchema)) {
    return {
      type: "object",
      properties: { input: sanitizeNestedSchema(inputSchema) },
      required: ["input"],
      additionalProperties: false,
    };
  }

  const schema = sanitizeNestedSchema(inputSchema);
  if (!isRecord(schema)) {
    return { type: "object", properties: {} };
  }

  if (schema.type === "object" || schema.properties !== undefined || schema.additionalProperties !== undefined) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const propertyKeys = new Set(Object.keys(properties));
    const required = Array.isArray(schema.required)
      ? schema.required.map(String).filter((key) => propertyKeys.has(key))
      : undefined;
    return {
      ...schema,
      type: "object",
      properties,
      ...(required === undefined ? {} : { required }),
    };
  }

  return {
    type: "object",
    properties: { input: schema },
    required: ["input"],
    additionalProperties: false,
  };
}

export function createPraxisToolDeclarations(input: {
  tools: readonly AgentManifest["harness"]["tools"][number][];
  mappings?: readonly ProviderToolNameMapping[];
}): readonly PraxisToolDeclaration[] {
  const mappings = input.mappings ?? createProviderToolMappings(input.tools);
  return [...input.tools]
    .sort(compareProviderTools)
    .map((tool): PraxisToolDeclaration => {
      const mapping = mappings.find((item) => item.toolId === tool.toolId);
      return {
        toolId: tool.toolId,
        family: tool.family,
        group: tool.group,
        providerName: mapping?.providerName ?? providerToolName(tool.toolId),
        providerKind: providerKindFor(tool),
        description: compactProviderToolDescription(tool),
        inputSchema: normalizeProviderInputSchema(tool.inputSchema),
        metadata: tool.metadata ?? {},
      };
    });
}

function runtimeDecisionDeclarations(providerFamily: ProviderToolSchemaFamily): readonly PraxisToolDeclaration[] {
  const declarations: PraxisToolDeclaration[] = [
    {
      toolId: "praxis.runtime.ephemeralProcedure",
      providerName: "praxis_ephemeral_procedure",
      providerKind: "baseTool",
      description: "Plan a one-time governed orchestration of already mounted Praxis BaseTools. This does not create a new tool or TAP capability. Procedure steps must obey each BaseTool contract. Use patch.apply for precise source patches, or shell.run for governed commands and practical workspace writes when shell is clearer.",
      inputSchema: normalizeProviderInputSchema({
        type: "object",
        additionalProperties: true,
        required: ["procedureId", "purpose", "steps"],
        properties: {
          procedureId: { type: "string" },
          purpose: { type: "string" },
          executionMode: { type: "string", enum: ["serial", "parallel", "mixed"] },
          approval: {
            type: "object",
            additionalProperties: true,
            properties: { required: { type: "boolean" }, reason: { type: "string" } },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["stepId", "baseToolId", "input"],
              properties: {
                stepId: { type: "string" },
                baseToolId: {
                  type: "string",
                  description: "Mounted BaseTool id. Use file.read/file.search for workspace inspection, patch.apply for workspace edits, and shell.run only for commands, process control, and verification.",
                },
                input: {
                  type: "object",
                  additionalProperties: true,
                  description: "Input for the selected BaseTool, including workspaceRoot when the BaseTool schema requires a workspace scope. Keep workspace writes scoped and auditable; verify written files after execution.",
                },
                dependsOn: { type: "array", items: { type: "string" } },
                riskLevel: { type: "string", enum: ["low", "medium", "high"] },
                outputRef: { type: "string" },
              },
            },
          },
        },
      }),
      metadata: { runtimeDecisionTool: true },
    },
    {
      toolId: "praxis.runtime.requestApproval",
      providerName: "praxis_request_approval",
      providerKind: "baseTool",
      description: "Ask the Praxis runtime for approval before continuing a governed model/tool action.",
      inputSchema: normalizeProviderInputSchema({
        type: "object",
        additionalProperties: true,
        properties: {
          reason: { type: "string" },
          requestedScopes: { type: "array", items: { type: "string" } },
          riskLevel: { type: "string" },
        },
      }),
      metadata: { runtimeDecisionTool: true },
    },
  ];

  if (providerFamily === "openaiResponses") {
    declarations.push({
      toolId: "praxis.runtime.expandToolContext",
      providerName: "praxis_expand_tool_context",
      providerKind: "baseTool",
      description: "Ask Praxis to inject one concrete BaseTool manual into the next PromptPack turn. Use only when the compact summary/schema is not enough or repeated calls fail. This only changes context; it does not execute host actions.",
      inputSchema: normalizeProviderInputSchema({
        type: "object",
        additionalProperties: false,
        required: ["targetKind", "toolId"],
        properties: {
          targetKind: { type: "string", enum: ["tool"] },
          toolId: { type: "string" },
          reason: { type: "string" },
        },
      }),
      metadata: { runtimeDecisionTool: true },
    });
  }

  return declarations;
}

function openAiTool(declaration: PraxisToolDeclaration): Readonly<Record<string, unknown>> {
  return {
    type: "function",
    name: declaration.providerName,
    description: declaration.description,
    strict: false,
    parameters: declaration.inputSchema,
  };
}

function openAiChatCompletionsTool(declaration: PraxisToolDeclaration): Readonly<Record<string, unknown>> {
  return {
    type: "function",
    function: {
      name: declaration.providerName,
      description: declaration.description,
      parameters: declaration.inputSchema,
    },
  };
}

function anthropicTool(declaration: PraxisToolDeclaration, includeCacheControl: boolean): Readonly<Record<string, unknown>> {
  return {
    name: declaration.providerName,
    description: declaration.description,
    input_schema: declaration.inputSchema,
    ...(includeCacheControl ? { cache_control: { type: "ephemeral" } } : {}),
  };
}

function geminiFunctionDeclaration(declaration: PraxisToolDeclaration): Readonly<Record<string, unknown>> {
  return {
    name: declaration.providerName,
    description: declaration.description,
    parameters: declaration.inputSchema,
  };
}

function providerPayloadFor(providerFamily: ProviderToolSchemaFamily, tools: readonly Readonly<Record<string, unknown>>[]): Readonly<Record<string, unknown>> {
  if (providerFamily === "geminiGenerateContent") {
    return { config: { tools: [{ functionDeclarations: tools }] } };
  }
  return { tools };
}

function cachePlanFor(
  providerFamily: ProviderToolSchemaFamily,
  declarations: readonly PraxisToolDeclaration[],
  declarationHash: string,
  exposure?: {
    mountedConcreteToolCount: number;
    exposedConcreteToolCount: number;
    foldedConcreteToolCount: number;
  },
): ProviderCacheHintPlan {
  const dynamicCount = declarations.filter((declaration) => declaration.providerKind === "dynamic").length;
  const cacheRiskWarnings = dynamicCount === 0 ? [] : [`${dynamicCount} dynamic provider tools can reduce prompt cache hit rate`];
  const exposureHints = exposure === undefined ? {} : {
    mountedConcreteToolCount: exposure.mountedConcreteToolCount,
    exposedConcreteToolCount: exposure.exposedConcreteToolCount,
    foldedConcreteToolCount: exposure.foldedConcreteToolCount,
  };
  const providerHints =
    providerFamily === "anthropicMessages"
      ? { cacheControlTarget: "tools", prefixOrder: ["tools", "system", "messages"], ...exposureHints }
      : providerFamily === "geminiGenerateContent"
        ? { explicitCachedContentCandidate: true, prefixOrder: ["tools", "system", "messages"], ...exposureHints }
        : { readUsageTelemetry: "cached_input_tokens", prefixOrder: ["tools", "system", "messages"], ...exposureHints };
  return {
    providerFamily,
    stableToolDeclarationHash: declarationHash,
    cacheablePrefixKinds: ["tools", "system", "messages"],
    providerHints,
    cacheRiskWarnings,
  };
}

export function lowerPraxisToolsForProvider(request: LowerPraxisToolsForProviderRequest): ProviderToolDeclarationBundle {
  const allTools = request.tools ?? request.manifest?.harness.tools ?? [];
  const mappings = request.mappings ?? createProviderToolMappings([...allTools].sort(compareProviderTools));
  const visibleToolIds = request.visibleToolIds === undefined
    ? undefined
    : new Set(request.visibleToolIds.map((toolId) => toolId.trim()).filter(Boolean));
  const tools = visibleToolIds === undefined
    ? allTools
    : allTools.filter((tool) => visibleToolIds.has(tool.toolId));
  const declarations = [
    ...createPraxisToolDeclarations({ tools, mappings }),
    ...(request.includeRuntimeDecisionTools === false ? [] : runtimeDecisionDeclarations(request.providerFamily)),
  ];

  const providerTools = request.providerFamily === "openaiResponses"
    ? declarations.map(openAiTool)
    : request.providerFamily === "openaiChatCompletions"
      ? declarations.map(openAiChatCompletionsTool)
      : request.providerFamily === "anthropicMessages"
        ? declarations.map((declaration, index) => anthropicTool(declaration, index === declarations.length - 1))
        : declarations.map(geminiFunctionDeclaration);
  const declarationHash = hashStable({ providerFamily: request.providerFamily, providerTools });
  return {
    providerFamily: request.providerFamily,
    tools: providerTools,
    mappings,
    declarationHash,
    providerPayload: providerPayloadFor(request.providerFamily, providerTools),
    cacheHintPlan: cachePlanFor(request.providerFamily, declarations, declarationHash, {
      mountedConcreteToolCount: allTools.length,
      exposedConcreteToolCount: tools.length,
      foldedConcreteToolCount: Math.max(0, allTools.length - tools.length),
    }),
    warnings: declarations.some((declaration) => declaration.providerName.length > 64)
      ? ["one or more provider tool names were truncated to provider-safe length"]
      : [],
  };
}

function repairMisnestedEphemeralProcedureStepFields(value: string): string | undefined {
  if (!value.includes("\"procedureId\"") || !value.includes("\"steps\"")) return undefined;
  const repairableFields = new Set(["dependsOn", "outputRef", "riskLevel"]);
  const previousNonWhitespace = (startIndex: number): string | undefined => {
    for (let index = startIndex; index >= 0; index -= 1) {
      const char = value[index];
      if (char !== undefined && !/\s/u.test(char)) return char;
    }
    return undefined;
  };
  let output = "";
  let changed = false;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }
    if (char === "}") {
      const tail = value.slice(index + 1);
      const match = tail.match(/^\s*,\s*"([A-Za-z0-9_]+)"\s*:/u);
      const fieldName = match?.[1] ?? "";
      const isRiskLevelDrift = fieldName === "riskLevel" && previousNonWhitespace(index - 1) === "}";
      if (match !== null && repairableFields.has(fieldName) && (fieldName !== "riskLevel" || isRiskLevelDrift)) {
        changed = true;
        continue;
      }
    }
    output += char;
  }
  return changed ? output : undefined;
}

function parseArguments(
  value: unknown,
  providerName?: string,
): { ok: true; arguments: Readonly<Record<string, unknown>> } | { ok: false; message: string } {
  if (isRecord(value)) return { ok: true, arguments: value };
  if (typeof value !== "string" || value.trim().length === 0) return { ok: true, arguments: {} };
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed)
      ? { ok: true, arguments: parsed }
      : { ok: false, message: "provider tool arguments must decode to an object" };
  } catch {
    const repaired = providerName === "praxis_ephemeral_procedure"
      ? repairMisnestedEphemeralProcedureStepFields(value)
      : undefined;
    if (repaired !== undefined) {
      try {
        const parsed: unknown = JSON.parse(repaired);
        return isRecord(parsed)
          ? { ok: true, arguments: parsed }
          : { ok: false, message: "provider tool arguments must decode to an object" };
      } catch {
        return { ok: false, message: "provider tool arguments are not valid JSON" };
      }
    }
    return { ok: false, message: "provider tool arguments are not valid JSON" };
  }
}

function sseDataObjects(text: string): readonly unknown[] {
  const objects: unknown[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    try {
      objects.push(JSON.parse(payload) as unknown);
    } catch {
      // Ignore non-JSON stream payloads.
    }
  }
  return objects;
}

function toolIdFor(providerName: string, mappings: readonly ProviderToolNameMapping[] | undefined): string {
  return mappings?.find((mapping) => mapping.providerName === providerName)?.toolId ?? providerName;
}

function dedupeToolCalls(calls: readonly ProviderToolCallEnvelope[]): readonly ProviderToolCallEnvelope[] {
  const byId = new Map<string, ProviderToolCallEnvelope>();
  const order: string[] = [];
  for (const call of calls) {
    if (!byId.has(call.callId)) order.push(call.callId);
    byId.set(call.callId, call);
  }
  return order.map((callId) => byId.get(callId)).filter((call): call is ProviderToolCallEnvelope => call !== undefined);
}

function callEnvelope(input: {
  providerName: string;
  callId?: string;
  args?: unknown;
  index: number;
  providerFamily?: ProviderToolSchemaFamily;
  mappings?: readonly ProviderToolNameMapping[];
  providerRawRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): ProviderToolCallEnvelope {
  const parsed = parseArguments(input.args ?? {}, input.providerName);
  const callId = input.callId ?? `${input.providerName}:${input.index + 1}`;
  return {
    callId,
    providerName: input.providerName,
    toolId: toolIdFor(input.providerName, input.mappings),
    arguments: parsed.ok ? parsed.arguments : {},
    malformedArguments: parsed.ok ? undefined : parsed.message,
    providerFamily: input.providerFamily,
    providerRawRef: input.providerRawRef,
    metadata: input.metadata ?? {},
  };
}

function raiseFromOpenAi(raw: unknown, request: RaiseProviderToolCallsRequest): readonly ProviderToolCallEnvelope[] {
  if (typeof raw === "string") {
    return dedupeToolCalls(sseDataObjects(raw).flatMap((object) => {
      if (!isRecord(object)) return [];
      const eventType = readString(object.type);
      const fromResponse = object.response === undefined ? [] : raiseFromOpenAi(object.response, request);
      const fromItem = eventType === "response.output_item.done" && object.item !== undefined
        ? raiseFromOpenAi({ output: [object.item] }, request)
        : [];
      return [...fromResponse, ...fromItem];
    }));
  }
  if (!isRecord(raw)) return [];
  const candidates = [raw.tool_calls, raw.toolCalls, raw.output].filter(Array.isArray) as unknown[][];
  const calls: ProviderToolCallEnvelope[] = [];
  for (const list of candidates) {
    for (const item of list) {
      if (!isRecord(item)) continue;
      const functionRecord = isRecord(item.function) ? item.function : undefined;
      const type = readString(item.type);
      const name = readString(item.toolId) ?? readString(item.name) ?? readString(functionRecord?.name);
      if (name === undefined) continue;
      if (type !== undefined && !["function_call", "tool_call", "function"].includes(type) && item.toolId === undefined) continue;
      calls.push(callEnvelope({
        providerName: name,
        callId: readString(item.call_id) ?? readString(item.id),
        args: item.arguments ?? functionRecord?.arguments ?? item.input ?? {},
        index: calls.length,
        providerFamily: "openaiResponses",
        mappings: request.mappings,
        providerRawRef: request.providerRawRef,
        metadata: { providerShape: "openaiResponses" },
      }));
    }
  }
  return dedupeToolCalls(calls);
}

function chatCompletionToolCallLists(raw: unknown): readonly unknown[] {
  if (!isRecord(raw)) return [];
  const lists: unknown[] = [];
  if (Array.isArray(raw.tool_calls)) {
    lists.push(...raw.tool_calls);
  }
  if (Array.isArray(raw.toolCalls)) {
    lists.push(...raw.toolCalls);
  }
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const message = isRecord(choice.message) ? choice.message : undefined;
    const delta = isRecord(choice.delta) ? choice.delta : undefined;
    if (Array.isArray(message?.tool_calls)) lists.push(...message.tool_calls);
    if (Array.isArray(delta?.tool_calls)) lists.push(...delta.tool_calls);
  }
  return lists;
}

function raiseFromOpenAiChatCompletions(raw: unknown, request: RaiseProviderToolCallsRequest): readonly ProviderToolCallEnvelope[] {
  if (typeof raw === "string") {
    const fragments = new Map<string, {
      id?: string;
      name?: string;
      argumentsText: string;
      argsObject?: unknown;
      index: number;
    }>();
    let nextIndex = 0;
    for (const object of sseDataObjects(raw)) {
      for (const item of chatCompletionToolCallLists(object)) {
        if (!isRecord(item)) continue;
        const functionRecord = isRecord(item.function) ? item.function : undefined;
        const id = readString(item.id);
        const itemIndex = typeof item.index === "number" ? item.index : nextIndex;
        const key = `index:${itemIndex}`;
        const existing = fragments.get(key) ?? { id, argumentsText: "", index: itemIndex };
        existing.id = id ?? existing.id;
        existing.name = readString(functionRecord?.name) ?? readString(item.name) ?? existing.name;
        const args = functionRecord?.arguments ?? item.arguments ?? item.input;
        if (typeof args === "string") {
          existing.argumentsText += args;
        } else if (args !== undefined) {
          existing.argsObject = args;
        }
        fragments.set(key, existing);
        nextIndex += 1;
      }
    }
    return dedupeToolCalls([...fragments.values()]
      .filter((item) => item.name !== undefined)
      .map((item, index) => callEnvelope({
        providerName: item.name ?? "",
        callId: item.id,
        args: item.argsObject ?? item.argumentsText,
        index,
        providerFamily: "openaiChatCompletions",
        mappings: request.mappings,
        providerRawRef: request.providerRawRef,
        metadata: { providerShape: "openaiChatCompletions" },
      })));
  }

  const calls: ProviderToolCallEnvelope[] = [];
  for (const item of chatCompletionToolCallLists(raw)) {
    if (!isRecord(item)) continue;
    const functionRecord = isRecord(item.function) ? item.function : undefined;
    const name = readString(item.toolId) ?? readString(item.name) ?? readString(functionRecord?.name);
    if (name === undefined) continue;
    calls.push(callEnvelope({
      providerName: name,
      callId: readString(item.call_id) ?? readString(item.id),
      args: item.arguments ?? functionRecord?.arguments ?? item.input ?? {},
      index: calls.length,
      providerFamily: "openaiChatCompletions",
      mappings: request.mappings,
      providerRawRef: request.providerRawRef,
      metadata: { providerShape: "openaiChatCompletions" },
    }));
  }
  return dedupeToolCalls(calls);
}

function raiseFromAnthropic(raw: unknown, request: RaiseProviderToolCallsRequest): readonly ProviderToolCallEnvelope[] {
  if (typeof raw === "string") {
    const fragments = new Map<string, {
      id?: string;
      name?: string;
      argumentsText: string;
      argsObject?: unknown;
      index: number;
    }>();
    let nextIndex = 0;
    for (const object of sseDataObjects(raw)) {
      if (!isRecord(object)) continue;
      const eventType = readString(object.type);
      const itemIndex = typeof object.index === "number" ? object.index : nextIndex;
      const key = `index:${itemIndex}`;
      if (eventType === "content_block_start" && isRecord(object.content_block)) {
        const block = object.content_block;
        if (block.type !== "tool_use") continue;
        const existing = fragments.get(key) ?? { argumentsText: "", index: itemIndex };
        existing.id = readString(block.id) ?? existing.id;
        existing.name = readString(block.name) ?? existing.name;
        if (isRecord(block.input) && Object.keys(block.input).length > 0) {
          existing.argsObject = block.input;
        }
        fragments.set(key, existing);
        nextIndex += 1;
        continue;
      }
      if (eventType === "content_block_delta" && isRecord(object.delta)) {
        const delta = object.delta;
        if (delta.type !== "input_json_delta") continue;
        const partialJson = typeof delta.partial_json === "string" ? delta.partial_json : undefined;
        if (partialJson === undefined) continue;
        const existing = fragments.get(key) ?? { argumentsText: "", index: itemIndex };
        existing.argumentsText += partialJson;
        fragments.set(key, existing);
      }
    }
    return dedupeToolCalls([...fragments.values()]
      .filter((item) => item.name !== undefined)
      .map((item, index) => callEnvelope({
        providerName: item.name ?? "",
        callId: item.id,
        args: item.argsObject ?? item.argumentsText,
        index,
        providerFamily: "anthropicMessages",
        mappings: request.mappings,
        providerRawRef: request.providerRawRef,
        metadata: { providerShape: "anthropicMessages" },
      })));
  }

  if (!isRecord(raw)) return [];
  const messages = [raw, ...(Array.isArray(raw.messages) ? raw.messages : []), ...(Array.isArray(raw.output) ? raw.output : [])];
  const calls: ProviderToolCallEnvelope[] = [];
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (!isRecord(block) || block.type !== "tool_use") continue;
      const name = readString(block.name);
      if (name === undefined) continue;
      calls.push(callEnvelope({
        providerName: name,
        callId: readString(block.id),
        args: block.input ?? {},
        index: calls.length,
        providerFamily: "anthropicMessages",
        mappings: request.mappings,
        providerRawRef: request.providerRawRef,
        metadata: { providerShape: "anthropicMessages" },
      }));
    }
  }
  return dedupeToolCalls(calls);
}

function geminiParts(raw: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(raw)) return [];
  const parts: Record<string, unknown>[] = [];
  if (Array.isArray(raw.functionCalls)) {
    for (const call of raw.functionCalls) {
      if (isRecord(call)) parts.push({ functionCall: call });
    }
  }
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) continue;
    for (const part of candidate.content.parts) {
      if (isRecord(part)) parts.push(part);
    }
  }
  if (isRecord(raw.content) && Array.isArray(raw.content.parts)) {
    for (const part of raw.content.parts) {
      if (isRecord(part)) parts.push(part);
    }
  }
  return parts;
}

function raiseFromGemini(raw: unknown, request: RaiseProviderToolCallsRequest): readonly ProviderToolCallEnvelope[] {
  const calls: ProviderToolCallEnvelope[] = [];
  for (const part of geminiParts(raw)) {
    const functionCall = isRecord(part.functionCall) ? part.functionCall : undefined;
    if (functionCall === undefined) continue;
    const name = readString(functionCall.name);
    if (name === undefined) continue;
    calls.push(callEnvelope({
      providerName: name,
      callId: readString(functionCall.id),
      args: functionCall.args ?? {},
      index: calls.length,
      providerFamily: "geminiGenerateContent",
      mappings: request.mappings,
      providerRawRef: request.providerRawRef,
      metadata: {
        providerShape: "geminiGenerateContent",
        thoughtSignature: readString(part.thoughtSignature) ?? readString(part.thought_signature),
      },
    }));
  }
  return dedupeToolCalls(calls);
}

export function raiseProviderToolCalls(request: RaiseProviderToolCallsRequest): readonly ProviderToolCallEnvelope[] {
  if (request.providerFamily === "openaiChatCompletions") return raiseFromOpenAiChatCompletions(request.raw, request);
  if (request.providerFamily === "anthropicMessages") return raiseFromAnthropic(request.raw, request);
  if (request.providerFamily === "geminiGenerateContent") return raiseFromGemini(request.raw, request);
  if (request.providerFamily === "openaiResponses") return raiseFromOpenAi(request.raw, request);
  return dedupeToolCalls([
    ...raiseFromOpenAi(request.raw, request),
    ...raiseFromOpenAiChatCompletions(request.raw, request),
    ...raiseFromAnthropic(request.raw, request),
    ...raiseFromGemini(request.raw, request),
  ]);
}

function resultText(result: ProviderToolResultEnvelope): string {
  return result.content.map((block) => {
    if (block.type === "text") return block.text;
    if (block.type === "image") return `[image ${block.mimeType}]`;
    return `[resource ${block.uri}]${block.text === undefined ? "" : `\n${block.text}`}`;
  }).join("\n");
}

export function lowerProviderToolResult(request: LowerProviderToolResultRequest): Readonly<Record<string, unknown>> {
  const result = request.result;
  if (request.providerFamily === "openaiChatCompletions") {
    return {
      role: "tool",
      tool_call_id: result.callId,
      content: resultText(result),
    };
  }
  if (request.providerFamily === "anthropicMessages") {
    return {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: result.callId,
        content: result.content.map((block) => block.type === "text" ? { type: "text", text: block.text } : block),
        ...(result.isError === undefined ? {} : { is_error: result.isError }),
      }],
    };
  }
  if (request.providerFamily === "geminiGenerateContent") {
    return {
      role: "user",
      parts: [{
        functionResponse: {
          id: result.callId,
          name: result.providerName,
          response: { result: resultText(result), isError: result.isError === true },
        },
      }],
    };
  }
  return {
    type: "function_call_output",
    call_id: result.callId,
    output: resultText(result),
  };
}
