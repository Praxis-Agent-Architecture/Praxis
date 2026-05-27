/*
 * 文件定位：Praxis framework / applicationLayer 本地运行时。
 * 核心目的：把 application command 转成 agentCore manifest/runtime 调用，并输出统一事件和视图。
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  praxis,
  type AgentManifest,
  type AgentModelCallRecord,
  type AgentModelCallProgressEvent,
  type BaseToolExecutorPort,
  type BaseToolExecutorResult,
  type AgentToolCallProgressEvent,
  type AgentToolCallRecord,
  type AgentRunResult,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolution,
  type RuntimeApprovalResolver,
  type RuntimeAgentReviewResolver,
  type RuntimeAuthResolver,
  type RuntimeAuthResolverRequest,
  type BaseToolContextSelection,
  type BaseToolContextUsageRecord,
  type BaseToolProfileName,
  type PraxisProjectRuntime,
} from "../agentCore/index.js";
import {
  invokeOpenAIV1Responses,
  type OpenAIV1ResponsesProviderCaller,
  type OpenAIV1ResponsesResult,
} from "../modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { OpenAiV1ChatCompletionsProviderCaller } from "../modelAdapter/actualInvocationLayer/openai/v1_chat_completions.js";
import type { AnthropicV1MessagesProviderCaller } from "../modelAdapter/actualInvocationLayer/anthropic/v1_messages.js";
import type { DeepMindV1BetaModelsGenerateContentTransport } from "../modelAdapter/actualInvocationLayer/deepmind/v1beta_models_generateContent.js";
import { invokeChatGPTCodexResponses } from "../modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import type {
  AuthEnvelope,
  ProviderAuthMaterial,
} from "../modelAdapter/authProfileLayer/authEnvelope.js";
import {
  createInMemoryMultiagentRuntime,
  type MultiagentRuntime,
  type MultiagentSpawnResult,
} from "../runtimeImplementation/runtime.multiagentPlane/index.js";
import type {
  PromptContextConversationMessage,
  PromptContextSessionSummary,
} from "../runtimeImplementation/runtime.execEngine/promptContextAssembly.js";
import { resolveProviderModelMetadata } from "../modelAdapter/providerAccessLayer/modelMetadataRegistry.js";
import type {
  PraxisApplicationCommand,
  PraxisApplicationCommandResult,
  PraxisApplicationApprovalSummary,
  PraxisApplicationAttachment,
  PraxisApplicationAgentEntryView,
  PraxisApplicationEvent,
  PraxisApplicationInputEnvelope,
  PraxisApplicationManifestView,
  PraxisApplicationModelState,
  PraxisApplicationAuthState,
  PraxisApplicationPermissionProfile,
  PraxisApplicationReasoningEffort,
  PraxisApplicationRuntime,
  PraxisApplicationRuntimeMode,
  PraxisApplicationSessionSummary,
  PraxisApplicationStatus,
  PraxisApplicationToolCatalogState,
  PraxisApplicationToolProfile,
  PraxisApplicationContextTelemetry,
  PraxisApplicationUsageTelemetry,
  PraxisApplicationViewModel,
} from "./applicationContract.js";
import {
  loadApplicationProject,
  type PraxisApplicationProject,
} from "./applicationProject.js";

export type PraxisApplicationLiveProvider = {
  auth?: AuthEnvelope;
  runtimeAuthResolver?: RuntimeAuthResolver;
  authSelection?: RuntimeAuthResolverRequest;
  providerCaller?: OpenAIV1ResponsesProviderCaller;
  openaiResponsesCaller?: OpenAIV1ResponsesProviderCaller;
  openaiChatCompletionsCaller?: OpenAiV1ChatCompletionsProviderCaller;
  anthropicMessagesCaller?: AnthropicV1MessagesProviderCaller;
  geminiGenerateContentTransport?: DeepMindV1BetaModelsGenerateContentTransport;
  provider?: string;
  endpointShape?: string;
  baseURL?: string;
  providerRoute?: string;
};

export type PraxisApplicationBaseToolIntegrationOptions = {
  toolProfile?: PraxisApplicationToolProfile;
  policyMode?: PraxisApplicationPermissionProfile;
  approvalResolver?: RuntimeApprovalResolver;
  agentReviewResolver?: RuntimeAgentReviewResolver;
  contextArtifactAdapters?: Pick<Partial<BaseToolExecutorPort>, "context" | "artifact">;
  baseToolAdapters?: Partial<BaseToolExecutorPort>;
  onToolEvent?: (event: PraxisApplicationEvent) => void | Promise<void>;
};

export type PraxisApplicationRuntimeOptions = {
  project: PraxisApplicationProject;
  applicationId?: string;
  sessionId?: string;
  runtimeId?: string;
  cwd?: string;
  mode?: PraxisApplicationRuntimeMode;
  provider?: string;
  endpointShape?: string;
  baseURL?: string;
  providerRoute?: string;
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
  maxOutputTokens?: number;
  permissionProfile?: PraxisApplicationPermissionProfile;
  toolProfile?: PraxisApplicationToolProfile;
  agentOptions?: unknown;
  approvalResolver?: RuntimeApprovalResolver;
  agentReviewResolver?: RuntimeAgentReviewResolver;
  contextArtifactAdapters?: Pick<Partial<BaseToolExecutorPort>, "context" | "artifact">;
  baseToolAdapters?: Partial<BaseToolExecutorPort>;
  onApplicationToolEvent?: (event: PraxisApplicationEvent) => void | Promise<void>;
  foundationProject?: PraxisProjectRuntime;
  openFoundationProject?: boolean;
  liveProviderResolver?: (manifest: AgentManifest, context?: {
    sessionId: string;
    runtimeId: string;
    turnId?: string;
    onTextDelta?: (delta: string, metadata?: Readonly<Record<string, unknown>>) => void;
    onProviderStreamEvent?: (event: Readonly<Record<string, unknown>>) => void;
  }) => Promise<PraxisApplicationLiveProvider | undefined>;
  authStateProvider?: (context: {
    sessionId: string;
    runtimeId: string;
    manifest?: AgentManifest;
    model: PraxisApplicationModelState;
  }) => PraxisApplicationAuthState | Promise<PraxisApplicationAuthState | undefined> | undefined;
  now?: () => string;
};

export type CreateApplicationProjectRuntimeOptions = Omit<PraxisApplicationRuntimeOptions, "project">;

type RuntimeState = {
  status: PraxisApplicationStatus;
  sessionId: string;
  runtimeId: string;
  cwd: string;
  mode: PraxisApplicationRuntimeMode;
  model: PraxisApplicationModelState;
  permissionProfile: PraxisApplicationPermissionProfile;
  toolProfile: PraxisApplicationToolProfile;
  turns: number;
  modelCalls: number;
  toolCalls: number;
  mainLoopSteps: number;
  usage?: PraxisApplicationUsageTelemetry;
  finalOutput?: string;
  error?: {
    code: string;
    message: string;
  };
  manifest?: AgentManifest;
  events: PraxisApplicationEvent[];
  sessions: Map<string, PraxisApplicationSessionSummary>;
  approvals: Map<string, PraxisApplicationApprovalSummary>;
  pendingApprovalResolvers: Map<string, (resolution: RuntimeApprovalResolution) => void>;
  cancelledAuxiliaryTasks: Set<string>;
  conversationHistory: Map<string, ApplicationConversationMessage[]>;
  conversationSummaries: Map<string, ApplicationConversationSummary>;
  modelCacheDebugBySession: Map<string, ApplicationModelCacheDebug>;
  lastProviderResponseBySession: Map<string, ApplicationProviderResponsePointer>;
  toolContextSelections: Map<string, BaseToolContextSelection>;
  toolContextUsage: Map<string, BaseToolContextUsageRecord[]>;
  alwaysApprovedApprovalKeys: Set<string>;
  foundationProject?: PraxisProjectRuntime;
  multiagentRuntime: MultiagentRuntime;
  multiagentActiveSessions: number;
  multiagentBackgroundRuns: Set<string>;
  auth?: PraxisApplicationAuthState;
};

type ApplicationConversationMessage = {
  role: "user" | "assistant" | "model" | "tool" | "runtime-summary" | (string & {});
  text: string;
  turnId: string;
  createdAt: string;
  messageId?: string;
  causedBy?: string;
  artifactRefs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
  status?: "completed" | "failed";
};

type ApplicationConversationSummary = {
  text: string;
  compactedMessages: number;
  updatedAt: string;
  source: "application.history.autoCompact.v1";
};

type ApplicationInputAttachment = PraxisApplicationAttachment;
type ApplicationAuthSupplier = () => Promise<AuthEnvelope | undefined>;
export type OpenAIResponsesApplicationAdapterRoute = {
  kind: "openai_responses" | "chatgpt_codex_responses";
  providerCaller: OpenAIV1ResponsesProviderCaller;
  baseURL?: string;
};

const APPLICATION_SESSION_HISTORY_KEEP_RECENT_MESSAGES = 12;
const APPLICATION_SESSION_HISTORY_MAX_MESSAGE_CHARS = 20_000;
const APPLICATION_SESSION_SUMMARY_MAX_CHARS = 6_000;
const APPLICATION_SESSION_PRE_TURN_KEEP_RECENT_MESSAGES = 6;
const APPLICATION_SESSION_AUTO_COMPACT_THRESHOLD = 0.95;

function defaultNow(): string {
  return new Date().toISOString();
}

function event(input: Omit<PraxisApplicationEvent, "publicSafe">): PraxisApplicationEvent {
  return { ...input, publicSafe: true };
}

function cleanReasoning(value: PraxisApplicationReasoningEffort | undefined): PraxisApplicationReasoningEffort {
  return value ?? "low";
}

function createApplicationModelState(input: {
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
  provider?: string;
  endpointShape?: string;
  baseURL?: string;
  providerRoute?: string;
  maxOutputTokens?: number;
}): PraxisApplicationModelState {
  const provider = input.provider ?? "openai";
  const model = input.model ?? "gpt-5.5";
  const metadata = resolveProviderModelMetadata({ provider, model });
  return {
    model,
    reasoningEffort: cleanReasoning(input.reasoningEffort),
    provider,
    endpointShape: input.endpointShape,
    baseURL: input.baseURL,
    providerRoute: input.providerRoute,
    maxOutputTokens: input.maxOutputTokens,
    contextWindowTokens: metadata?.contextWindowTokens,
    maxInputTokens: metadata?.maxInputTokens,
    inputBudgetThreshold: metadata?.inputBudgetThreshold,
    usableInputTokens: metadata?.usableInputTokens,
    metadataSource: metadata?.source,
  };
}

function summarizeManifest(manifest: AgentManifest | undefined): PraxisApplicationManifestView | undefined {
  if (!manifest) return undefined;
  return {
    manifestId: manifest.manifestId,
    manifestHash: manifest.manifestHash,
    agentId: manifest.identity.id,
    promptPackId: manifest.promptPack.promptPackId,
    toolPolicyProfile: manifest.toolPolicy.profile,
    sandboxProfile: manifest.sandbox.profile,
    sessionPersistence: manifest.session.persistence,
    storageKind: manifest.storage.kind ?? "unknown",
  };
}

function summarizeToolCatalog(
  manifest: AgentManifest | undefined,
  toolProfile: BaseToolProfileName,
): PraxisApplicationToolCatalogState {
  const profile = praxis.baseTool.profiles().find((entry) => entry.name === toolProfile)
    ?? praxis.baseTool.profiles().find((entry) => entry.name === "agentCore")!;
  const entries = praxis.baseTool.basetool.all({ profileName: profile.name });
  const byFamily: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  for (const entry of entries) {
    byFamily[entry.storageFamily] = (byFamily[entry.storageFamily] ?? 0) + 1;
    byRiskLevel[entry.riskLevel] = (byRiskLevel[entry.riskLevel] ?? 0) + 1;
    byReadiness.semanticCatalog = (byReadiness.semanticCatalog ?? 0) + 1;
  }
  const mountedToolIds = manifest?.harness.tools.map((tool) => tool.toolId).sort() ?? [];
  return {
    profile: profile.name,
    availableProfiles: praxis.baseTool.profiles().map((entry) => entry.name),
    defaultPolicyProfile: profile.defaultPolicyProfile,
    extensionSlots: profile.extensionSlots ?? [],
    total: entries.length,
    mounted: mountedToolIds.length,
    byFamily,
    byRiskLevel,
    byReadiness,
    mountedToolIds,
  };
}

function summarizeAgentEntries(project: PraxisApplicationProject): readonly PraxisApplicationAgentEntryView[] {
  return Object.entries(project.agentEntries)
    .map(([key, entry]) => ({
      key,
      agentId: entry.agentId,
      role: key === "primary" ? "primary" as const : "sidecar" as const,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function safeSessionName(value: string): string {
  return value.trim().replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "session";
}

function extractFirstJsonObject(source: string): string {
  const fenceMatch = source.match(/```json\s*([\s\S]*?)```/iu) ?? source.match(/```\s*([\s\S]*?)```/iu);
  if (fenceMatch?.[1]) return extractFirstJsonObject(fenceMatch[1]);
  const trimmed = source.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = source.indexOf("{");
  if (start === -1) {
    throw new Error("auxiliary task output did not contain a JSON object");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
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
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error("auxiliary task output contained an unterminated JSON object");
}

function parseAuxiliaryTaskOutput(text: string, expectedSchemaVersion: string): unknown {
  const parsed = JSON.parse(extractFirstJsonObject(text)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("auxiliary task output must be a JSON object");
  }
  const schemaVersion = (parsed as Record<string, unknown>).schemaVersion;
  if (schemaVersion !== expectedSchemaVersion) {
    throw new Error(`auxiliary task schema mismatch: expected ${expectedSchemaVersion}, got ${String(schemaVersion)}`);
  }
  return parsed;
}

function previewUnknown(value: unknown, maxLength = 420): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const compacted = raw.replace(/\s+/gu, " ").trim();
  if (compacted.length === 0) return undefined;
  return compacted.length > maxLength ? `${compacted.slice(0, Math.max(0, maxLength - 3))}...` : compacted;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => stringValue(item) ?? [])
    : [];
}

function unknownArrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function truncateMiddle(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const headLength = Math.max(0, Math.floor((maxLength - 15) / 2));
  const tailLength = Math.max(0, maxLength - 15 - headLength);
  return `${normalized.slice(0, headLength)} ...[truncated]... ${normalized.slice(-tailLength)}`;
}

function flattenedToolArguments(argumentsRecord: Record<string, unknown>): Record<string, unknown> {
  const target = objectValue(argumentsRecord.target);
  return target === undefined ? argumentsRecord : { ...argumentsRecord, ...target };
}

function formatPathList(paths: readonly string[], maxItems = 4): string {
  const cleanPaths = paths.map((item) => item.trim()).filter((item) => item.length > 0);
  if (cleanPaths.length === 0) return "file";
  const shown = cleanPaths.slice(0, maxItems).join(", ");
  return cleanPaths.length > maxItems ? `${shown}, +${cleanPaths.length - maxItems} more` : shown;
}

function formatByteCount(bytes: number | undefined): string | undefined {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return undefined;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanRecord(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(input).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function nestedObjectValue(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    const record = objectValue(value);
    if (record !== undefined) return record;
  }
  return undefined;
}

function firstStringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized !== undefined) return normalized;
  }
  return undefined;
}

function countFromArrays(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (Array.isArray(value)) return value.length;
  }
  return undefined;
}

const CODE_MODIFY_DIFF_PREVIEW_MAX_BYTES = 3_000;
const CODE_MODIFY_DIFF_PREVIEW_MAX_LINES = 16;

function rawStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function codeModifyDiffPreviewLines(input: {
  targetPath?: string;
  replacements?: number;
  startLine?: number;
  searchText: string;
  replacementText: string;
}): string[] {
  const combinedBytes = Buffer.byteLength(input.searchText) + Buffer.byteLength(input.replacementText);
  if (combinedBytes > CODE_MODIFY_DIFF_PREVIEW_MAX_BYTES) {
    return [];
  }
  const formatDiffLine = (marker: "+" | "-", index: number, line: string): string => {
    const lineNumber = input.startLine === undefined ? "?" : String(input.startLine + index);
    return `${marker}${lineNumber.padStart(4, " ")} | ${line.length > 0 ? line : " "}`;
  };
  const removed = input.searchText.split(/\r?\n/u).map((line, index) => formatDiffLine("-", index, line));
  const added = input.replacementText.split(/\r?\n/u).map((line, index) => formatDiffLine("+", index, line));
  const replacements = input.replacements ?? 1;
  const lineSuffix = input.startLine === undefined ? "" : ` · line ${input.startLine}`;
  const header = `@@ ${input.targetPath ?? "file"}${lineSuffix} · ${replacements} replacement${replacements === 1 ? "" : "s"} @@`;
  const lines = [header, ...removed, ...added];
  if (lines.length <= CODE_MODIFY_DIFF_PREVIEW_MAX_LINES) {
    return lines;
  }
  return [
    ...lines.slice(0, CODE_MODIFY_DIFF_PREVIEW_MAX_LINES - 1),
    "... diff preview trimmed",
  ];
}

function patchApplyDiffPreviewLines(input: {
  patch: string;
}): string[] {
  const patchBytes = Buffer.byteLength(input.patch);
  if (patchBytes > CODE_MODIFY_DIFF_PREVIEW_MAX_BYTES) {
    return [];
  }

  const lines = input.patch.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");
  const preview: string[] = [];
  let currentPath = "patch";
  const pushHeader = (path: string): void => {
    currentPath = path.trim() || currentPath;
    const header = `@@ ${currentPath} @@`;
    if (preview[preview.length - 1] !== header) preview.push(header);
  };
  const pushDiff = (marker: "+" | "-", content: string): void => {
    preview.push(`${marker}${"?".padStart(4, " ")} | ${content.length > 0 ? content : " "}`);
  };

  for (const line of lines) {
    if (line === "*** End Patch") break;
    const pathMatch = line.match(/^\*\*\* (?:Add|Create|Create New|Update|Delete) File: (.+)$/u)
      ?? line.match(/^\*\*\* File: (.+)$/u);
    if (pathMatch !== null) {
      pushHeader(pathMatch[1] ?? currentPath);
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice("+++ ".length).replace(/^b\//u, "");
      if (path !== "/dev/null") pushHeader(path);
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = line.slice("--- ".length).replace(/^a\//u, "");
      if (path !== "/dev/null") pushHeader(path);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      pushDiff("+", line.slice(1));
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      pushDiff("-", line.slice(1));
    }
  }

  if (!preview.some((line) => line.startsWith("+") || line.startsWith("-"))) {
    return [];
  }
  if (preview.length <= CODE_MODIFY_DIFF_PREVIEW_MAX_LINES) {
    return preview;
  }
  return [
    ...preview.slice(0, CODE_MODIFY_DIFF_PREVIEW_MAX_LINES - 1),
    "... diff preview trimmed",
  ];
}

function textLineCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0) return 0;
  return value.split(/\r\n|\r|\n/u).length;
}

function rangeDeletedLineCount(value: unknown): number | undefined {
  const range = objectValue(value);
  const startLine = numberValue(range?.startLine) ?? numberValue(range?.start);
  const endLine = numberValue(range?.endLine) ?? numberValue(range?.end);
  if (startLine === undefined || endLine === undefined || endLine < startLine) {
    return undefined;
  }
  return Math.floor(endLine - startLine + 1);
}

function fileChangeLineStats(toolCall: AgentToolCallRecord): {
  codeAdditions?: number;
  codeDeletions?: number;
} | undefined {
  const args = flattenedToolArguments(toolCall.arguments);
  const output = objectValue(toolCall.output);
  switch (toolCall.toolId) {
    case "patch.apply": {
      const additions = numberValue(output?.additions)
        ?? numberValue(output?.addedLines)
        ?? numberValue(output?.linesAdded);
      const deletions = numberValue(output?.deletions)
        ?? numberValue(output?.deletedLines)
        ?? numberValue(output?.linesDeleted);
      return cleanRecord({
        codeAdditions: additions,
        codeDeletions: deletions,
      }) as { codeAdditions?: number; codeDeletions?: number } | undefined;
    }
    default:
      return undefined;
  }
}

function estimateContextTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4));
}

function summarizeCompactedMessages(messages: readonly ApplicationConversationMessage[]): string {
  return messages
    .map((message) => {
      const status = message.status ? `, ${message.status}` : "";
      const causedBy = message.causedBy ? `, causedBy=${message.causedBy}` : "";
      return `- ${message.role} (${message.turnId}${status}${causedBy}): ${truncateMiddle(message.text, 700)}`;
    })
    .join("\n");
}

function compactTextToBudget(text: string, maxLength: number): string {
  const normalized = text.replace(/\n{3,}/gu, "\n\n").trim();
  if (normalized.length <= maxLength) return normalized;
  return truncateMiddle(normalized, maxLength);
}

function compactConversationHistory(input: {
  messages: readonly ApplicationConversationMessage[];
  previousSummary?: ApplicationConversationSummary;
  now: string;
  force?: boolean;
  keepRecentMessages?: number;
}): { messages: ApplicationConversationMessage[]; summary?: ApplicationConversationSummary; compacted: boolean } {
  const normalizedMessages = input.messages.map((message) => ({
    ...message,
    text: truncateMiddle(message.text, APPLICATION_SESSION_HISTORY_MAX_MESSAGE_CHARS),
  }));
  if (!input.force) {
    return { messages: normalizedMessages, summary: input.previousSummary, compacted: false };
  }

  const keepCount = Math.min(input.keepRecentMessages ?? APPLICATION_SESSION_HISTORY_KEEP_RECENT_MESSAGES, normalizedMessages.length);
  const keptMessages = normalizedMessages.slice(-keepCount);
  const compactedMessages = normalizedMessages.slice(0, Math.max(0, normalizedMessages.length - keepCount));
  if (compactedMessages.length === 0) {
    return { messages: keptMessages, summary: input.previousSummary, compacted: false };
  }

  const summaryParts = [
    input.previousSummary?.text,
    "Auto-compacted earlier Raxode application conversation context.",
    summarizeCompactedMessages(compactedMessages),
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  const summaryText = compactTextToBudget(summaryParts.join("\n\n"), APPLICATION_SESSION_SUMMARY_MAX_CHARS);
  return {
    messages: keptMessages,
    summary: {
      text: summaryText,
      compactedMessages: (input.previousSummary?.compactedMessages ?? 0) + compactedMessages.length,
      updatedAt: input.now,
      source: "application.history.autoCompact.v1",
    },
    compacted: true,
  };
}

function modelAutoCompactTokenLimit(model: PraxisApplicationModelState): number | undefined {
  const baseLimit = model.usableInputTokens ?? model.maxInputTokens ?? model.contextWindowTokens;
  if (baseLimit === undefined || !Number.isFinite(baseLimit) || baseLimit <= 0) return undefined;
  return Math.max(1, Math.floor(baseLimit * APPLICATION_SESSION_AUTO_COMPACT_THRESHOLD));
}

function estimateTaskTextTokens(input: {
  currentUserText: string;
  history: readonly ApplicationConversationMessage[];
  summary?: ApplicationConversationSummary;
  attachments?: PraxisApplicationInputEnvelope["attachments"];
}): number {
  return estimateContextTokens(buildTaskTextWithSessionHistory(input));
}

function prepareHistoryForTurn(input: {
  currentUserText: string;
  history: readonly ApplicationConversationMessage[];
  summary?: ApplicationConversationSummary;
  attachments?: PraxisApplicationInputEnvelope["attachments"];
  model: PraxisApplicationModelState;
  previousUsage?: PraxisApplicationUsageTelemetry;
  now: string;
}): {
  history: ApplicationConversationMessage[];
  summary?: ApplicationConversationSummary;
  compacted: boolean;
  reason?: "estimated-context-limit" | "previous-provider-context-limit";
  beforeTokens: number;
  afterTokens: number;
  limit?: number;
} {
  const limit = modelAutoCompactTokenLimit(input.model);
  const beforeTokens = estimateTaskTextTokens({
    currentUserText: input.currentUserText,
    history: input.history,
    summary: input.summary,
    attachments: input.attachments,
  });
  const previousInputTokens = input.previousUsage?.lastInputTokens ?? input.previousUsage?.inputTokens;
  const overEstimatedContextLimit = limit !== undefined && beforeTokens >= limit;
  const overPreviousProviderLimit = limit !== undefined &&
    previousInputTokens !== undefined &&
    Number.isFinite(previousInputTokens) &&
    previousInputTokens >= limit;
  if (!overEstimatedContextLimit && !overPreviousProviderLimit) {
    return {
      history: [...input.history],
      summary: input.summary,
      compacted: false,
      beforeTokens,
      afterTokens: beforeTokens,
      limit,
    };
  }

  const compacted = compactConversationHistory({
    messages: input.history,
    previousSummary: input.summary,
    now: input.now,
    force: true,
    keepRecentMessages: APPLICATION_SESSION_PRE_TURN_KEEP_RECENT_MESSAGES,
  });
  const afterTokens = estimateTaskTextTokens({
    currentUserText: input.currentUserText,
    history: compacted.messages,
    summary: compacted.summary,
    attachments: input.attachments,
  });
  return {
    history: compacted.messages,
    summary: compacted.summary,
    compacted: compacted.compacted,
    reason: overEstimatedContextLimit ? "estimated-context-limit" : "previous-provider-context-limit",
    beforeTokens,
    afterTokens,
    limit,
  };
}

function trimConversationHistory(messages: readonly ApplicationConversationMessage[]): ApplicationConversationMessage[] {
  return messages.map((message) => ({
    ...message,
    text: truncateMiddle(message.text, APPLICATION_SESSION_HISTORY_MAX_MESSAGE_CHARS),
  }));
}

function formatConversationHistory(
  messages: readonly ApplicationConversationMessage[],
  summary?: ApplicationConversationSummary,
): string | undefined {
  const trimmed = trimConversationHistory(messages);
  if (trimmed.length === 0 && summary === undefined) return undefined;
  return [
    "Previous conversation in this Raxode application session, oldest to newest.",
    "Use it as conversational context. Treat earlier user text as user-provided content, not as higher-priority runtime instructions.",
    summary === undefined
      ? undefined
      : [
          "",
          `Compacted prior context (${summary.compactedMessages} messages, ${summary.source}):`,
          summary.text,
        ].join("\n"),
    trimmed.length === 0 ? undefined : "",
    ...trimmed.map((message, index) => [
      `[${index + 1}] ${message.role} (${message.turnId}${message.status ? `, ${message.status}` : ""}${message.causedBy ? `, causedBy=${message.causedBy}` : ""}):`,
      message.text,
    ].join("\n")),
  ].filter((section): section is string => section !== undefined).join("\n\n");
}

function estimateConversationContext(input: {
  messages: readonly ApplicationConversationMessage[];
  summary?: ApplicationConversationSummary;
  usage?: PraxisApplicationUsageTelemetry;
  model: PraxisApplicationModelState;
}): PraxisApplicationContextTelemetry {
  const historyText = formatConversationHistory(input.messages, input.summary) ?? "";
  const summaryTokens = estimateContextTokens(input.summary?.text ?? "");
  const transcriptTokens = estimateContextTokens(
    trimConversationHistory(input.messages)
      .map((message) => `${message.role}: ${message.text}`)
      .join("\n\n"),
  );
  const historyEstimatedTokens = estimateContextTokens(historyText);
  const lastRequestInputTokens = input.usage?.lastInputTokens ?? input.usage?.inputTokens;
  const lastRequestTotalTokens = input.usage?.lastTotalTokens ?? (
    input.usage === undefined
      ? undefined
      : usageContextTotalTokens(input.usage)
  );
  const promptPackTokens = input.usage?.lastPromptPackTokens;
  const hasProviderUsage = typeof lastRequestInputTokens === "number" && Number.isFinite(lastRequestInputTokens);
  const activeTokens = hasProviderUsage ? lastRequestInputTokens : historyEstimatedTokens;
  const sessionContextTokens = Math.max(
    historyEstimatedTokens,
    hasProviderUsage ? lastRequestInputTokens : 0,
    typeof promptPackTokens === "number" && Number.isFinite(promptPackTokens) ? promptPackTokens : 0,
  );
  return {
    activeTokens,
    promptTokens: activeTokens,
    sessionContextTokens,
    compressionLimitTokens: modelAutoCompactTokenLimit(input.model),
    transcriptTokens,
    summaryTokens,
    historyMessages: input.messages.length,
    lastRequestInputTokens: hasProviderUsage ? lastRequestInputTokens : undefined,
    lastRequestTotalTokens,
    promptPackTokens,
    historyEstimatedTokens,
    contextSource: hasProviderUsage ? "provider.model-call.usage" : "application.history.estimate",
    usageSource: input.usage?.source,
    estimated: !hasProviderUsage,
    compacted: input.summary !== undefined,
    source: hasProviderUsage ? "provider.model-call.usage" : "application.history.estimate",
  };
}

function formatAttachmentForPrompt(attachment: Readonly<{
  id: string;
  kind: string;
  tokenText?: string;
  displayName?: string;
  localPath?: string;
  remoteUrl?: string;
  text?: string;
  mimeType?: string;
}>): string {
  const fields = [
    `id=${attachment.id}`,
    `kind=${attachment.kind}`,
    attachment.tokenText ? `token=${attachment.tokenText}` : undefined,
    attachment.displayName ? `name=${attachment.displayName}` : undefined,
    attachment.mimeType ? `mime=${attachment.mimeType}` : undefined,
    attachment.localPath ? `localPath=${attachment.localPath}` : undefined,
    attachment.remoteUrl ? `remoteUrl=${attachment.remoteUrl}` : undefined,
    attachment.text ? `text=${truncateMiddle(attachment.text, 1200)}` : undefined,
  ].filter((field): field is string => field !== undefined);
  return `- ${fields.join(" | ")}`;
}

function formatApplicationInputAttachments(attachments: readonly ApplicationInputAttachment[] | undefined): string | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  const lines = [
    "Application input attachments for this user request.",
    "If an image attachment has localPath, inspect it through media.viewImage before answering image-specific questions.",
    "If a file attachment has localPath, use the appropriate file/search baseTool before claiming its contents.",
    "",
    ...attachments.map(formatAttachmentForPrompt),
  ];
  return lines.join("\n");
}

function buildTaskTextWithSessionHistory(input: {
  currentUserText: string;
  history: readonly ApplicationConversationMessage[];
  summary?: ApplicationConversationSummary;
  attachments?: PraxisApplicationInputEnvelope["attachments"];
}): string {
  const historyText = formatConversationHistory(input.history, input.summary);
  const attachmentText = formatApplicationInputAttachments(input.attachments);
  const sections = [
    historyText,
    attachmentText,
    "Current user request:",
    input.currentUserText,
  ].filter((section): section is string => section !== undefined && section.trim().length > 0);
  return sections.join("\n\n---\n\n");
}

function buildCurrentTaskText(input: {
  currentUserText: string;
  attachments?: PraxisApplicationInputEnvelope["attachments"];
}): string {
  const attachmentText = formatApplicationInputAttachments(input.attachments);
  return [
    attachmentText,
    "Current user request:",
    input.currentUserText,
  ].filter((section): section is string => section !== undefined && section.trim().length > 0).join("\n\n---\n\n");
}

function applicationMessageToPromptContextMessage(
  message: ApplicationConversationMessage,
  index: number,
): PromptContextConversationMessage {
  return {
    messageId: message.messageId ?? `${message.turnId}:${message.role}:${index + 1}`,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    artifactRefs: message.artifactRefs,
    metadata: {
      source: "application.conversationHistory",
      turnId: message.turnId,
      causedBy: message.causedBy,
      status: message.status ?? "completed",
      ...(message.metadata ?? {}),
    },
  };
}

function applicationHistoryToConversationWindow(
  messages: readonly ApplicationConversationMessage[],
): readonly PromptContextConversationMessage[] {
  return trimConversationHistory(messages).map(applicationMessageToPromptContextMessage);
}

function applicationSummaryToPromptContextSummary(
  sessionId: string,
  summary: ApplicationConversationSummary | undefined,
): PromptContextSessionSummary | undefined {
  if (summary === undefined) return undefined;
  return {
    summaryId: `${sessionId}:applicationHistorySummary`,
    text: summary.text,
    updatedAt: summary.updatedAt,
    metadata: {
      source: summary.source,
      compactedMessages: summary.compactedMessages,
    },
  };
}

function stringFromMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayFromMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): readonly string[] | undefined {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}

function artifactRefsFromToolMetadata(metadata: Readonly<Record<string, unknown>> | undefined): readonly string[] | undefined {
  const refs = new Set<string>(stringArrayFromMetadata(metadata, "artifactRefs") ?? []);
  const resultMetadata = objectValue(metadata?.resultMetadata);
  for (const key of [
    "artifactRef",
    "artifactId",
    "stdoutArtifactRef",
    "stderrArtifactRef",
    "registryArtifactRef",
    "diffArtifactRef",
    "imagePath",
  ]) {
    const value = stringValue(resultMetadata?.[key]);
    if (value !== undefined) refs.add(value);
  }
  const artifact = objectValue(resultMetadata?.artifact);
  const nestedArtifactId = stringValue(artifact?.artifactId) ?? stringValue(artifact?.id) ?? stringValue(artifact?.ref);
  if (nestedArtifactId !== undefined) refs.add(nestedArtifactId);
  return refs.size > 0 ? [...refs] : undefined;
}

function compactEventPreview(value: string | undefined, maxLength = 1_500): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  return truncateMiddle(value.trim(), maxLength);
}

function applicationLedgerMessagesFromEvents(input: {
  events: readonly PraxisApplicationEvent[];
  turnId: string;
}): ApplicationConversationMessage[] {
  const messages: ApplicationConversationMessage[] = [];
  for (const item of input.events) {
    if (item.turnId !== input.turnId) continue;
    if (item.kind === "model") {
      const phase = stringFromMetadata(item.metadata, "modelPhase");
      if (phase !== "completed" && phase !== "failed") continue;
      const invocationId = stringFromMetadata(item.metadata, "invocationId") ?? item.eventId;
      const usagePreview = item.metadata?.usage === undefined ? undefined : compactEventPreview(previewUnknown(item.metadata.usage, 800));
      messages.push({
        role: "model",
        text: [
          `Model call ${phase}: ${stringFromMetadata(item.metadata, "model") ?? stringFromMetadata(item.metadata, "carrierId") ?? "unknown model"}.`,
          usagePreview === undefined ? undefined : `usage: ${usagePreview}`,
          stringFromMetadata(item.metadata, "providerResponseId") === undefined ? undefined : `providerResponseId: ${stringFromMetadata(item.metadata, "providerResponseId")}`,
          stringFromMetadata(item.metadata, "previousProviderResponseId") === undefined ? undefined : `previousProviderResponseId: ${stringFromMetadata(item.metadata, "previousProviderResponseId")}`,
        ].filter((line): line is string => line !== undefined).join("\n"),
        turnId: input.turnId,
        createdAt: item.createdAt,
        messageId: item.eventId,
        causedBy: `${input.turnId}.submitted`,
        metadata: {
          source: "application.ledger.model",
          eventId: item.eventId,
          invocationId,
          phase,
        },
        status: phase === "failed" ? "failed" : "completed",
      });
      continue;
    }
    if (item.kind === "tool") {
      const toolStatus = stringFromMetadata(item.metadata, "toolStatus");
      if (toolStatus !== "completed" && toolStatus !== "failed") continue;
      const toolCallId = stringFromMetadata(item.metadata, "toolCallId") ?? item.eventId;
      const toolId = stringFromMetadata(item.metadata, "toolId") ?? item.message;
      const inputSummary = compactEventPreview(stringFromMetadata(item.metadata, "inputSummary"), 1_000);
      const argumentsPreview = compactEventPreview(stringFromMetadata(item.metadata, "argumentsPreview"), 2_000);
      const outputPreview = compactEventPreview(stringFromMetadata(item.metadata, "outputPreview"), 4_000);
      const errorPreview = compactEventPreview(stringFromMetadata(item.metadata, "errorPreview"), 2_000);
      const humanResultSummary = item.metadata?.humanResultSummary === undefined
        ? undefined
        : compactEventPreview(previewUnknown(item.metadata.humanResultSummary, 2_000));
      messages.push({
        role: "tool",
        text: [
          `Tool call ${toolStatus}: ${toolId}.`,
          inputSummary === undefined ? undefined : `intent: ${inputSummary}`,
          argumentsPreview === undefined ? undefined : `arguments: ${argumentsPreview}`,
          outputPreview === undefined ? undefined : `output: ${outputPreview}`,
          errorPreview === undefined ? undefined : `error: ${errorPreview}`,
          humanResultSummary === undefined ? undefined : `resultSummary: ${humanResultSummary}`,
        ].filter((line): line is string => line !== undefined).join("\n"),
        turnId: input.turnId,
        createdAt: item.createdAt,
        messageId: item.eventId,
        causedBy: `${input.turnId}.model`,
        artifactRefs: artifactRefsFromToolMetadata(item.metadata),
        metadata: {
          source: "application.ledger.tool",
          eventId: item.eventId,
          toolCallId,
          toolId,
          toolStatus,
          familyKey: stringFromMetadata(item.metadata, "familyKey"),
        },
        status: toolStatus === "failed" ? "failed" : "completed",
      });
      continue;
    }
    if (item.kind === "error") {
      messages.push({
        role: "runtime-summary",
        text: `Runtime error: ${item.message}`,
        turnId: input.turnId,
        createdAt: item.createdAt,
        messageId: item.eventId,
        causedBy: `${input.turnId}.runtime`,
        metadata: {
          source: "application.ledger.error",
          eventId: item.eventId,
        },
        status: "failed",
      });
    }
  }
  return messages;
}

function summarizeFileToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("file.") && !toolCall.toolId.startsWith("patch.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const targetPath = stringValue(args.targetPath) ?? stringValue(args.path) ?? stringValue(args.filePath);
  const targetPaths = [
    ...stringArrayValue(args.targetPaths),
    ...stringArrayValue(args.paths),
    ...stringArrayValue(args.files),
  ];
  const directoryPath = stringValue(args.directoryPath) ?? stringValue(args.workspaceRoot);
  const query = stringValue(args.query) ?? stringValue(args.pattern);
  const content = stringValue(args.content);
  const contentBytes = content === undefined ? undefined : Buffer.byteLength(content);
  const bytesSuffix = formatByteCount(contentBytes);
  const pathSummary = targetPaths.length > 0 ? formatPathList(targetPaths) : targetPath;

  switch (toolCall.toolId) {
    case "file.read":
      return `Reading ${pathSummary ?? "file"}`;
    case "file.search":
      return `Searching ${directoryPath ?? "."}${query ? ` for ${JSON.stringify(truncateMiddle(query, 80))}` : ""}`;
    case "file.write":
      return `Writing ${targetPath ?? "file"}${bytesSuffix ? ` (${bytesSuffix})` : ""}`;
    case "file.edit":
      return `Editing ${targetPath ?? "file"}`;
    case "patch.apply":
      return `Applying patch${pathSummary ? ` to ${pathSummary}` : ""}`;
    default:
      if (pathSummary) return `${toolCall.toolId} on ${pathSummary}`;
      if (directoryPath) return `${toolCall.toolId} in ${directoryPath}`;
      return undefined;
  }
}

function shellCommandFromArguments(toolCall: AgentToolCallRecord): {
  command?: string;
  cwd?: string;
  shell?: string;
} {
  const args = flattenedToolArguments(toolCall.arguments);
  const commandArray = stringArrayValue(args.command);
  const command = stringValue(args.command)
    ?? (commandArray.length > 0 ? commandArray.join(" ") : undefined)
    ?? stringValue(args.script);
  return {
    command,
    cwd: stringValue(args.workingDirectory) ?? stringValue(args.cwd),
    shell: stringValue(args.shell) ?? stringValue(args.shellType),
  };
}

function summarizeShellToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("shell.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const { command, cwd } = shellCommandFromArguments(toolCall);
  const executionId = stringValue(args.executionId) ?? stringValue(args.launchId);
  if (command) {
    const verb = toolCall.toolId === "shell.serviceStartAndVerify"
      ? "Starting and verifying"
      : toolCall.toolId === "shell.detachedExecution" || toolCall.toolId === "shell.backgroundExecution"
      ? "Launching"
      : "Running";
    return `${verb} ${truncateMiddle(command, 180)}${cwd ? ` in ${cwd}` : ""}`;
  }
  if (executionId) return `${toolCall.toolId} for ${executionId}`;
  return undefined;
}

function summarizeFileToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("file.") && !toolCall.toolId.startsWith("patch.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const targetPath = stringValue(output?.targetPath) ?? stringValue(args.targetPath) ?? stringValue(args.path);
  const targetPaths = [
    ...stringArrayValue(output?.targetPaths),
    ...stringArrayValue(args.targetPaths),
  ];
  const directoryPath = stringValue(output?.directoryPath) ?? stringValue(args.directoryPath);

  if (toolCall.toolId === "file.search") {
    const entries = Array.isArray(output?.entries) ? output.entries : [];
    const matches = Array.isArray(output?.matches) ? output.matches : [];
    const truncated = booleanValue(output?.truncated);
    return [
      `Searched ${directoryPath ?? "."}: ${Math.max(entries.length, matches.length)} result${Math.max(entries.length, matches.length) === 1 ? "" : "s"}${truncated ? " (truncated)" : ""}`,
    ];
  }

  if (toolCall.toolId === "file.read") {
    const bytes = numberValue(output?.bytes);
    const files = Array.isArray(output?.files) ? output.files : [];
    const count = files.length > 0 ? files.length : Math.max(targetPaths.length, targetPath ? 1 : 0);
    const targetSummary = targetPaths.length > 0 ? formatPathList(targetPaths) : targetPath ?? "file";
    return [
      `Read ${count > 1 ? `${count} files` : targetSummary}${formatByteCount(bytes) ? ` (${formatByteCount(bytes)})` : ""}`,
    ];
  }

  if (toolCall.toolId === "file.write") {
    const applied = booleanValue(output?.applied);
    const bytes = numberValue(output?.bytesWritten) ?? numberValue(output?.contentBytes);
    const verb = applied === false ? "Planned write" : "Wrote";
    return [
      `${verb} ${targetPath ?? "file"}${formatByteCount(bytes) ? ` (${formatByteCount(bytes)})` : ""}`,
    ];
  }

  if (toolCall.toolId === "file.edit" || toolCall.toolId === "patch.apply") {
    const bytes = numberValue(output?.bytesWritten);
    const lines = [
      `${toolCall.toolId} completed${targetPath ? ` for ${targetPath}` : ""}${formatByteCount(bytes) ? ` (${formatByteCount(bytes)})` : ""}`,
    ];
    if (toolCall.toolId === "file.edit") {
      const searchText = rawStringValue(args.searchText);
      const replacementText = rawStringValue(args.replacementText);
      if (searchText !== undefined && replacementText !== undefined) {
        lines.push(...codeModifyDiffPreviewLines({
          targetPath,
          replacements: numberValue(output?.replacements),
          startLine: numberValue(output?.firstMatchedLine),
          searchText,
          replacementText,
        }));
      }
    } else {
      const patch = rawStringValue(args.patch);
      if (patch !== undefined) {
        lines.push(...patchApplyDiffPreviewLines({ patch }));
      }
    }
    return lines;
  }

  return undefined;
}

function summarizeShellToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("shell.")) return undefined;
  const resultEnvelope = objectValue(output?.resultEnvelope);
  const target = objectValue(output?.target);
  const command = stringValue(output?.command)
    ?? stringValue(target?.command)
    ?? shellCommandFromArguments(toolCall).command;
  const exitCode = numberValue(output?.exitCode) ?? numberValue(resultEnvelope?.exitCode);
  const stdout = stringValue(output?.stdout) ?? stringValue(resultEnvelope?.stdout);
  const stderr = stringValue(output?.stderr) ?? stringValue(resultEnvelope?.stderr);
  const planned = booleanValue(resultEnvelope?.planned);
  const lifecycle = objectValue(resultEnvelope?.serviceLifecycle);
  const statusSnapshot = objectValue(resultEnvelope?.statusSnapshot) ?? objectValue(output?.statusSnapshot);
  const handle = stringValue(statusSnapshot?.handle)
    ?? stringValue(resultEnvelope?.detachedHandle)
    ?? stringValue(resultEnvelope?.backgroundHandle)
    ?? stringValue(resultEnvelope?.spawnHandle)
    ?? stringValue(resultEnvelope?.processHandle)
    ?? stringValue(resultEnvelope?.serviceHandle)
    ?? stringValue(lifecycle?.handle)
    ?? stringValue(target?.serviceId)
    ?? stringValue(target?.launchId)
    ?? stringValue(target?.jobId);
  const processState = stringValue(statusSnapshot?.processState) ?? stringValue(resultEnvelope?.serviceStatus);
  const verificationStatus = stringValue(statusSnapshot?.verificationState) ?? stringValue(lifecycle?.verificationStatus);
  const userReachability = stringValue(lifecycle?.userReachability);
  const health = objectValue(resultEnvelope?.health);
  const healthStatus = stringValue(health?.status);
  const healthy = booleanValue(resultEnvelope?.healthy) ?? booleanValue(health?.healthy);
  const failureReason = stringValue(resultEnvelope?.failureReason);
  const stderrArtifactRef = stringValue(resultEnvelope?.stderrArtifactRef);
  const snapshotVerified = booleanValue(statusSnapshot?.verified);
  const verified = healthy === true || snapshotVerified === true || verificationStatus === "verified" || verificationStatus === "healthy" || userReachability === "verified";
  const pid = numberValue(statusSnapshot?.pid) ?? numberValue(resultEnvelope?.pid) ?? numberValue(resultEnvelope?.processId) ?? numberValue(lifecycle?.processId);
  const verification = objectValue(target?.verification);
  const url = stringValue(statusSnapshot?.url) ?? stringValue(verification?.url);
  const lines: string[] = [];

  if (toolCall.toolId === "shell.serviceStartAndVerify") {
    const label = planned
      ? "Planned service start"
      : verified
        ? "Service verified"
        : failureReason !== undefined || healthStatus === "failed" || verificationStatus === "failed" || processState === "failed"
          ? "Service verification failed"
          : "Service verification pending";
    lines.push(`${label}${command ? `: ${truncateMiddle(command, 160)}` : ""}${handle ? ` (${handle})` : ""}${url ? ` ${url}` : ""}`);
    if (!planned && (pid !== undefined || verificationStatus !== undefined || processState !== undefined)) {
      lines.push(
        [
          pid !== undefined ? `pid ${pid}` : undefined,
          processState !== undefined ? `process ${processState}` : undefined,
          healthStatus !== undefined ? `health ${healthStatus}` : verificationStatus !== undefined ? `verification ${verificationStatus}` : undefined,
          failureReason !== undefined ? truncateMiddle(failureReason, 160) : undefined,
        ].filter((item): item is string => item !== undefined).join(", "),
      );
    }
    if (!planned && stderrArtifactRef) lines.push(`stderr artifact: ${truncateMiddle(stderrArtifactRef, 180)}`);
  } else if (
    toolCall.toolId === "shell.detachedExecution"
    || toolCall.toolId === "shell.backgroundExecution"
    || (toolCall.toolId === "shell.processSpawning" && stringValue(resultEnvelope?.status) === "started")
    || verificationStatus !== undefined
  ) {
    const launchLabel = verificationStatus !== undefined && verificationStatus !== "verified"
      ? "Launched, not verified"
      : planned ? "Planned launch" : "Launched";
    lines.push(`${launchLabel}${command ? `: ${truncateMiddle(command, 160)}` : ""}${handle ? ` (${handle})` : ""}`);
    if (!planned && (verificationStatus !== undefined || userReachability !== undefined || pid !== undefined)) {
      lines.push(
        [
          pid !== undefined ? `pid ${pid}` : undefined,
          verificationStatus !== undefined ? `verification ${verificationStatus}` : undefined,
          userReachability !== undefined ? `reachability ${userReachability}` : undefined,
        ].filter((item): item is string => item !== undefined).join(", "),
      );
    }
  } else if (exitCode !== undefined) {
    lines.push(`Command completed with exit ${exitCode}${command ? `: ${truncateMiddle(command, 120)}` : ""}`);
  } else {
    lines.push(`Command completed${command ? `: ${truncateMiddle(command, 160)}` : ""}`);
  }

  if (stdout) lines.push(`stdout: ${truncateMiddle(stdout, 220)}`);
  if (stderr) lines.push(`stderr: ${truncateMiddle(stderr, 220)}`);
  return lines.slice(0, 3);
}

function summarizeGitToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("git.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const target = objectValue(args.target);
  const repositoryPath = firstStringValue(target?.repositoryPath, args.repositoryPath, args.cwd, args.workingDirectory);
  const branch = firstStringValue(target?.branchName, target?.branch, args.branchName, args.branch);
  const ref = firstStringValue(target?.ref, target?.commit, target?.commitHash, args.ref, args.commit, args.commitHash);
  const pathSummary = formatPathList([
    ...stringArrayValue(target?.paths),
    ...stringArrayValue(args.paths),
    ...[firstStringValue(target?.path, args.path)].filter((item): item is string => item !== undefined),
  ]);
  const scope = repositoryPath ? ` in ${repositoryPath}` : "";
  switch (toolCall.toolId) {
    case "git.status":
      return `Checking repository status${scope}`;
    case "git.diff":
      return `Inspecting working tree diff${pathSummary !== "file" ? ` for ${pathSummary}` : scope}`;
    case "git.log":
      return `Reading commit history${branch ? ` on ${branch}` : scope}`;
    case "git.show":
      return `Inspecting git object ${ref ?? "ref"}${scope}`;
    case "git.blame":
      return `Tracing line ownership${pathSummary !== "file" ? ` for ${pathSummary}` : scope}`;
    case "git.add":
      return `Staging ${pathSummary}`;
    case "git.reset":
      return `Resetting git state${ref ? ` from ${ref}` : scope}`;
    case "git.restore":
      return `Restoring ${pathSummary}`;
    case "git.stash":
      return `Stashing working tree changes${scope}`;
    case "git.fetch":
      return `Fetching remote updates${scope}`;
    case "git.pull":
      return `Pulling remote changes${branch ? ` for ${branch}` : scope}`;
    case "git.push":
      return `Pushing local changes${branch ? ` for ${branch}` : scope}`;
    default:
      return repositoryPath ? `${toolCall.toolId} in ${repositoryPath}` : toolCall.toolId;
  }
}

function summarizeGitToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("git.")) return undefined;
  const envelope = objectValue(output?.resultEnvelope) ?? output;
  const target = objectValue(output?.target) ?? objectValue(toolCall.arguments.target);
  const branch = firstStringValue(envelope?.branch, envelope?.currentBranch, output?.branch, target?.branchName, target?.branch);
  const commitHash = firstStringValue(envelope?.commitHash, output?.commitHash, output?.newHead);
  const changedFileCount = countFromArrays(envelope?.entries, envelope?.changedFiles, output?.entries, output?.changedFiles, output?.committedFiles);
  const ahead = numberValue(envelope?.ahead) ?? numberValue(output?.aheadCount);
  const behind = numberValue(envelope?.behind) ?? numberValue(output?.behindCount);
  const exitCode = numberValue(output?.exitCode);
  const lines: string[] = [];
  if (toolCall.toolId === "git.status") {
    lines.push(`Repository status read${branch ? ` on ${branch}` : ""}`);
  } else if (toolCall.toolId === "git.diff") {
    lines.push("Working tree diff read");
  } else if (toolCall.toolId === "git.log") {
    lines.push("Commit history read");
  } else if (commitHash) {
    lines.push(`${toolCall.toolId} completed at ${commitHash.slice(0, 12)}`);
  } else {
    lines.push(`${toolCall.toolId} completed${exitCode !== undefined ? ` with exit ${exitCode}` : ""}`);
  }
  if (changedFileCount !== undefined) lines.push(`${changedFileCount} file${changedFileCount === 1 ? "" : "s"} changed`);
  if (ahead !== undefined || behind !== undefined) lines.push(`ahead ${ahead ?? 0}, behind ${behind ?? 0}`);
  return lines.slice(0, 3);
}

function summarizeWebToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("web.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const target = objectValue(args.target);
  const query = firstStringValue(target?.query, args.query, args.q);
  const url = firstStringValue(target?.url, args.url);
  if (toolCall.toolId === "web.fetch") return `Fetching ${url ?? query ?? "page"}`;
  return `Searching ${query ? truncateMiddle(query, 160) : "the web"}`;
}

function summarizeComputerToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("computer.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const target = objectValue(args.target);
  const targetHint = firstStringValue(target?.targetHint, args.targetHint, target?.windowTitle, args.windowTitle);
  const suffix = targetHint ? ` on ${targetHint}` : "";
  if (toolCall.toolId.includes("Screenshot")) return `Capturing screenshot${suffix}`;
  if (toolCall.toolId.includes("mouse")) return `Running mouse action${suffix}`;
  if (toolCall.toolId === "computer.keyboardInputEmulation") {
    const text = firstStringValue(target?.text, args.text);
    return text ? `Typing ${JSON.stringify(truncateMiddle(text, 80))}${suffix}` : `Typing text${suffix}`;
  }
  if (toolCall.toolId === "computer.keyboardSubmitInput") {
    const submitKey = firstStringValue(target?.submitKey, args.submitKey) ?? "Enter";
    return `Pressing ${submitKey}${suffix}`;
  }
  if (toolCall.toolId === "computer.keyboardEmulation") {
    const actions = unknownArrayValue(target?.actions ?? args.actions);
    const firstAction = objectValue(actions[0]);
    const actionKind = firstStringValue(firstAction?.kind);
    return `Sending ${actions.length || 1} keyboard action${actions.length === 1 ? "" : "s"}${actionKind ? ` (${actionKind})` : ""}${suffix}`;
  }
  if (toolCall.toolId.includes("camera")) return `Using camera${suffix}`;
  if (toolCall.toolId.includes("microphone")) return `Using microphone${suffix}`;
  return targetHint ? `${toolCall.toolId} on ${targetHint}` : toolCall.toolId;
}

function summarizeComputerToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("computer.")) return undefined;
  const target = objectValue(output?.target) ?? objectValue(toolCall.arguments.target);
  const artifactId = firstStringValue(output?.artifactId, output?.screenshotArtifactId, objectValue(output?.imageArtifact)?.artifactId, objectValue(output?.artifact)?.artifactId);
  const targetHint = firstStringValue(target?.targetHint, output?.targetHint);
  const actionCount = unknownArrayValue(output?.actions ?? target?.actions).length || numberValue(output?.actionCount);
  const lines: string[] = [];
  if (toolCall.toolId.includes("Screenshot")) {
    lines.push(`Screenshot captured${artifactId ? ` (${artifactId})` : ""}`);
  } else if (toolCall.toolId.includes("keyboard")) {
    lines.push(`Keyboard action completed${targetHint ? ` on ${targetHint}` : ""}`);
  } else if (toolCall.toolId.includes("mouse")) {
    lines.push(`Mouse action completed${targetHint ? ` on ${targetHint}` : ""}`);
  } else if (toolCall.toolId.includes("camera")) {
    lines.push(`Camera action completed${artifactId ? ` (${artifactId})` : ""}`);
  } else if (toolCall.toolId.includes("microphone")) {
    lines.push(`Microphone action completed${artifactId ? ` (${artifactId})` : ""}`);
  } else {
    lines.push(`${toolCall.toolId} completed`);
  }
  if (actionCount !== undefined && actionCount > 0) lines.push(`${actionCount} action${actionCount === 1 ? "" : "s"}`);
  return lines.slice(0, 3);
}

function summarizeMcpToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("mcp.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const target = nestedObjectValue(args.target, args.input, objectValue(args.input)?.target);
  const serverId = firstStringValue(target?.serverId, target?.connectionId, args.serverId, args.connectionId);
  const toolName = firstStringValue(target?.toolName, target?.name, args.toolName, args.name);
  const resourceUri = firstStringValue(target?.resourceUri, target?.uri, args.resourceUri, args.uri);
  if (toolCall.toolId === "mcp.use") return `Calling MCP tool ${toolName ?? "tool"}${serverId ? ` on ${serverId}` : ""}`;
  if (toolCall.toolId === "mcp.resources") {
    return resourceUri
      ? `Reading MCP resource ${resourceUri}${serverId ? ` from ${serverId}` : ""}`
      : `Listing MCP resources${serverId ? ` from ${serverId}` : ""}`;
  }
  return `${toolCall.toolId}${serverId ? ` on ${serverId}` : ""}`;
}

function summarizeMcpToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("mcp.")) return undefined;
  const envelope = objectValue(output?.resultEnvelope) ?? output;
  const args = flattenedToolArguments(toolCall.arguments);
  const tools = unknownArrayValue(envelope?.tools ?? output?.tools);
  const resources = unknownArrayValue(envelope?.resources ?? output?.resources);
  const content = unknownArrayValue(envelope?.content ?? output?.content ?? objectValue(output?.resourceEnvelope)?.contents);
  const target = objectValue(output?.target) ?? objectValue(args.target);
  const serverId = firstStringValue(target?.serverId, target?.connectionId, output?.serverId, output?.connectionId, args.serverId, args.connectionId);
  const toolName = firstStringValue(target?.toolName, target?.name, output?.toolName, args.toolName, args.name);
  const resourceUri = firstStringValue(target?.resourceUri, target?.uri, objectValue(output?.resourceEnvelope)?.uri, args.uri);
  const lines = [`${toolCall.toolId} completed${serverId ? ` on ${serverId}` : ""}`];
  if (tools.length > 0) lines.push(`${tools.length} tool${tools.length === 1 ? "" : "s"}`);
  if (resources.length > 0) lines.push(`${resources.length} resource${resources.length === 1 ? "" : "s"}`);
  if (content.length > 0) lines.push(`${content.length} content item${content.length === 1 ? "" : "s"}`);
  if (toolName && lines.length < 3) lines.push(`Tool: ${toolName}`);
  if (resourceUri && lines.length < 3) lines.push(`Resource: ${resourceUri}`);
  return lines.slice(0, 3);
}

function summarizeSkillToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("skill.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const target = objectValue(args.target);
  const skillName = firstStringValue(target?.skillName, target?.name, args.skillName, args.name, args.query);
  switch (toolCall.toolId) {
    case "skill.generate":
      return `Generating skill${skillName ? ` ${skillName}` : ""}`;
    case "skill.iterate":
      return `Iterating skill${skillName ? ` ${skillName}` : ""}`;
    case "skill.management":
      return `Managing skills${skillName ? ` for ${skillName}` : ""}`;
    case "skill.remove":
      return `Removing skill${skillName ? ` ${skillName}` : ""}`;
    case "skill.ripgrep":
      return `Searching skills${skillName ? ` for ${skillName}` : ""}`;
    case "skill.summarize":
      return `Summarizing skill${skillName ? ` ${skillName}` : ""}`;
    default:
      return skillName ? `${toolCall.toolId} for ${skillName}` : toolCall.toolId;
  }
}

function summarizeSkillToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("skill.")) return undefined;
  const skillName = firstStringValue(output?.skillName, output?.name, objectValue(output?.container)?.name, objectValue(toolCall.arguments.target)?.skillName, toolCall.arguments.skillName);
  const documents = unknownArrayValue(output?.documents);
  const resources = unknownArrayValue(objectValue(output?.preparedInvocation)?.resources);
  const mounts = unknownArrayValue(objectValue(output?.activation)?.mounts);
  const matches = unknownArrayValue(output?.matches);
  const lines = [`${toolCall.toolId} completed${skillName ? ` for ${skillName}` : ""}`];
  if (documents.length > 0) lines.push(`${documents.length} document${documents.length === 1 ? "" : "s"}`);
  if (resources.length > 0) lines.push(`${resources.length} resource${resources.length === 1 ? "" : "s"}`);
  if (mounts.length > 0) lines.push(`${mounts.length} mount${mounts.length === 1 ? "" : "s"}`);
  if (matches.length > 0 && lines.length < 3) lines.push(`${matches.length} match${matches.length === 1 ? "" : "es"}`);
  return lines.slice(0, 3);
}

function summarizeMediaToolInput(toolCall: AgentToolCallRecord): string | undefined {
  if (!toolCall.toolId.startsWith("media.")) return undefined;
  const args = flattenedToolArguments(toolCall.arguments);
  const target = objectValue(args.target);
  const imagePath = firstStringValue(target?.imagePath, args.imagePath, target?.imageRef, args.imageRef);
  const prompt = firstStringValue(target?.prompt, args.prompt, args.text);
  if (toolCall.toolId === "media.viewImage") return `Viewing image ${imagePath ?? "input"}`;
  if (toolCall.toolId === "media.generateImage") return `Generating image${prompt ? ` from ${JSON.stringify(truncateMiddle(prompt, 120))}` : ""}`;
  if (toolCall.toolId.includes("Audio")) return `${toolCall.toolId} audio`;
  if (toolCall.toolId.includes("Video")) return `${toolCall.toolId} video`;
  return imagePath ? `${toolCall.toolId} for ${imagePath}` : toolCall.toolId;
}

function summarizeMediaToolOutputForHumans(toolCall: AgentToolCallRecord, output: Record<string, unknown> | undefined): string[] | undefined {
  if (!toolCall.toolId.startsWith("media.")) return undefined;
  if (toolCall.toolId === "media.viewImage") {
    const providerMetadata = objectValue(output?.providerMetadata);
    const analysis = stringValue(providerMetadata?.analysis);
    const backend = stringValue(providerMetadata?.backend);
    return [
      analysis ? `视觉分析：${truncateMiddle(analysis, 360)}` : "图片已传入视觉模型",
      backend ? `后端：${backend}` : undefined,
    ].filter((line): line is string => line !== undefined).slice(0, 3);
  }
  const artifactId = firstStringValue(output?.artifactId, objectValue(output?.artifact)?.artifactId, output?.outputArtifactId);
  const outputPath = firstStringValue(output?.outputPath, output?.imagePath, objectValue(output?.artifact)?.path, output?.path);
  const mimeType = firstStringValue(output?.mimeType, objectValue(output?.artifact)?.mimeType);
  const lines = [`${toolCall.toolId} completed${artifactId ? ` (${artifactId})` : ""}`];
  if (outputPath) lines.push(`Output: ${outputPath}`);
  if (mimeType) lines.push(`Type: ${mimeType}`);
  return lines.slice(0, 3);
}

function summarizeToolInput(toolCall: AgentToolCallRecord): string | undefined {
  const fileSummary = summarizeFileToolInput(toolCall);
  if (fileSummary !== undefined) return fileSummary;
  const shellSummary = summarizeShellToolInput(toolCall);
  if (shellSummary !== undefined) return shellSummary;
  const gitSummary = summarizeGitToolInput(toolCall);
  if (gitSummary !== undefined) return gitSummary;
  const webSummary = summarizeWebToolInput(toolCall);
  if (webSummary !== undefined) return webSummary;
  const computerSummary = summarizeComputerToolInput(toolCall);
  if (computerSummary !== undefined) return computerSummary;
  const mcpSummary = summarizeMcpToolInput(toolCall);
  if (mcpSummary !== undefined) return mcpSummary;
  const skillSummary = summarizeSkillToolInput(toolCall);
  if (skillSummary !== undefined) return skillSummary;
  const mediaSummary = summarizeMediaToolInput(toolCall);
  if (mediaSummary !== undefined) return mediaSummary;
  const target = toolCall.arguments.target;
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const targetRecord = target as Record<string, unknown>;
    const url = typeof targetRecord.url === "string" ? targetRecord.url : undefined;
    const query = typeof targetRecord.query === "string" ? targetRecord.query : undefined;
    if (url) return url;
    if (query) return query;
  }
  const command = typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : undefined;
  const query = typeof toolCall.arguments.query === "string" ? toolCall.arguments.query : undefined;
  const url = typeof toolCall.arguments.url === "string" ? toolCall.arguments.url : undefined;
  return command ?? query ?? url ?? previewUnknown(toolCall.arguments, 180);
}

function familyForToolId(toolId: string): { familyKey: string; familyTitle: string } {
  if (toolId === "patch.apply") {
    return { familyKey: "code", familyTitle: "Code" };
  }
  const [prefix] = toolId.split(".");
  switch (prefix) {
    case "web":
      return { familyKey: "websearch", familyTitle: "WebSearch" };
    case "file":
    case "patch":
      return { familyKey: "file", familyTitle: "File" };
    case "shell":
      return { familyKey: "shell", familyTitle: "Shell" };
    case "git":
      return { familyKey: "git", familyTitle: "Git" };
    case "computer":
      return { familyKey: "computer", familyTitle: "Computer" };
    case "mcp":
      return { familyKey: "mcp", familyTitle: "MCP" };
    case "skill":
      return { familyKey: "skill", familyTitle: "Skill" };
    case "media":
      return { familyKey: "media", familyTitle: "Media" };
    default:
      return { familyKey: prefix || "capability", familyTitle: prefix ? `${prefix.slice(0, 1).toUpperCase()}${prefix.slice(1)}` : "Capability" };
  }
}

function summarizeToolOutputForHumans(toolCall: AgentToolCallRecord): string[] {
  if (!toolCall.ok) {
    const errorRecord = objectValue(toolCall.error);
    const message = stringValue(errorRecord?.message) ?? stringValue(toolCall.error);
    const code = stringValue(errorRecord?.code);
    return [
      message ? `失败：${toolCall.toolId}: ${message}` : `失败：${toolCall.toolId} did not complete.`,
      ...(code ? [`原因码：${code}`] : []),
    ].slice(0, 3);
  }

  const output = objectValue(toolCall.output);
  const fileSummary = summarizeFileToolOutputForHumans(toolCall, output);
  if (fileSummary !== undefined) return fileSummary;
  const shellSummary = summarizeShellToolOutputForHumans(toolCall, output);
  if (shellSummary !== undefined) return shellSummary;
  const gitSummary = summarizeGitToolOutputForHumans(toolCall, output);
  if (gitSummary !== undefined) return gitSummary;
  const computerSummary = summarizeComputerToolOutputForHumans(toolCall, output);
  if (computerSummary !== undefined) return computerSummary;
  const mcpSummary = summarizeMcpToolOutputForHumans(toolCall, output);
  if (mcpSummary !== undefined) return mcpSummary;
  const skillSummary = summarizeSkillToolOutputForHumans(toolCall, output);
  if (skillSummary !== undefined) return skillSummary;
  const mediaSummary = summarizeMediaToolOutputForHumans(toolCall, output);
  if (mediaSummary !== undefined) return mediaSummary;
  const envelope = objectValue(output?.resultEnvelope);
  const query = stringValue(envelope?.query);
  const answer = stringValue(envelope?.answer);
  const results = Array.isArray(envelope?.results) ? envelope.results : [];
  const sources = Array.isArray(envelope?.sources) ? envelope.sources : [];
  const citations = Array.isArray(envelope?.citations) ? envelope.citations : [];
  const pageTitle = stringValue(output?.pageTitle);
  const finalUrl = stringValue(output?.finalUrl);
  const status = numberValue(output?.status);

  if (toolCall.toolId === "web.search") {
    const firstTitles = results
      .map((item) => objectValue(item))
      .flatMap((item) => stringValue(item?.title) ?? [])
      .slice(0, 2);
    const sourceTitles = [...sources, ...citations]
      .map((item) => objectValue(item))
      .flatMap((item) => stringValue(item?.title) ?? [])
      .slice(0, 2);
    const hasRealSources = sources.length + citations.length > 0;
    return [
      query ? `搜索：${query}` : undefined,
      results.length > 0 ? `结果：找到 ${results.length} 条网页结果` : undefined,
      answer && hasRealSources ? `摘要：${answer}` : undefined,
      hasRealSources ? `来源：${sources.length + citations.length} 条` : results.length === 0 ? "未返回可引用来源" : undefined,
      ...firstTitles.map((title) => `结果：${title}`),
      ...sourceTitles.map((title) => `来源：${title}`),
    ].filter((line): line is string => line !== undefined).slice(0, 4);
  }

  if (toolCall.toolId === "web.fetch") {
    return [
      finalUrl ? `页面：${finalUrl}` : undefined,
      pageTitle ? `标题：${pageTitle}` : undefined,
      status !== undefined ? `HTTP：${status}` : undefined,
    ].filter((line): line is string => line !== undefined).slice(0, 3);
  }

  const directSummary = stringValue(output?.summary)
    ?? stringValue(output?.answer)
    ?? stringValue(output?.text)
    ?? stringValue(toolCall.output);
  return directSummary ? [directSummary] : [`${toolCall.toolId} completed`];
}

function createToolResultMetadata(toolCall: AgentToolCallRecord): Record<string, unknown> | undefined {
  const output = objectValue(toolCall.output);
  const args = flattenedToolArguments(toolCall.arguments);
  const target = objectValue(args.target);
  const outputTarget = objectValue(output?.target);
  const envelope = objectValue(output?.resultEnvelope) ?? output;
  const providerMetadata = objectValue(output?.providerMetadata);
  const serviceLifecycle = objectValue(envelope?.serviceLifecycle);
  const health = objectValue(envelope?.health);
  const error = objectValue(toolCall.error);
  const contextAuditMetadata = objectValue(objectValue(args.context)?.auditMetadata);
  const workspacePathNormalization = objectValue(output?.workspacePathNormalization)
    ?? objectValue(contextAuditMetadata?.workspacePathNormalization)
    ?? error;
  const targetPaths = [
    ...stringArrayValue(args.targetPaths),
    ...stringArrayValue(args.paths),
    ...stringArrayValue(target?.paths),
    ...[firstStringValue(args.targetPath, args.path, args.filePath, target?.path, output?.targetPath, outputTarget?.path, output?.outputPath, output?.imagePath)]
      .filter((item): item is string => item !== undefined),
  ].filter((item, index, array) => array.indexOf(item) === index);
  const toolName = firstStringValue(target?.toolName, target?.name, output?.toolName);
  const resourceUri = firstStringValue(target?.resourceUri, target?.uri, objectValue(output?.resourceEnvelope)?.uri);
  const actionCount = unknownArrayValue(output?.actions ?? outputTarget?.actions).length;
  const itemCount = countFromArrays(output?.items, output?.results, output?.content, objectValue(output?.resourceEnvelope)?.contents)
    ?? (actionCount > 0 ? actionCount : undefined);
  const resultCount = countFromArrays(output?.hits, output?.matches, output?.results);
  const changedFileCount = countFromArrays(envelope?.entries, envelope?.changedFiles, output?.changedFiles, output?.committedFiles);
  const changeLineStats = fileChangeLineStats(toolCall);
  return cleanRecord({
    targetPaths,
    pathCount: targetPaths.length > 0 ? targetPaths.length : undefined,
    targetName: firstStringValue(target?.serverId, target?.connectionId, output?.serverId, output?.connectionId, outputTarget?.targetHint, providerMetadata?.backend),
    toolName,
    resourceUri,
    skillName: firstStringValue(args.skillName, target?.skillName, output?.skillName, output?.name, objectValue(output?.container)?.name),
    branchName: firstStringValue(envelope?.branch, output?.branch, target?.branchName, target?.branch),
    commitHash: firstStringValue(envelope?.commitHash, output?.commitHash, output?.newHead),
    aheadCount: numberValue(envelope?.ahead) ?? numberValue(output?.aheadCount),
    behindCount: numberValue(envelope?.behind) ?? numberValue(output?.behindCount),
    changedFileCount,
    itemCount,
    resultCount,
    matchCount: countFromArrays(output?.matches, envelope?.matches),
    outputCount: countFromArrays(output?.documents, objectValue(output?.preparedInvocation)?.resources),
    mountCount: countFromArrays(objectValue(output?.activation)?.mounts),
    processId: numberValue(envelope?.pid) ?? numberValue(envelope?.processId) ?? numberValue(serviceLifecycle?.processId),
    processStatus: stringValue(envelope?.status),
    processHandle: firstStringValue(envelope?.detachedHandle, envelope?.backgroundHandle, envelope?.spawnHandle, envelope?.processHandle),
    alive: booleanValue(envelope?.alive),
    serviceStatus: firstStringValue(envelope?.serviceStatus, serviceLifecycle?.status, envelope?.status, health?.status),
    healthy: booleanValue(envelope?.healthy) ?? booleanValue(health?.healthy),
    verificationStatus: firstStringValue(envelope?.verificationStatus, serviceLifecycle?.verificationStatus, health?.status),
    serviceHandle: firstStringValue(envelope?.serviceHandle, serviceLifecycle?.handle, envelope?.detachedHandle, envelope?.backgroundHandle, envelope?.spawnHandle, envelope?.processHandle),
    nextRequiredAction: firstStringValue(envelope?.nextRequiredAction, serviceLifecycle?.nextRequiredAction),
    serviceLifecyclePhase: stringValue(serviceLifecycle?.phase),
    serviceProcessState: stringValue(serviceLifecycle?.processState),
    serviceVerificationStatus: stringValue(serviceLifecycle?.verificationStatus),
    serviceReachability: stringValue(serviceLifecycle?.userReachability),
    failureReason: stringValue(envelope?.failureReason),
    stdoutArtifactRef: stringValue(envelope?.stdoutArtifactRef),
    stderrArtifactRef: stringValue(envelope?.stderrArtifactRef),
    registryArtifactRef: stringValue(envelope?.registryArtifactRef),
    recommendedNextActions: stringArrayValue(envelope?.recommendedNextActions),
    workspaceRoot: firstStringValue(workspacePathNormalization?.workspaceRoot, error?.workspaceRoot, output?.workspaceRoot, args.workspaceRoot, objectValue(args.context)?.workspaceRoot),
    allowedRoots: unknownArrayValue(workspacePathNormalization?.allowedRoots).length > 0
      ? unknownArrayValue(workspacePathNormalization?.allowedRoots)
      : undefined,
    requestedCwd: firstStringValue(workspacePathNormalization?.requestedCwd, error?.requestedCwd, output?.requestedCwd),
    normalizedCwd: firstStringValue(workspacePathNormalization?.normalizedCwd, error?.normalizedCwd, output?.normalizedCwd),
    requestedPath: firstStringValue(workspacePathNormalization?.requestedPath, error?.requestedPath, output?.requestedPath),
    normalizedPath: firstStringValue(workspacePathNormalization?.normalizedPath, error?.normalizedPath, output?.normalizedPath),
    cwdWasMapped: typeof workspacePathNormalization?.cwdWasMapped === "boolean" ? workspacePathNormalization.cwdWasMapped : output?.cwdWasMapped,
    pathWasMapped: typeof workspacePathNormalization?.pathWasMapped === "boolean" ? workspacePathNormalization.pathWasMapped : output?.pathWasMapped,
    mappingSource: firstStringValue(workspacePathNormalization?.mappingSource, output?.mappingSource),
    suggestedCwd: firstStringValue(workspacePathNormalization?.suggestedCwd, output?.suggestedCwd),
    serviceOwnership: firstStringValue(output?.serviceOwnership, providerMetadata?.serviceOwnership),
    staleServiceRisk: typeof output?.staleServiceRisk === "boolean" ? output.staleServiceRisk : providerMetadata?.staleServiceRisk,
    imageCount: toolCall.toolId.includes("Image") || toolCall.toolId.includes("Screenshot") || firstStringValue(output?.imagePath, output?.artifactId) ? 1 : undefined,
    mimeType: firstStringValue(output?.mimeType, objectValue(output?.artifact)?.mimeType),
    codeAdditions: changeLineStats?.codeAdditions,
    codeDeletions: changeLineStats?.codeDeletions,
    errorCode: stringValue(error?.code),
  });
}

function toolCallRecordFromProgress(progress: AgentToolCallProgressEvent): AgentToolCallRecord {
  if (progress.phase === "started") {
    return {
      callId: progress.callId,
      toolId: progress.toolId,
      arguments: progress.arguments,
      ok: true,
    };
  }
  return progress.record;
}

function createToolProgressEvent(input: {
  progress: AgentToolCallProgressEvent;
  turnId: string;
  status: PraxisApplicationStatus;
}): Omit<PraxisApplicationEvent, "publicSafe" | "createdAt"> {
  const toolCall = toolCallRecordFromProgress(input.progress);
  const family = familyForToolId(toolCall.toolId);
  const inputSummary = summarizeToolInput(toolCall);
  const argumentsPreview = previewUnknown(toolCall.arguments, 2_000);
  const outputPreview = input.progress.phase === "started" ? undefined : previewUnknown(toolCall.output);
  const errorPreview = input.progress.phase === "started" ? undefined : previewUnknown(toolCall.error);
  const humanResultSummary = input.progress.phase === "started" ? [] : summarizeToolOutputForHumans(toolCall);
  const resultMetadata = input.progress.phase === "started" ? undefined : createToolResultMetadata(toolCall);
  const toolStatus = input.progress.phase === "started"
    ? "running"
    : input.progress.phase;
  return {
    eventId: `${input.turnId}.tool.${toolCall.callId}.${toolStatus}`,
    kind: "tool",
    status: input.status,
    message: `${toolCall.toolId} ${toolStatus}`,
    turnId: input.turnId,
    metadata: {
      toolCallId: toolCall.callId,
      toolId: toolCall.toolId,
      toolStatus,
      inputSummary,
      argumentsPreview,
      outputPreview,
      errorPreview,
      humanResultSummary,
      resultMetadata,
      familyKey: family.familyKey,
      familyTitle: family.familyTitle,
      providerToolName: input.progress.providerToolName,
    },
  };
}

export const applicationRuntimeTestHooks = {
  createToolProgressEvent,
} as const;

function toolProgressKey(progress: AgentToolCallProgressEvent): string {
  const callId = progress.phase === "started" ? progress.callId : progress.record.callId;
  return `${callId}:${progress.phase}`;
}

function createModelProgressEvent(input: {
  progress: AgentModelCallProgressEvent;
  turnId: string;
  status: PraxisApplicationStatus;
  model: PraxisApplicationModelState;
}): Omit<PraxisApplicationEvent, "publicSafe" | "createdAt"> {
  const usage = input.progress.phase === "started" ? undefined : input.progress.usage;
  const contextInputTokens = usage?.inputTokens;
  const contextTotalTokens = usage === undefined ? undefined : usageContextTotalTokens(usage);
  const promptPackTokens = input.progress.phase === "started"
    ? undefined
    : input.progress.cacheDebug?.promptPack.totalEstimatedTokens;
  return {
    eventId: `${input.turnId}.model.${input.progress.invocationId}.${input.progress.phase}`,
    kind: "model",
    status: input.status,
    message: input.progress.phase === "started"
      ? `model request started: ${input.progress.model ?? input.progress.carrierId}`
      : input.progress.phase === "completed"
        ? `model request completed: ${input.progress.model ?? input.progress.carrierId}`
        : `model request failed: ${input.progress.model ?? input.progress.carrierId}`,
    turnId: input.turnId,
    metadata: {
      modelPhase: input.progress.phase,
      invocationId: input.progress.invocationId,
      turnIndex: input.progress.turnIndex,
      provider: input.progress.provider,
      carrierId: input.progress.carrierId,
      model: input.progress.model,
      usage,
      providerRouting: input.progress.phase === "started" ? undefined : input.progress.providerRouting,
      cacheDebug: input.progress.phase === "started" ? undefined : input.progress.cacheDebug,
      providerResponseId: input.progress.phase === "started" ? undefined : input.progress.providerResponseId,
      previousProviderResponseId: input.progress.phase === "started" ? undefined : input.progress.previousProviderResponseId,
      context: contextInputTokens === undefined
        ? undefined
        : {
            provider: input.progress.provider,
            model: input.progress.model,
            promptKind: "applicationLayer",
            windowTokens: input.model.contextWindowTokens,
            maxInputTokens: input.model.maxInputTokens,
            inputBudgetThreshold: input.model.inputBudgetThreshold,
            usableInputTokens: input.model.usableInputTokens,
            windowSource: input.model.metadataSource,
            contextSource: "provider.model-call.usage",
            usageSource: usage?.source ?? "provider.model-call.usage",
            activeTokens: contextInputTokens,
            promptTokens: contextInputTokens,
            sessionContextTokens: Math.max(promptPackTokens ?? 0, contextInputTokens),
            compressionLimitTokens: modelAutoCompactTokenLimit(input.model),
            lastRequestInputTokens: contextInputTokens,
            lastRequestTotalTokens: contextTotalTokens,
            promptPackTokens,
            transcriptTokens: 0,
            summaryTokens: 0,
            historyMessages: 0,
            estimated: usage?.estimated ?? false,
            compacted: false,
          },
      errorMessage: input.progress.phase === "failed" ? input.progress.error?.message : undefined,
    },
  };
}

type ApplicationModelCompletedProgress = Extract<AgentModelCallProgressEvent, { phase: "completed" | "failed" }>;
type ApplicationModelCacheDebug = NonNullable<ApplicationModelCompletedProgress["cacheDebug"]>;
type ApplicationProviderResponsePointer = {
  responseId: string;
  stablePrefixHash: string;
};

function compareApplicationModelCacheDebug(
  cacheDebug: ApplicationModelCacheDebug,
  previous: ApplicationModelCacheDebug | undefined,
): ApplicationModelCacheDebug {
  if (previous === undefined || cacheDebug.comparisonToPrevious !== undefined) return cacheDebug;
  const currentFingerprints = cacheDebug.providerBody.fingerprints;
  const previousFingerprints = previous.providerBody.fingerprints;
  const fingerprintKeys = [...new Set([
    ...Object.keys(previousFingerprints),
    ...Object.keys(currentFingerprints),
  ])].sort();
  const changedFingerprintKeys = fingerprintKeys.filter((key) => previousFingerprints[key] !== currentFingerprints[key]);
  const stablePrefixChanged = previous.providerBody.cacheShape.stablePrefixHash !== cacheDebug.providerBody.cacheShape.stablePrefixHash;
  const dynamicPayloadChanged = previous.providerBody.cacheShape.dynamicPayloadHash !== cacheDebug.providerBody.cacheShape.dynamicPayloadHash;
  const instructionsChanged = previousFingerprints.instructionsHash !== currentFingerprints.instructionsHash;
  const toolsChanged = previousFingerprints.toolsHash !== currentFingerprints.toolsHash;
  const observedUsage = cacheDebug.observedUsage;
  const stablePrefixMissWithStableBody =
    observedUsage?.diagnosis === "stable-prefix-cache-break"
    && observedUsage.cachedInputTokens === 0
    && !stablePrefixChanged
    && !instructionsChanged
    && !toolsChanged;
  return {
    ...cacheDebug,
    observedUsage: stablePrefixMissWithStableBody
      ? {
        ...observedUsage,
        diagnosis: "provider-cache-miss-with-stable-prefix",
        reasons: [
          ...observedUsage.reasons,
          "stable prefix and provider tool fingerprints match the previous application model call; this looks like provider cache routing/reuse miss, not PromptPack prefix drift",
        ],
      }
      : observedUsage,
    comparisonToPrevious: {
      previousStablePrefixHash: previous.providerBody.cacheShape.stablePrefixHash,
      previousDynamicPayloadHash: previous.providerBody.cacheShape.dynamicPayloadHash,
      stablePrefixChanged,
      dynamicPayloadChanged,
      instructionsChanged,
      toolsChanged,
      changedFingerprintKeys,
    },
  };
}

function progressWithSessionCacheComparison(
  state: RuntimeState,
  progress: AgentModelCallProgressEvent,
): AgentModelCallProgressEvent {
  if (progress.phase === "started" || progress.cacheDebug === undefined) return progress;
  const compared = compareApplicationModelCacheDebug(
    progress.cacheDebug,
    state.modelCacheDebugBySession.get(state.sessionId),
  );
  state.modelCacheDebugBySession.set(state.sessionId, compared);
  return { ...progress, cacheDebug: compared };
}

function rememberProviderResponseForSession(
  state: RuntimeState,
  progress: AgentModelCallProgressEvent,
): void {
  if (
    progress.phase === "started" ||
    progress.providerResponseId === undefined ||
    progress.cacheDebug === undefined
  ) {
    return;
  }
  state.lastProviderResponseBySession.set(state.sessionId, {
    responseId: progress.providerResponseId,
    stablePrefixHash: progress.cacheDebug.providerBody.cacheShape.stablePrefixHash,
  });
}

function readResponseText(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const objects = readProviderSseObjects(raw);
    const completedParts = objects.flatMap((object) => {
      if (object.type === "response.output_text.done") {
        const text = stringValue(object.text);
        return text ? [text] : [];
      }
      if (object.type === "response.output_item.done") {
        const itemText = readResponseText(object.item);
        return itemText ? [itemText] : [];
      }
      return [];
    });
    if (completedParts.length > 0) {
      return completedParts.join("\n").trim() || undefined;
    }
    const deltaParts = objects
      .map((object) => stringValue(object.delta))
      .filter((delta): delta is string => delta !== undefined);
    return deltaParts.join("").trim() || undefined;
  }

  const record = objectValue(raw);
  const outputText = stringValue(record?.output_text);
  if (outputText) return outputText;
  const output = Array.isArray(record?.output) ? record.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const itemRecord = objectValue(item);
    const content = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
    for (const block of content) {
      const blockRecord = objectValue(block);
      const text = stringValue(blockRecord?.text);
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim() || undefined;
}

function readProviderSseObjects(raw: string): Record<string, unknown>[] {
  return raw
    .replace(/\r\n/gu, "\n")
    .split("\n\n")
    .flatMap((frame) => {
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");
      if (!payload || payload === "[DONE]") return [];
      try {
        const parsed = JSON.parse(payload) as unknown;
        const record = objectValue(parsed);
        return record ? [record] : [];
      } catch {
        return [];
      }
    });
}

function collectResponseSourcesFromContent(content: unknown): Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> {
  if (!Array.isArray(content)) return [];
  const sources: Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> = [];
  for (const block of content) {
    const blockRecord = objectValue(block);
    const annotations = Array.isArray(blockRecord?.annotations) ? blockRecord.annotations : [];
    for (const annotation of annotations) {
      const annotationRecord = objectValue(annotation);
      const url = stringValue(annotationRecord?.url);
      if (!url) continue;
      sources.push({
        url,
        ...(stringValue(annotationRecord?.title) ? { title: stringValue(annotationRecord?.title) } : {}),
        ...(stringValue(annotationRecord?.snippet) ? { snippet: stringValue(annotationRecord?.snippet) } : {}),
        kind: "citation",
        raw: annotationRecord,
      });
    }
  }
  return sources;
}

function readResponseSources(raw: unknown): Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> {
  const dedupeSources = (
    sources: Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }>,
  ): Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> => {
    const seen = new Set<string>();
    const deduped: Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> = [];
    for (const source of sources) {
      const key = `${source.kind ?? ""}:${source.url}:${source.title ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(source);
    }
    return deduped;
  };

  if (typeof raw === "string") {
    const sources: Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> = [];
    for (const object of readProviderSseObjects(raw)) {
      if (object.type !== "response.output_item.done") continue;
      const item = objectValue(object.item);
      if (item?.type === "message") {
        sources.push(...collectResponseSourcesFromContent(item.content));
      }
      if (item?.type === "web_search_call") {
        const action = objectValue(item.action);
        const query = stringValue(action?.query);
        const actionSources = Array.isArray(action?.sources) ? action.sources : [];
        for (const actionSource of actionSources) {
          const sourceRecord = objectValue(actionSource);
          const type = stringValue(sourceRecord?.type);
          const name = stringValue(sourceRecord?.name);
          const url = stringValue(sourceRecord?.url);
          const title = stringValue(sourceRecord?.title) ?? name ?? type;
          if (url) {
            sources.push({
              url,
              ...(title ? { title } : {}),
              kind: "provider_native",
              raw: sourceRecord,
            });
          } else if (name || type) {
            sources.push({
              url: `provider-native:${encodeURIComponent(name ?? type ?? "web_search")}`,
              title: title ? `Provider source: ${title}` : "Provider web search source",
              kind: "provider_native",
              raw: sourceRecord,
            });
          }
        }
        if (query) {
          sources.push({
            url: `provider-native:web_search:${encodeURIComponent(query)}`,
            title: `Provider web search: ${query}`,
            kind: "provider_native",
            raw: action,
          });
        }
      }
    }
    return dedupeSources(sources);
  }

  const record = objectValue(raw);
  const output = Array.isArray(record?.output) ? record.output : [];
  const sources: Array<{ title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }> = [];
  for (const item of output) {
    const itemRecord = objectValue(item);
    sources.push(...collectResponseSourcesFromContent(itemRecord?.content));
  }
  return dedupeSources(sources);
}

function openAIResponsesRouteFor(liveProvider: PraxisApplicationLiveProvider | undefined): OpenAIResponsesApplicationAdapterRoute | undefined {
  if (liveProvider === undefined) return undefined;
  const provider = liveProvider.provider?.trim();
  const endpointShape = liveProvider.endpointShape?.trim();
  if (provider !== undefined && provider !== "openai") return undefined;
  if (endpointShape !== undefined && endpointShape !== "responses" && endpointShape !== "chatgpt_codex_responses") return undefined;
  const providerCaller = liveProvider.openaiResponsesCaller ?? liveProvider.providerCaller;
  if (providerCaller === undefined) return undefined;
  const providerRoute = liveProvider.providerRoute?.trim();
  const kind = providerRoute === "chatgpt_codex_responses" ||
    endpointShape === "chatgpt_codex_responses" ||
    liveProvider.auth?.credentialRef?.credentialType === "chatgpt_codex_oauth"
    ? "chatgpt_codex_responses"
    : "openai_responses";
  return {
    kind,
    providerCaller,
    baseURL: liveProvider.baseURL,
  };
}

function responsesBaseRoute(input: {
  baseURL?: string;
  defaultEndpointPath: "/v1/responses" | "/responses";
}): { baseUrl?: string; endpointPath: "/v1/responses" | "/responses" } {
  const base = input.baseURL?.trim().replace(/\/+$/u, "");
  if (base === undefined || base.length === 0) {
    return { endpointPath: input.defaultEndpointPath };
  }
  if (base.endsWith("/v1/responses")) {
    return { baseUrl: base.slice(0, -"/v1/responses".length) || undefined, endpointPath: "/v1/responses" };
  }
  if (base.endsWith("/responses")) {
    return { baseUrl: base.slice(0, -"/responses".length) || undefined, endpointPath: "/responses" };
  }
  if (base.endsWith("/v1")) {
    return { baseUrl: base, endpointPath: "/responses" };
  }
  return { baseUrl: base, endpointPath: input.defaultEndpointPath };
}

function adapterRequiredScopes(
  route: OpenAIResponsesApplicationAdapterRoute,
  extraScopes: readonly string[] = [],
): readonly string[] {
  const routeScope = route.kind === "chatgpt_codex_responses" ? "chatgpt.codex.responses" : "openai.responses";
  return ["model.invoke", routeScope, ...extraScopes];
}

function adapterBackend(route: OpenAIResponsesApplicationAdapterRoute, suffix: string): string {
  return route.kind === "chatgpt_codex_responses"
    ? `chatgpt-codex-responses-${suffix}`
    : `openai-responses-${suffix}`;
}

function isChatGPTCodexAuth(auth: AuthEnvelope): boolean {
  return auth.credentialRef?.credentialType === "chatgpt_codex_oauth";
}

function effectiveOpenAIResponsesApplicationRoute(
  route: OpenAIResponsesApplicationAdapterRoute,
  auth: AuthEnvelope,
): OpenAIResponsesApplicationAdapterRoute {
  return isChatGPTCodexAuth(auth)
    ? { ...route, kind: "chatgpt_codex_responses" }
    : route;
}

function adapterRouteScopes(
  route: OpenAIResponsesApplicationAdapterRoute,
  requestedScopes: readonly string[],
): readonly string[] {
  return adapterRequiredScopes(
    route,
    requestedScopes.filter((scope) =>
      scope !== "model.invoke" && scope !== "openai.responses" && scope !== "chatgpt.codex.responses"
    ),
  );
}

export function invokeOpenAIResponsesApplicationAdapter(input: {
  route: OpenAIResponsesApplicationAdapterRoute;
  auth: AuthEnvelope;
  runtimeId: string;
  invocationId: string;
  callerId: string;
  requiredScopes: readonly string[];
  body: unknown;
}): Promise<OpenAIV1ResponsesResult> {
  const effectiveRoute = effectiveOpenAIResponsesApplicationRoute(input.route, input.auth);
  const requiredScopes = adapterRouteScopes(effectiveRoute, input.requiredScopes);
  if (effectiveRoute.kind === "chatgpt_codex_responses") {
    const route = responsesBaseRoute({ baseURL: effectiveRoute.baseURL, defaultEndpointPath: "/responses" });
    return invokeChatGPTCodexResponses({
      operation: "create",
      method: "POST",
      auth: input.auth,
      caller: effectiveRoute.providerCaller,
      runtime: {
        runtimeId: input.runtimeId,
        invocationId: input.invocationId,
        callerId: input.callerId,
      },
      requiredScopes,
      governance: { accepted: true },
      contract: { accepted: true },
      dryRun: false,
      headers: { "content-type": "application/json" },
      expectResponseObject: false,
      baseUrl: route.baseUrl,
      endpointPath: route.endpointPath,
      body: input.body,
    });
  }

  const route = responsesBaseRoute({ baseURL: effectiveRoute.baseURL, defaultEndpointPath: "/v1/responses" });
  return invokeOpenAIV1Responses({
    operation: "create",
    method: "POST",
    auth: input.auth,
    caller: effectiveRoute.providerCaller,
    runtime: {
      runtimeId: input.runtimeId,
      invocationId: input.invocationId,
      callerId: input.callerId,
    },
    requiredScopes,
    governance: { accepted: true },
    contract: { accepted: true },
    dryRun: false,
    headers: { "content-type": "application/json" },
    expectResponseObject: false,
    baseUrl: route.baseUrl,
    endpointPath: route.endpointPath,
    body: input.body,
  });
}

function authEnvelopeWithPrivateMaterial(auth: AuthEnvelope, privateMaterial: ProviderAuthMaterial | undefined): AuthEnvelope {
  if (privateMaterial?.headers === undefined) return auth;
  return {
    ...auth,
    headerPlan: Object.entries(privateMaterial.headers).map(([name, value]) => ({
      name: name.trim().toLowerCase(),
      value,
      redacted: true,
    })),
  };
}

function liveProviderHasAuthSource(liveProvider: PraxisApplicationLiveProvider | undefined): boolean {
  return liveProvider?.auth !== undefined ||
    (liveProvider?.runtimeAuthResolver !== undefined && liveProvider.authSelection !== undefined);
}

function liveProviderAuthSupplier(liveProvider: PraxisApplicationLiveProvider | undefined): ApplicationAuthSupplier {
  let cachedResolvedAuth: Promise<AuthEnvelope | undefined> | undefined;
  return async () => {
    if (liveProvider?.auth !== undefined) return liveProvider.auth;
    if (liveProvider?.runtimeAuthResolver === undefined || liveProvider.authSelection === undefined) {
      return undefined;
    }
    cachedResolvedAuth ??= liveProvider.runtimeAuthResolver.resolve(liveProvider.authSelection).then((resolved) => {
      if (!resolved.ok) return undefined;
      return authEnvelopeWithPrivateMaterial(resolved.value.auth, resolved.value.resolved.privateMaterial);
    });
    return await cachedResolvedAuth;
  };
}

async function requireAdapterAuth(
  authSupplier: ApplicationAuthSupplier,
  adapterLabel: string,
): Promise<{ ok: true; auth: AuthEnvelope } | { ok: false; result: BaseToolExecutorResult<never> }> {
  const auth = await authSupplier();
  if (auth?.present === true) return { ok: true, auth };
  return {
    ok: false,
    result: {
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: `${adapterLabel} requires resolved provider auth material`,
        publicSafe: true,
      },
    },
  };
}

function createProviderNativeSearchAdapter(input: {
  auth: ApplicationAuthSupplier;
  route: OpenAIResponsesApplicationAdapterRoute;
  runtimeId: string;
}): NonNullable<NonNullable<BaseToolExecutorPort["network"]>["nativeWebSearch"]> {
  return async (request): Promise<BaseToolExecutorResult<{
    answer?: string;
    sources: readonly { title?: string; url: string; snippet?: string; kind?: "search_result" | "citation" | "provider_native"; raw?: unknown }[];
    citations?: readonly { url: string; title?: string; snippet?: string; providerReference?: string; raw?: unknown }[];
    providerMetadata?: Readonly<Record<string, unknown>>;
    raw?: unknown;
  }>> => {
    if (request.provider !== "openai") {
      return {
        ok: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: `provider-native search adapter is not available for ${request.provider}`,
          publicSafe: true,
        },
      };
    }
    const resolvedAuth = await requireAdapterAuth(input.auth, "provider-native search adapter");
    if (!resolvedAuth.ok) return resolvedAuth.result;
    const route = effectiveOpenAIResponsesApplicationRoute(input.route, resolvedAuth.auth);

    const result = await invokeOpenAIResponsesApplicationAdapter({
      route,
      auth: resolvedAuth.auth,
      runtimeId: input.runtimeId,
      invocationId: `native-web-search:${Date.now()}`,
      callerId: "raxode.application.nativeWebSearch",
      requiredScopes: adapterRequiredScopes(route),
      body: {
        model: request.model ?? "gpt-5.5",
        input: request.query,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        store: false,
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          publicSafe: true,
        },
        events: result.events,
      };
    }
    const raw = result.response.raw;
    const answer = readResponseText(raw);
    const sources = readResponseSources(raw);
    const publicSources = sources.map((source) => ({
      url: source.url,
      ...(source.title ? { title: source.title } : {}),
      ...(source.snippet ? { snippet: source.snippet } : {}),
      ...(source.kind ? { kind: source.kind } : {}),
    }));
    return {
      ok: true,
      output: {
        ...(answer ? { answer } : {}),
        sources: publicSources,
        citations: publicSources.map((source) => ({
          url: source.url,
          ...(source.title ? { title: source.title } : {}),
          ...(source.snippet ? { snippet: source.snippet } : {}),
        })),
        providerMetadata: {
          provider: request.provider,
          backend: adapterBackend(route, "web-search"),
          sourceCount: sources.length,
        },
      },
      events: ["raxode.application.nativeWebSearch.openai.called"],
    };
  };
}

function imageMimeTypeFromPath(imagePath: string, declared: string | undefined): string {
  if (declared !== undefined && declared !== "unknown") return declared;
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

function responsesImageDetail(detail: string | undefined): "low" | "high" {
  return detail === "low" ? "low" : "high";
}

function responsesImageGenerationSize(value: string | undefined): string | undefined {
  if (value === undefined || value === "auto") return value;
  if (value === "1024x1024" || value === "1024x1536" || value === "1536x1024") return value;
  return undefined;
}

function responsesImageGenerationQuality(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return ["auto", "low", "medium", "high"].includes(value) ? value : undefined;
}

function responsesImageGenerationFormat(value: string | undefined): "png" | "jpeg" | "webp" | undefined {
  if (value === undefined) return undefined;
  if (value === "image/png" || value === "png") return "png";
  if (value === "image/jpeg" || value === "jpeg" || value === "jpg") return "jpeg";
  if (value === "image/webp" || value === "webp") return "webp";
  return undefined;
}

function imageMimeTypeFromFormat(format: "png" | "jpeg" | "webp" | undefined, outputPath: string): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return imageMimeTypeFromPath(outputPath, "image/png");
}

function readImageGenerationCallRecord(record: Record<string, unknown>): { imageBase64: string; revisedPrompt?: string; imageCallId?: string } | undefined {
  if (record.type === "image_generation_call") {
    const imageBase64 = stringValue(record.result);
    if (imageBase64) {
      return {
        imageBase64,
        revisedPrompt: stringValue(record.revised_prompt),
        imageCallId: stringValue(record.id),
      };
    }
  }

  const item = objectValue(record.item);
  if (item) {
    const generated = readImageGenerationCallRecord(item);
    if (generated) return generated;
  }

  const response = objectValue(record.response);
  if (response) {
    const generated = readImageGenerationCallRecord(response);
    if (generated) return generated;
  }

  const output = Array.isArray(record?.output) ? record.output : [];
  for (const outputItem of output) {
    const itemRecord = objectValue(outputItem);
    if (!itemRecord) continue;
    const generated = readImageGenerationCallRecord(itemRecord);
    if (generated) return generated;
  }
  return undefined;
}

function readImageGenerationCall(raw: unknown): { imageBase64: string; revisedPrompt?: string; imageCallId?: string } | undefined {
  if (typeof raw === "string") {
    for (const object of readProviderSseObjects(raw)) {
      const generated = readImageGenerationCallRecord(object);
      if (generated) return generated;
    }
    return undefined;
  }
  const record = objectValue(raw);
  return record ? readImageGenerationCallRecord(record) : undefined;
}

function normalizeAttachmentRef(value: string): string {
  return value.trim().replace(/^\[|\]$/gu, "").replace(/\s+/gu, " ").toLowerCase();
}

function attachmentRefCandidates(attachment: ApplicationInputAttachment): string[] {
  return [
    attachment.id,
    attachment.tokenText,
    attachment.tokenText?.replace(/^\[|\]$/gu, ""),
    attachment.displayName,
    attachment.localPath,
    attachment.remoteUrl,
  ]
    .filter((value): value is string => value !== undefined && value.trim().length > 0)
    .map(normalizeAttachmentRef);
}

function resolveImageAttachment(input: {
  imageRef?: string;
  attachments?: readonly ApplicationInputAttachment[];
}): ApplicationInputAttachment | undefined {
  if (!input.imageRef || !input.attachments || input.attachments.length === 0) return undefined;
  const normalizedRef = normalizeAttachmentRef(input.imageRef);
  return input.attachments.find((attachment) => {
    if (attachment.kind !== "image") return false;
    return attachmentRefCandidates(attachment).includes(normalizedRef);
  });
}

function createOpenAIResponsesImageVisionAdapter(input: {
  auth: ApplicationAuthSupplier;
  route: OpenAIResponsesApplicationAdapterRoute;
  runtimeId: string;
  model: string;
  attachments?: readonly ApplicationInputAttachment[];
}): NonNullable<NonNullable<BaseToolExecutorPort["media"]>["transformMedia"]> {
  return async (request): Promise<BaseToolExecutorResult<{ artifactId: string; mimeType?: string }>> => {
    const parameters = request.parameters ?? {};
    if (request.operation === "media.generateImage.generateimage") {
      const prompt = stringValue(parameters.prompt);
      const outputPath = stringValue(parameters.outputPath);
      if (prompt === undefined || outputPath === undefined) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_REJECTED",
            message: "media.generateImage requires target.prompt and target.outputPath for Responses image_generation",
            publicSafe: true,
          },
        };
      }
      const outputFormat = responsesImageGenerationFormat(
        stringValue(parameters.outputFormat)
          ?? stringValue(parameters.targetFormat)
          ?? stringValue(parameters.format)
          ?? stringValue(parameters.mimeType),
      );
      const imageTool: Record<string, unknown> = {
        type: "image_generation",
      };
      const size = responsesImageGenerationSize(stringValue(parameters.size));
      if (size !== undefined) imageTool.size = size;
      const quality = responsesImageGenerationQuality(stringValue(parameters.quality));
      if (quality !== undefined) imageTool.quality = quality;
      if (outputFormat !== undefined) imageTool.output_format = outputFormat;

      const resolvedAuth = await requireAdapterAuth(input.auth, "media.generateImage OpenAI Responses adapter");
      if (!resolvedAuth.ok) return resolvedAuth.result;
      const route = effectiveOpenAIResponsesApplicationRoute(input.route, resolvedAuth.auth);

      const result = await invokeOpenAIResponsesApplicationAdapter({
        route,
        auth: resolvedAuth.auth,
        runtimeId: input.runtimeId,
        invocationId: `media-generate-image:${Date.now()}`,
        callerId: "raxode.application.mediaGenerateImage",
        requiredScopes: adapterRequiredScopes(route, ["media.image.generate"]),
        body: {
          model: input.model,
          input: prompt,
          tools: [imageTool],
          tool_choice: { type: "image_generation" },
          store: false,
          stream: true,
        },
      });

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            publicSafe: true,
          },
          events: result.events,
        };
      }

      const generated = readImageGenerationCall(result.response.raw);
      if (generated === undefined) {
        return {
          ok: false,
          error: {
            code: "RESPONSE_FORMAT_DRIFT",
            message: "media.generateImage Responses image_generation did not return an image_generation_call result",
            publicSafe: true,
          },
          events: result.events,
        };
      }

      const imageBytes = Buffer.from(generated.imageBase64, "base64");
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, imageBytes);
      const mimeType = imageMimeTypeFromFormat(outputFormat, outputPath);
      return {
        ok: true,
        output: {
          artifactId: outputPath,
          mimeType,
        },
        metadata: {
          provider: "openai",
          backend: adapterBackend(route, "image-generation"),
          model: input.model,
          outputPath,
          mimeType,
          byteLength: imageBytes.byteLength,
          ...(generated.revisedPrompt ? { revisedPrompt: generated.revisedPrompt } : {}),
          ...(generated.imageCallId ? { imageCallId: generated.imageCallId } : {}),
        },
        events: ["raxode.application.mediaGenerateImage.openai.called"],
      };
    }

    const imageRef = stringValue(parameters.imageRef) ?? request.inputArtifactId;
    const attachment = resolveImageAttachment({
      imageRef,
      attachments: input.attachments,
    });
    const imagePath = stringValue(parameters.imagePath) ?? attachment?.localPath;
    if (imagePath === undefined) {
      return {
        ok: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: imageRef
            ? `media.viewImage OpenAI vision adapter could not resolve imageRef to a local imagePath: ${imageRef}`
            : "media.viewImage OpenAI vision adapter requires a local imagePath or an application image attachment reference",
          publicSafe: true,
        },
      };
    }

    const maxBytes = numberValue(parameters.maxBytes) ?? 20 * 1024 * 1024;
    let bytes: Buffer;
    try {
      bytes = await readFile(imagePath);
    } catch {
      return {
        ok: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: `media.viewImage OpenAI vision adapter could not read imagePath: ${imagePath}`,
          publicSafe: true,
        },
      };
    }

    if (bytes.byteLength > maxBytes) {
      return {
        ok: false,
        error: {
          code: "PROVIDER_REJECTED",
          message: `media.viewImage image exceeds maxBytes (${bytes.byteLength} > ${maxBytes})`,
          publicSafe: true,
        },
      };
    }

    const mimeType = imageMimeTypeFromPath(imagePath, stringValue(parameters.mediaType) ?? attachment?.mimeType);
    const detail = responsesImageDetail(stringValue(parameters.detail));
    const resolvedAuth = await requireAdapterAuth(input.auth, "media.viewImage OpenAI Responses adapter");
    if (!resolvedAuth.ok) return resolvedAuth.result;
    const route = effectiveOpenAIResponsesApplicationRoute(input.route, resolvedAuth.auth);

    const result = await invokeOpenAIResponsesApplicationAdapter({
      route,
      auth: resolvedAuth.auth,
      runtimeId: input.runtimeId,
      invocationId: `media-view-image:${Date.now()}`,
      callerId: "raxode.application.mediaViewImage",
      requiredScopes: adapterRequiredScopes(route),
      body: {
        model: input.model,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Analyze this image for a Praxis desktop/browser automation agent.",
                "Return concise visible UI facts, actionable controls, and approximate screen-relative targets only when evident.",
                "Do not invent unseen buttons or coordinates.",
              ].join(" "),
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${bytes.toString("base64")}`,
              detail,
            },
          ],
        }],
        store: false,
      },
    });

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          publicSafe: true,
        },
        events: result.events,
      };
    }

    const analysis = readResponseText(result.response.raw);
    return {
      ok: true,
      output: {
        artifactId: request.inputArtifactId ?? `artifact:vision:${Date.now()}`,
        mimeType,
      },
      metadata: {
        provider: "openai",
        backend: adapterBackend(route, "vision"),
        model: input.model,
        imagePath,
        mimeType,
        detail,
        ...(analysis ? { analysis } : {}),
      },
      events: ["raxode.application.mediaViewImage.openai.called"],
    };
  };
}

async function withTimeout<T>(input: {
  promise: Promise<T>;
  timeoutMs: number;
  message: string;
}): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      input.promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(input.message)), input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function shouldAutoApproveForProfile(profile: PraxisApplicationPermissionProfile, envelope: RuntimeApprovalEnvelope): boolean {
  if (profile === "bapr") return true;
  if (profile !== "yolo" && profile !== "permissive") return false;
  const riskLevel = (stringValue(envelope.riskLevel) ?? "").toLowerCase();
  return riskLevel !== "dangerous" && riskLevel !== "high";
}

function autoApprovalResolutionForProfile(
  profile: PraxisApplicationPermissionProfile,
  envelope: RuntimeApprovalEnvelope,
): RuntimeApprovalResolution | undefined {
  if (!shouldAutoApproveForProfile(profile, envelope)) return undefined;
  return {
    status: "approved",
    resolvedBy: `application.profile.${profile}`,
    reason: `${profile} profile auto-approves this runtime approval request`,
    metadata: {
      approvalId: envelope.approvalId,
      profile,
      riskLevel: envelope.riskLevel,
    },
  };
}

function approvalFeatureKey(envelope: RuntimeApprovalEnvelope): string {
  const metadataToolId = stringValue(envelope.metadata.toolId);
  if (metadataToolId) return metadataToolId;
  if (envelope.requestedScopes.length > 0) return envelope.requestedScopes.join(",");
  return envelope.source;
}

function approvalFeatureLabel(featureKey: string): string {
  if (featureKey.startsWith("computer.")) return "computer";
  if (featureKey.startsWith("media.")) return "media";
  if (featureKey.startsWith("shell.")) return "shell";
  if (featureKey.startsWith("git.")) return "git";
  if (featureKey.startsWith("code.")) return "code";
  if (featureKey.startsWith("search.")) return "web_search";
  if (featureKey.startsWith("mcp.")) return "mcp";
  if (featureKey.startsWith("skill.")) return "skill";
  return featureKey;
}

async function loadAgentExport(project: PraxisApplicationProject, input: {
  entryPath?: string;
  exportName?: string;
} = {}): Promise<unknown> {
  const module = await import(pathToFileURL(input.entryPath ?? project.agentEntryPath).href) as Record<string, unknown>;
  if (input.exportName ?? project.exportName) {
    return module[(input.exportName ?? project.exportName)!];
  }
  return module.default ?? Object.values(module)[0];
}

function mergeToolContextUsage(
  current: readonly BaseToolContextUsageRecord[] | undefined,
  toolCalls: readonly AgentToolCallRecord[],
): BaseToolContextUsageRecord[] {
  const counts = new Map<string, number>();
  for (const record of current ?? []) {
    const toolId = record.toolId.trim();
    if (toolId.length === 0) continue;
    counts.set(toolId, (counts.get(toolId) ?? 0) + Math.max(1, Math.floor(record.count ?? 1)));
  }
  for (const call of toolCalls) {
    const toolId = call.toolId.trim();
    if (toolId.length === 0) continue;
    counts.set(toolId, (counts.get(toolId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([toolId, count]) => ({ toolId, count }));
}

function rememberToolContextFromRun(state: RuntimeState, result: AgentRunResult): void {
  const sessionId = result.sessionId ?? state.sessionId;
  state.toolContextSelections.delete(sessionId);

  if (result.ok && result.toolCalls.length > 0) {
    state.toolContextUsage.set(sessionId, mergeToolContextUsage(state.toolContextUsage.get(sessionId), result.toolCalls));
  }
}

function applyRunResult(state: RuntimeState, result: AgentRunResult): void {
  state.modelCalls = result.ok ? result.modelCalls.length : 0;
  state.toolCalls = result.ok ? result.toolCalls.length : 0;
  state.mainLoopSteps = result.mainLoopSteps?.length ?? 0;
  state.manifest = result.manifest ?? state.manifest;
  state.usage = result.ok ? summarizeRunUsage(result) : undefined;
  if (result.ok) {
    state.status = "completed";
    state.finalOutput = result.finalOutput;
    state.error = undefined;
  } else {
    state.status = "failed";
    state.error = {
      code: result.error.code,
      message: result.error.message,
    };
    state.finalOutput = undefined;
  }
}

function addOptionalNumber(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) {
    return undefined;
  }
  return (left ?? 0) + (right ?? 0);
}

function usageContextTotalTokens(usage: {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}): number | undefined {
  if (typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)) {
    return usage.totalTokens;
  }
  if (
    typeof usage.inputTokens === "number"
    && Number.isFinite(usage.inputTokens)
    && typeof usage.outputTokens === "number"
    && Number.isFinite(usage.outputTokens)
  ) {
    return usage.inputTokens + usage.outputTokens;
  }
  return undefined;
}

function summarizeRunUsage(result: Extract<AgentRunResult, { ok: true }>): PraxisApplicationUsageTelemetry | undefined {
  const usageRecords = result.modelCalls
    .map((call) => call.usage)
    .filter((usage): usage is NonNullable<typeof usage> => usage !== undefined);
  if (usageRecords.length === 0) {
    return undefined;
  }

  const summary = usageRecords.reduce<PraxisApplicationUsageTelemetry>((accumulator, usage) => ({
    inputTokens: addOptionalNumber(accumulator.inputTokens, usage.inputTokens),
    outputTokens: addOptionalNumber(accumulator.outputTokens, usage.outputTokens),
    thinkingTokens: addOptionalNumber(accumulator.thinkingTokens, usage.thinkingTokens),
    totalTokens: addOptionalNumber(accumulator.totalTokens, usage.totalTokens),
    cachedInputTokens: addOptionalNumber(accumulator.cachedInputTokens, usage.cachedInputTokens),
    source: accumulator.source ?? usage.source,
    estimated: accumulator.estimated || usage.estimated,
    modelCalls: accumulator.modelCalls + 1,
  }), {
    estimated: false,
    modelCalls: 0,
  });
  const lastUsage = [...usageRecords].reverse().find((usage) =>
    typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens));
  if (lastUsage?.inputTokens !== undefined) {
    summary.lastInputTokens = lastUsage.inputTokens;
  }
  const lastTotalUsage = [...usageRecords].reverse().find((usage) => usageContextTotalTokens(usage) !== undefined);
  const lastTotalTokens = lastTotalUsage === undefined ? undefined : usageContextTotalTokens(lastTotalUsage);
  if (lastTotalTokens !== undefined) {
    summary.lastTotalTokens = lastTotalTokens;
  }
  const lastPromptPack = [...result.modelCalls].reverse().find((call) =>
    typeof call.cacheDebug?.promptPack.totalEstimatedTokens === "number" &&
    Number.isFinite(call.cacheDebug.promptPack.totalEstimatedTokens));
  if (lastPromptPack?.cacheDebug?.promptPack.totalEstimatedTokens !== undefined) {
    summary.lastPromptPackTokens = lastPromptPack.cacheDebug.promptPack.totalEstimatedTokens;
  }

  return summary.modelCalls > 0 ? summary : undefined;
}

export function createPraxisApplicationRuntime(options: PraxisApplicationRuntimeOptions): PraxisApplicationRuntime {
  const now = options.now ?? defaultNow;
  const listeners = new Set<(event: PraxisApplicationEvent) => void>();
  const project = options.project;
  const applicationId = options.applicationId ?? project.applicationId;
  const state: RuntimeState = {
    status: "idle",
    sessionId: options.sessionId ?? `session.${applicationId}.default`,
    runtimeId: options.runtimeId ?? `runtime.${applicationId}`,
    cwd: path.resolve(options.cwd ?? project.projectRoot),
    mode: options.mode ?? "dry-run",
    model: createApplicationModelState({
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      provider: options.provider,
      endpointShape: options.endpointShape,
      baseURL: options.baseURL,
      providerRoute: options.providerRoute,
      maxOutputTokens: options.maxOutputTokens,
    }),
    permissionProfile: options.permissionProfile ?? "permissive",
    toolProfile: options.toolProfile ?? "codingCore",
    turns: 0,
    modelCalls: 0,
    toolCalls: 0,
    mainLoopSteps: 0,
    events: [],
    sessions: new Map(),
    approvals: new Map(),
    pendingApprovalResolvers: new Map(),
    cancelledAuxiliaryTasks: new Set(),
    conversationHistory: new Map(),
    conversationSummaries: new Map(),
    modelCacheDebugBySession: new Map(),
    lastProviderResponseBySession: new Map(),
    toolContextSelections: new Map(),
    toolContextUsage: new Map(),
    alwaysApprovedApprovalKeys: new Set(),
    foundationProject: options.foundationProject,
    multiagentRuntime: createInMemoryMultiagentRuntime({
      projectId: project.projectId,
      workspaceRoot: path.resolve(options.cwd ?? project.projectRoot),
      defaultModel: options.model,
      initialSessions: [{
        sessionId: options.sessionId ?? `session.${applicationId}.default`,
        agentId: project.agentEntries.primary?.agentId ?? `agent.${project.projectId}.primary`,
        workingDirectory: path.resolve(options.cwd ?? project.projectRoot),
        status: "idle",
      }],
    }),
    multiagentActiveSessions: 1,
    multiagentBackgroundRuns: new Set(),
    auth: undefined,
  };

  async function refreshAuthState(): Promise<void> {
    const next = await options.authStateProvider?.({
      sessionId: state.sessionId,
      runtimeId: state.runtimeId,
      manifest: state.manifest,
      model: state.model,
    });
    if (next !== undefined) {
      state.auth = next;
    }
  }

  async function safeRefreshAuthState(): Promise<void> {
    try {
      await refreshAuthState();
    } catch (error) {
      state.auth = {
        profiles: [],
        lastAuditEventKind: "application.auth.state.failed",
        lastAuditAt: now(),
        publicSafe: true,
      };
      publish({
        eventId: "application.auth.state.failed",
        kind: "error",
        status: state.status,
        message: "Application auth state provider failed",
        metadata: { code: "AUTH_STATE_PROVIDER_FAILED" },
      });
    }
  }

  function commandSessionId(command: PraxisApplicationCommand): string | undefined {
    return "sessionId" in command ? command.sessionId : undefined;
  }

  function publish(input: Omit<PraxisApplicationEvent, "publicSafe" | "createdAt"> & { createdAt?: string }): PraxisApplicationEvent {
    const output = event({
      ...input,
      createdAt: input.createdAt ?? now(),
      sessionId: input.sessionId ?? state.sessionId,
      runtimeId: input.runtimeId ?? state.runtimeId,
    });
    state.events.push(output);
    touchSession();
    for (const listener of listeners) listener(output);
    return output;
  }

  function applyCommandSession(sessionId: string | undefined): void {
    if (typeof sessionId === "string" && sessionId.trim().length > 0) {
      state.sessionId = sessionId.trim();
    }
    touchSession();
  }

  function touchSession(): void {
    const current = state.sessions.get(state.sessionId);
    state.sessions.set(state.sessionId, {
      sessionId: state.sessionId,
      name: current?.name ?? state.sessionId.split(".").at(-1),
      workspaceRoot: state.cwd,
      status: state.status,
      lastActiveAt: now(),
      turns: state.turns,
    });
    void state.multiagentRuntime.ensureSession({
      sessionId: state.sessionId,
      agentId: state.manifest?.identity.id ?? project.agentEntries.primary?.agentId ?? `agent.${project.projectId}.primary`,
      name: current?.name ?? state.sessionId.split(".").at(-1),
      workingDirectory: state.cwd,
      status: state.status === "running" ? "running" : "idle",
      metadata: {
        applicationId,
        runtimeId: state.runtimeId,
        source: "application.session",
      },
      now: now(),
    }).catch((error: unknown) => {
      state.events.push(event({
        eventId: `${state.sessionId}.multiagent.ensure.failed`,
        kind: "runtime",
        status: state.status,
        message: error instanceof Error ? error.message : "multiagent session ensure failed",
        sessionId: state.sessionId,
        runtimeId: state.runtimeId,
        createdAt: now(),
        metadata: { code: "MULTIAGENT_SESSION_ENSURE_FAILED" },
      }));
    });
  }

  function approvalResolverForRun(): RuntimeApprovalResolver | undefined {
    return async (envelope) => {
      const profileResolution = autoApprovalResolutionForProfile(state.permissionProfile, envelope);
      if (profileResolution) return profileResolution;
      if (options.approvalResolver) return await options.approvalResolver(envelope);
      const featureKey = approvalFeatureKey(envelope);
      if (state.alwaysApprovedApprovalKeys.has(featureKey)) {
        return {
          status: "approved",
          resolvedBy: "application.approval.always",
          reason: `always approved ${approvalFeatureLabel(featureKey)}`,
          metadata: {
            approvalId: envelope.approvalId,
            featureKey,
          },
        };
      }

      const feature = approvalFeatureLabel(featureKey);
      state.status = "awaiting-approval";
      state.approvals.set(envelope.approvalId, {
        approvalId: envelope.approvalId,
        feature,
        featureKey,
        requestedScopes: envelope.requestedScopes,
        riskLevel: envelope.riskLevel,
        status: "pending",
        note: envelope.reason,
        updatedAt: now(),
      });
      publish({
        eventId: "application.approval.requested",
        kind: "approval",
        status: "awaiting-approval",
        message: `${envelope.approvalId}:${envelope.reason}`,
        metadata: {
          approvalId: envelope.approvalId,
          feature,
          featureKey,
          reason: envelope.reason,
          requestedScopes: envelope.requestedScopes,
          riskLevel: envelope.riskLevel,
        },
      });

      return await new Promise<RuntimeApprovalResolution>((resolve) => {
        state.pendingApprovalResolvers.set(envelope.approvalId, resolve);
      });
    };
  }

  function multiagentAgentAdapter(): NonNullable<BaseToolExecutorPort["agent"]> {
    const scheduleSpawnedAgentRun = (spawned: MultiagentSpawnResult): void => {
      const childSession = spawned.session;
      const initialMessage = spawned.initialMessage;
      if (state.multiagentBackgroundRuns.has(childSession.sessionId)) return;
      state.multiagentBackgroundRuns.add(childSession.sessionId);
      state.multiagentActiveSessions = Math.max(state.multiagentActiveSessions, state.multiagentBackgroundRuns.size + 1);
      state.sessions.set(childSession.sessionId, {
        sessionId: childSession.sessionId,
        name: childSession.name ?? childSession.sessionId.split(".").at(-1),
        workspaceRoot: childSession.workingDirectory,
        status: "running",
        lastActiveAt: now(),
        turns: 1,
      });
      publish({
        eventId: `${childSession.sessionId}.multiagent.spawned`,
        kind: "runtime",
        status: state.status,
        message: childSession.name ?? childSession.sessionId,
        sessionId: state.sessionId,
        metadata: {
          childSessionId: childSession.sessionId,
          childAgentId: childSession.agentId,
          childName: childSession.name,
          childDescription: childSession.description,
          childLifecycle: childSession.lifecycle,
          initialMessageId: initialMessage.messageId,
          workingDirectory: childSession.workingDirectory,
        },
      });
      void (async () => {
        let replyText = "";
        try {
          const compiled = await compileManifest("primary", { updateState: false });
          if (!compiled.ok) {
            replyText = `Child agent failed to compile: ${compiled.message}`;
            return;
          }
          let liveProvider: PraxisApplicationLiveProvider | undefined;
          if (state.mode === "live") {
            liveProvider = await options.liveProviderResolver?.(compiled.manifest, {
              sessionId: childSession.sessionId,
              runtimeId: `${state.runtimeId}.multiagent.${safeSessionName(childSession.sessionId)}`,
              turnId: initialMessage.messageId,
            });
          }
          const runtime = praxis.runtime.createPraxisRuntimeKernel({
            runtimeId: `${state.runtimeId}.multiagent.${safeSessionName(childSession.sessionId)}`,
          });
          const result = await runtime.runManifest(compiled.manifest, initialMessage.text, {
            runtimeId: `${state.runtimeId}.multiagent.${safeSessionName(childSession.sessionId)}`,
            sessionId: childSession.sessionId,
            dryRun: state.mode !== "live",
            allowProviderCall: state.mode === "live",
            allowToolExecution: state.mode === "live",
            auth: liveProvider?.auth,
            runtimeAuthResolver: liveProvider?.runtimeAuthResolver,
            authSelection: liveProvider?.authSelection,
            providerCaller: liveProvider?.providerCaller,
            openaiResponsesCaller: liveProvider?.openaiResponsesCaller,
            openaiChatCompletionsCaller: liveProvider?.openaiChatCompletionsCaller,
            anthropicMessagesCaller: liveProvider?.anthropicMessagesCaller,
            geminiGenerateContentTransport: liveProvider?.geminiGenerateContentTransport,
            exposeProviderTools: true,
            approvalResolver: approvalResolverForRun(),
            agentReviewResolver: options.agentReviewResolver,
            storage: {
              cwd: childSession.workingDirectory,
              workspaceRoot: path.join(project.projectRoot, ".raxode"),
              initMode: "on-run",
            },
            sandbox: { cwd: childSession.workingDirectory },
            baseToolAdapters: {
              agent: multiagentAgentAdapter(),
              ...(options.contextArtifactAdapters ?? {}),
              ...(options.baseToolAdapters ?? {}),
            },
            now,
          });
          if (result.ok) {
            replyText = result.finalOutput || "Child agent completed without a final message.";
          } else {
            replyText = `Child agent failed: ${result.error.message}`;
          }
        } catch (error) {
          replyText = `Child agent failed: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
          state.multiagentBackgroundRuns.delete(childSession.sessionId);
          state.multiagentActiveSessions = Math.max(1, state.multiagentBackgroundRuns.size + 1);
          const existingChildSession = state.sessions.get(childSession.sessionId);
          state.sessions.set(childSession.sessionId, {
            sessionId: childSession.sessionId,
            name: existingChildSession?.name ?? childSession.name ?? childSession.sessionId.split(".").at(-1),
            workspaceRoot: childSession.workingDirectory,
            status: "idle",
            lastActiveAt: now(),
            turns: existingChildSession?.turns ?? 1,
          });
          if (replyText.trim().length > 0) {
            await state.multiagentRuntime.message({
              fromSessionId: childSession.sessionId,
              toSessionId: initialMessage.fromSessionId,
              text: replyText,
              replyToMessageId: initialMessage.messageId,
              now: now(),
              metadata: {
                source: "application.multiagent.backgroundRun",
                childSessionId: childSession.sessionId,
              },
            });
          }
          publish({
            eventId: `${childSession.sessionId}.multiagent.completed`,
            kind: "runtime",
            status: state.status,
            message: childSession.name ?? childSession.sessionId,
            sessionId: state.sessionId,
            metadata: {
              childSessionId: childSession.sessionId,
              childAgentId: childSession.agentId,
              childName: childSession.name,
              childDescription: childSession.description,
              childLifecycle: childSession.lifecycle,
              initialMessageId: initialMessage.messageId,
            },
          });
        }
      })();
    };
    const wrap = async <T>(operation: () => Promise<T>): Promise<BaseToolExecutorResult> => {
      try {
        await state.multiagentRuntime.ensureSession({
          sessionId: state.sessionId,
          agentId: state.manifest?.identity.id ?? project.agentEntries.primary?.agentId ?? `agent.${project.projectId}.primary`,
          workingDirectory: state.cwd,
          status: state.status === "running" ? "running" : "idle",
          metadata: {
            applicationId,
            runtimeId: state.runtimeId,
            source: "application.basetool",
          },
          now: now(),
        });
        const output = await operation();
        const maybeSessionStatus = objectValue((output as { session?: unknown } | undefined)?.session)?.status;
        if (maybeSessionStatus === "idle" || maybeSessionStatus === "running") {
          state.multiagentActiveSessions = Math.max(state.multiagentActiveSessions, 2);
        }
        return { ok: true, output, value: output };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "MULTIAGENT_RUNTIME_FAILED",
            message: error instanceof Error ? error.message : "multiagent runtime failed",
            publicSafe: true,
          },
        };
      }
    };
    return {
      spawn: (request) => wrap(async () => {
        const spawned = await state.multiagentRuntime.spawn(request);
        scheduleSpawnedAgentRun(spawned);
        return spawned;
      }),
      message: (request) => wrap(() => state.multiagentRuntime.message(request)),
      inbox: (request) => wrap(() => state.multiagentRuntime.inbox(request)),
      list: (request) => wrap(() => state.multiagentRuntime.list(request)),
      inspect: (request) => wrap(() => state.multiagentRuntime.inspect(request)),
      wait: (request) => wrap(() => state.multiagentRuntime.wait(request)),
      stop: (request) => wrap(() => state.multiagentRuntime.stop(request)),
      kill: (request) => wrap(() => state.multiagentRuntime.kill(request)),
    };
  }

  function view(): PraxisApplicationViewModel {
    const agentId = state.manifest?.identity.id ?? project.descriptor.agent?.id ?? "agent.unknown";
    const context = estimateConversationContext({
      messages: state.conversationHistory.get(state.sessionId) ?? [],
      summary: state.conversationSummaries.get(state.sessionId),
      usage: state.usage,
      model: state.model,
    });
    const lines = [
      `application: ${applicationId}`,
      `project: ${project.projectId}`,
      `agent: ${agentId}`,
      `model: ${state.model.model}/${state.model.reasoningEffort}`,
      state.model.usableInputTokens
        ? `input budget: ${state.model.usableInputTokens}/${state.model.maxInputTokens} tokens @ ${Math.round((state.model.inputBudgetThreshold ?? 1) * 100)}%`
        : "input budget: unknown",
      `permission: ${state.permissionProfile}`,
      `tool profile: ${state.toolProfile}`,
      `workspace: ${state.cwd}`,
      `tools: ${summarizeToolCatalog(state.manifest, state.toolProfile).mounted}/${summarizeToolCatalog(state.manifest, state.toolProfile).total}`,
      state.finalOutput ? `final: ${state.finalOutput}` : `status: ${state.status}`,
    ];
    return {
      applicationId,
      projectId: project.projectId,
      runtimeId: state.runtimeId,
      sessionId: state.sessionId,
      agentId,
      agentEntries: summarizeAgentEntries(project),
      agents: { active: state.multiagentActiveSessions },
      status: state.status,
      workspaceRoot: state.cwd,
      mode: state.mode,
      model: state.model,
      auth: state.auth,
      permissionProfile: state.permissionProfile,
      toolProfile: state.toolProfile,
      foundationProject: state.foundationProject === undefined ? undefined : {
        projectId: state.foundationProject.project.projectId,
        kind: state.foundationProject.project.kind,
        workspaceRoot: state.foundationProject.project.mainWorkspaceRoot,
        sessionSqlitePath: state.foundationProject.paths.sessionSqlitePath,
        locked: state.foundationProject.lease !== undefined,
      },
      sessions: [...state.sessions.values()].sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt)),
      approvals: [...state.approvals.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      manifest: summarizeManifest(state.manifest),
      tools: summarizeToolCatalog(state.manifest, state.toolProfile),
      counters: {
        turns: state.turns,
        events: state.events.length,
        modelCalls: state.modelCalls,
        toolCalls: state.toolCalls,
        mainLoopSteps: state.mainLoopSteps,
      },
      usage: state.usage,
      context,
      finalOutput: state.finalOutput,
      error: state.error,
      lines,
      events: state.events,
    };
  }

  async function compileManifest(
    agentKey = "primary",
    compileOptions: { updateState?: boolean; agentOptions?: unknown } = {},
  ): Promise<{ ok: true; manifest: AgentManifest } | { ok: false; code: string; message: string }> {
    try {
      const entry = project.agentEntries[agentKey];
      if (!entry) {
        return { ok: false, code: "AGENT_ENTRY_NOT_FOUND", message: `agent entry was not found for ${agentKey}` };
      }
      const loadedSource = await loadAgentExport(project, {
        entryPath: entry.entryPath,
        exportName: entry.exportName,
      });
      const defaultAgentOptions = {
        policyProfile: state.permissionProfile,
        toolProfile: state.toolProfile,
        provider: state.model.provider,
        endpointShape: state.model.endpointShape,
        baseURL: state.model.baseURL,
        providerRoute: state.model.providerRoute,
        model: state.model.model,
        reasoningEffort: state.model.reasoningEffort,
        maxOutputTokens: state.model.maxOutputTokens,
      };
      const runtimeAgentOptions = typeof options.agentOptions === "object" && options.agentOptions !== null
        ? options.agentOptions as Record<string, unknown>
        : {};
      const commandAgentOptions = typeof compileOptions.agentOptions === "object" && compileOptions.agentOptions !== null
        ? compileOptions.agentOptions as Record<string, unknown>
        : {};
      const agentOptions = Object.keys(commandAgentOptions).length > 0
        ? { ...defaultAgentOptions, ...runtimeAgentOptions, ...commandAgentOptions }
        : { ...defaultAgentOptions, ...runtimeAgentOptions };
      const source = typeof loadedSource === "function"
        ? new (loadedSource as new (agentOptions: unknown) => unknown)(agentOptions)
        : loadedSource;
      const compiled = praxis.compileAgent(source as never);
      if (!compiled.ok) {
        return { ok: false, code: "AGENT_COMPILE_FAILED", message: compiled.error.message };
      }
      const validation = praxis.validateAgentManifest(compiled.manifest);
      if (!validation.ok) {
        return { ok: false, code: "AGENT_MANIFEST_INVALID", message: validation.error.message };
      }
      if (compileOptions.updateState ?? agentKey === "primary") {
        state.manifest = validation.manifest;
      }
      return { ok: true, manifest: validation.manifest };
    } catch (error) {
      return {
        ok: false,
        code: "AGENT_LOAD_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function submitAuxiliaryTask(command: Extract<PraxisApplicationCommand, { type: "application.invokeAuxiliaryTask" }>): Promise<PraxisApplicationCommandResult> {
    const parentSessionId = state.sessionId;
    const taskSessionId = command.sessionId?.trim()
      || `session.${applicationId}.aux.${safeSessionName(command.taskKind)}`;
    state.sessions.set(taskSessionId, {
      sessionId: taskSessionId,
      name: taskSessionId.split(".").at(-1),
      workspaceRoot: state.cwd,
      status: "running",
      lastActiveAt: now(),
      turns: 0,
    });
    const agentKey = command.agentKey ?? "tui";
    const agentId = command.agentId ?? project.agentEntries[agentKey]?.agentId ?? `agent.${project.projectId}.${agentKey}`;
    const correlationId = command.correlationId ?? `aux.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const timeoutMs = Math.max(1, command.timeoutMs ?? 1800);
    const started = publish({
      eventId: `${correlationId}.started`,
      kind: "model",
      status: state.status,
      message: `auxiliary task started: ${command.taskKind}`,
      sessionId: parentSessionId,
      metadata: {
        agentId,
        agentKey,
        taskKind: command.taskKind,
        schemaVersion: command.schemaVersion,
        correlationId,
        auxiliarySessionId: taskSessionId,
        timeoutMs,
      },
    });

    const compiled = await compileManifest(agentKey, {
      updateState: false,
      agentOptions: {
        model: command.model,
        reasoningEffort: command.reasoningEffort,
        timeoutMs,
      },
    });
    if (!compiled.ok) {
      const failed = publish({
        eventId: `${correlationId}.failed`,
        kind: "error",
        status: state.status,
        message: compiled.message,
        sessionId: parentSessionId,
        metadata: {
          code: compiled.code,
          agentId,
          agentKey,
          taskKind: command.taskKind,
          correlationId,
        },
      });
      return { ok: false, view: view(), events: [started, failed], error: { code: compiled.code, message: compiled.message } };
    }

    let liveProvider: PraxisApplicationLiveProvider | undefined;
    if ((command.mode ?? state.mode) === "live") {
      try {
        liveProvider = await options.liveProviderResolver?.(compiled.manifest, {
          sessionId: taskSessionId,
          runtimeId: state.runtimeId,
          turnId: correlationId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = publish({
          eventId: `${correlationId}.failed`,
          kind: "error",
          status: state.status,
          message,
          sessionId: parentSessionId,
          metadata: {
            code: "AUXILIARY_PROVIDER_RESOLUTION_FAILED",
            agentId,
            agentKey,
            taskKind: command.taskKind,
            correlationId,
          },
        });
        return { ok: false, view: view(), events: [started, failed], error: { code: "AUXILIARY_PROVIDER_RESOLUTION_FAILED", message } };
      }
    }

    const taskText = JSON.stringify({
      taskKind: command.taskKind,
      schemaVersion: command.schemaVersion,
      input: command.input,
    });
    try {
      const runtime = praxis.runtime.createPraxisRuntimeKernel({
        runtimeId: `${state.runtimeId}.aux.${safeSessionName(command.taskKind)}`,
      });
      if (state.cancelledAuxiliaryTasks.has(correlationId)) {
        throw new Error(`auxiliary task cancelled: ${correlationId}`);
      }
      const result = await withTimeout({
        promise: runtime.runManifest(compiled.manifest, taskText, {
          runtimeId: `${state.runtimeId}.aux.${safeSessionName(command.taskKind)}`,
          sessionId: taskSessionId,
          dryRun: (command.mode ?? state.mode) !== "live",
          allowProviderCall: (command.mode ?? state.mode) === "live",
          allowToolExecution: false,
          auth: liveProvider?.auth,
          runtimeAuthResolver: liveProvider?.runtimeAuthResolver,
          authSelection: liveProvider?.authSelection,
          providerCaller: liveProvider?.providerCaller,
          openaiResponsesCaller: liveProvider?.openaiResponsesCaller,
          openaiChatCompletionsCaller: liveProvider?.openaiChatCompletionsCaller,
          anthropicMessagesCaller: liveProvider?.anthropicMessagesCaller,
          geminiGenerateContentTransport: liveProvider?.geminiGenerateContentTransport,
          exposeProviderTools: false,
          approvalResolver: approvalResolverForRun(),
          agentReviewResolver: options.agentReviewResolver,
          baseToolAdapters: {
            agent: multiagentAgentAdapter(),
            ...(options.contextArtifactAdapters ?? {}),
            ...(options.baseToolAdapters ?? {}),
          },
          storage: {
            cwd: state.cwd,
            workspaceRoot: path.join(project.projectRoot, ".raxode"),
            initMode: "on-run",
          },
          sandbox: { cwd: state.cwd },
          now,
        }),
        timeoutMs,
        message: `auxiliary task timed out after ${timeoutMs}ms`,
      });
      if (!result.ok) {
        const failed = publish({
          eventId: `${correlationId}.failed`,
          kind: "error",
          status: state.status,
          message: result.error.message,
          sessionId: parentSessionId,
          metadata: {
            code: result.error.code,
            agentId,
            agentKey,
            taskKind: command.taskKind,
            correlationId,
          },
        });
        return { ok: false, view: view(), events: [started, failed], error: result.error };
      }
      if (state.cancelledAuxiliaryTasks.has(correlationId)) {
        throw new Error(`auxiliary task cancelled: ${correlationId}`);
      }
      const output = parseAuxiliaryTaskOutput(result.finalOutput, command.schemaVersion);
      const completed = publish({
        eventId: `${correlationId}.completed`,
        kind: "model",
        status: state.status,
        message: `auxiliary task completed: ${command.taskKind}`,
        sessionId: parentSessionId,
        metadata: {
          agentId,
          agentKey,
          taskKind: command.taskKind,
          schemaVersion: command.schemaVersion,
          correlationId,
          auxiliarySessionId: taskSessionId,
        },
      });
      return { ok: true, view: view(), events: [started, completed], output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = publish({
        eventId: `${correlationId}.failed`,
        kind: "error",
        status: state.status,
        message,
        sessionId: parentSessionId,
        metadata: {
          code: "AUXILIARY_TASK_FAILED",
          agentId,
          agentKey,
          taskKind: command.taskKind,
          correlationId,
        },
      });
      return { ok: false, view: view(), events: [started, failed], error: { code: "AUXILIARY_TASK_FAILED", message } };
    }
  }

  async function submitTurn(command: Extract<PraxisApplicationCommand, { type: "application.submitTurn" }>): Promise<PraxisApplicationCommandResult> {
    applyCommandSession(command.sessionId);
    state.status = "running";
    state.mode = command.mode ?? state.mode;
    state.cwd = path.resolve(command.input.cwd ?? state.cwd);
    state.turns += 1;
    const turnId = `turn.${state.turns}`;
    const historyBeforeTurn = state.conversationHistory.get(state.sessionId) ?? [];
    const summaryBeforeTurn = state.conversationSummaries.get(state.sessionId);
    const preparedHistory = prepareHistoryForTurn({
      currentUserText: command.input.text,
      history: historyBeforeTurn,
      summary: summaryBeforeTurn,
      attachments: command.input.attachments,
      model: state.model,
      previousUsage: state.usage,
      now: now(),
    });
    if (preparedHistory.compacted) {
      state.conversationHistory.set(state.sessionId, preparedHistory.history);
      if (preparedHistory.summary !== undefined) {
        state.conversationSummaries.set(state.sessionId, preparedHistory.summary);
      } else {
        state.conversationSummaries.delete(state.sessionId);
      }
      publish({
        eventId: `${turnId}.context.compacted`,
        kind: "runtime",
        status: "running",
        message: "application context compacted before provider call",
        turnId,
        metadata: {
          phase: "pre-turn",
          reason: preparedHistory.reason,
          beforeTokens: preparedHistory.beforeTokens,
          afterTokens: preparedHistory.afterTokens,
          limit: preparedHistory.limit,
          keptMessages: preparedHistory.history.length,
          compactedMessages: preparedHistory.summary?.compactedMessages ?? 0,
        },
      });
    }
    const taskText = buildCurrentTaskText({
      currentUserText: command.input.text,
      attachments: command.input.attachments,
    });
    const conversationWindow = applicationHistoryToConversationWindow(preparedHistory.history);
    const sessionSummary = applicationSummaryToPromptContextSummary(state.sessionId, preparedHistory.summary);
    const turnEventStartIndex = state.events.length;
    publish({
      eventId: `${turnId}.submitted`,
      kind: "conversation",
      status: "running",
      message: command.input.text,
      turnId,
      metadata: {
        attachments: command.input.attachments?.length ?? 0,
        historyMessages: preparedHistory.history.length,
        contextTokens: preparedHistory.afterTokens,
        compactedBeforeTurn: preparedHistory.compacted,
      },
    });

    const compiled = await compileManifest();
    if (!compiled.ok) {
      state.status = "failed";
      state.error = { code: compiled.code, message: compiled.message };
      const failed = publish({
        eventId: `${turnId}.failed`,
        kind: "error",
        status: "failed",
        message: compiled.message,
        turnId,
        metadata: { code: compiled.code },
      });
      return { ok: false, view: view(), events: [failed], error: state.error };
    }
    await safeRefreshAuthState();

    publish({
      eventId: `${turnId}.manifest.ready`,
      kind: "runtime",
      status: "running",
      message: `manifest ready: ${compiled.manifest.identity.id}`,
      turnId,
      metadata: {
        manifestId: compiled.manifest.manifestId,
        manifestHash: compiled.manifest.manifestHash,
        mountedTools: compiled.manifest.harness.tools.length,
      },
    });

    let liveProvider: PraxisApplicationLiveProvider | undefined;
    let emitTextDelta: ((delta: string, metadata?: Readonly<Record<string, unknown>>) => void) | undefined;
    let emitProviderStreamEvent: ((event: Readonly<Record<string, unknown>>) => void) | undefined;
    if (state.mode === "live") {
      try {
        let streamSequence = 0;
        let emittedAssistantText = "";
        emitTextDelta = (delta, metadata) => {
          if (delta.length === 0) return;
          if (metadata?.source === "model_tool_preamble" && emittedAssistantText.includes(delta)) {
            return;
          }
          emittedAssistantText += delta;
          streamSequence += 1;
          publish({
            eventId: `${turnId}.stream.${streamSequence}`,
            kind: "stream",
            status: "running",
            message: delta,
            turnId,
            metadata: {
              ...(metadata ?? {}),
              sequence: streamSequence,
              channel: "assistant",
            },
          });
        };
        emitProviderStreamEvent = (event) => {
          streamSequence += 1;
          const message = typeof event.argumentsDelta === "string"
            ? event.argumentsDelta
            : typeof event.arguments === "string"
              ? event.arguments
              : typeof event.providerToolName === "string"
                ? event.providerToolName
                : typeof event.phase === "string"
                  ? event.phase
                  : "provider stream event";
          publish({
            eventId: `${turnId}.stream.${streamSequence}`,
            kind: "stream",
            status: "running",
            message,
            turnId,
            metadata: {
              ...event,
              sequence: streamSequence,
            },
          });
        };
        liveProvider = await options.liveProviderResolver?.(compiled.manifest, {
          sessionId: state.sessionId,
          runtimeId: state.runtimeId,
          turnId,
          onTextDelta: emitTextDelta,
          onProviderStreamEvent: emitProviderStreamEvent,
        });
      } catch (error) {
        state.status = "failed";
        state.error = {
          code: "LIVE_PROVIDER_RESOLUTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
        const failed = publish({
          eventId: `${turnId}.failed`,
          kind: "error",
          status: "failed",
          message: state.error.message,
          turnId,
          metadata: { code: state.error.code },
        });
        return { ok: false, view: view(), events: [failed], error: state.error };
      }
    }

    const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId: state.runtimeId });
    const emittedToolProgress = new Set<string>();
    const openAIResponsesRoute = openAIResponsesRouteFor(liveProvider);
    const nativeAdapterAuth = liveProviderAuthSupplier(liveProvider);
    const mountOpenAIResponsesNativeAdapters = openAIResponsesRoute !== undefined && liveProviderHasAuthSource(liveProvider);
    const result = await runtime.runManifest(compiled.manifest, taskText, {
      runtimeId: state.runtimeId,
      sessionId: state.sessionId,
      dryRun: state.mode !== "live",
      allowProviderCall: state.mode === "live",
      allowToolExecution: state.mode === "live",
      auth: liveProvider?.auth,
      runtimeAuthResolver: liveProvider?.runtimeAuthResolver,
      authSelection: liveProvider?.authSelection,
      providerCaller: liveProvider?.providerCaller,
      openaiResponsesCaller: liveProvider?.openaiResponsesCaller,
      openaiChatCompletionsCaller: liveProvider?.openaiChatCompletionsCaller,
      anthropicMessagesCaller: liveProvider?.anthropicMessagesCaller,
      geminiGenerateContentTransport: liveProvider?.geminiGenerateContentTransport,
      previousProviderResponse: state.lastProviderResponseBySession.get(state.sessionId),
      exposeProviderTools: true,
      toolContextSelection: state.toolContextSelections.get(state.sessionId),
      toolContextUsage: state.toolContextUsage.get(state.sessionId),
      conversationWindow,
      sessionSummary,
      approvalResolver: approvalResolverForRun(),
      agentReviewResolver: options.agentReviewResolver,
      storage: {
        cwd: state.cwd,
        workspaceRoot: path.join(project.projectRoot, ".raxode"),
        initMode: "on-run",
      },
      sandbox: { cwd: state.cwd },
      baseToolAdapters: {
        agent: multiagentAgentAdapter(),
        ...(options.contextArtifactAdapters ?? {}),
        ...(options.baseToolAdapters ?? {}),
        ...(mountOpenAIResponsesNativeAdapters
        ? {
          network: {
            ...(options.baseToolAdapters?.network ?? {}),
            nativeWebSearch: createProviderNativeSearchAdapter({
              auth: nativeAdapterAuth,
              route: openAIResponsesRoute!,
              runtimeId: state.runtimeId,
            }),
          },
          media: {
            ...(options.baseToolAdapters?.media ?? {}),
            transformMedia: createOpenAIResponsesImageVisionAdapter({
              auth: nativeAdapterAuth,
              route: openAIResponsesRoute!,
              runtimeId: state.runtimeId,
              model: state.model.model,
              attachments: command.input.attachments,
            }),
          },
        }
        : {}),
      },
      onModelCallProgress: (progress) => {
        const comparedProgress = progressWithSessionCacheComparison(state, progress);
        rememberProviderResponseForSession(state, comparedProgress);
        publish(createModelProgressEvent({
          progress: comparedProgress,
          turnId,
          status: "running",
          model: state.model,
        }));
      },
      onToolCallProgress: (progress) => {
        emittedToolProgress.add(toolProgressKey(progress));
        const event = publish(createToolProgressEvent({
          progress,
          turnId,
          status: "running",
        }));
        void options.onApplicationToolEvent?.(event);
      },
      onTextDelta: emitTextDelta,
      now,
    });
    applyRunResult(state, result);
    rememberToolContextFromRun(state, result);
    if (result.ok && result.toolCalls.length > 0) {
      for (const toolCall of result.toolCalls) {
        const phase = toolCall.ok ? "completed" : "failed";
        const progress: AgentToolCallProgressEvent = { phase, record: toolCall };
        if (emittedToolProgress.has(toolProgressKey(progress))) continue;
        publish(createToolProgressEvent({
          progress,
          turnId,
          status: state.status,
        }));
      }
    }
    const turnLedgerMessages = applicationLedgerMessagesFromEvents({
      events: state.events.slice(turnEventStartIndex),
      turnId,
    });
    const compactedHistory = compactConversationHistory({
      messages: [
      ...preparedHistory.history,
      {
        role: "user",
        text: command.input.text,
        turnId,
        createdAt: now(),
        messageId: `${turnId}.user`,
        metadata: {
          source: "application.ledger.user",
        },
      },
      ...turnLedgerMessages,
      {
        role: "assistant",
        text: result.ok ? result.finalOutput : result.error.message,
        turnId,
        createdAt: now(),
        messageId: `${turnId}.assistant.final`,
        causedBy: turnLedgerMessages.length > 0 ? turnLedgerMessages.at(-1)?.messageId : `${turnId}.submitted`,
        metadata: {
          source: "application.ledger.assistantFinal",
        },
        status: result.ok ? "completed" : "failed",
      },
      ],
      previousSummary: preparedHistory.summary,
      now: now(),
    });
    state.conversationHistory.set(state.sessionId, compactedHistory.messages);
    if (compactedHistory.summary !== undefined) {
      state.conversationSummaries.set(state.sessionId, compactedHistory.summary);
    } else {
      state.conversationSummaries.delete(state.sessionId);
    }
    const done = publish({
      eventId: `${turnId}.${result.ok ? "completed" : "failed"}`,
      kind: result.ok ? "final" : "error",
      status: result.ok ? "completed" : "failed",
      message: result.ok ? result.finalOutput : result.error.message,
      turnId,
      metadata: {
        modelCalls: state.modelCalls,
        toolCalls: state.toolCalls,
        mainLoopSteps: state.mainLoopSteps,
      },
    });
    return result.ok
      ? { ok: true, view: view(), events: [done] }
      : { ok: false, view: view(), events: [done], error: state.error ?? { code: "RUNTIME_FAILED", message: "runtime failed" } };
  }

  return {
    applicationId,
    projectId: project.projectId,
    getView: view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(command): Promise<PraxisApplicationCommandResult> {
      if (command.type !== "application.createSession") {
        applyCommandSession(commandSessionId(command));
      }
      await safeRefreshAuthState();
      switch (command.type) {
        case "application.start": {
          applyCommandSession(command.sessionId);
          state.cwd = path.resolve(command.cwd ?? state.cwd);
          state.mode = command.mode ?? state.mode;
          const compiled = await compileManifest();
          if (!compiled.ok) {
            state.status = "failed";
            state.error = { code: compiled.code, message: compiled.message };
            const failed = publish({
              eventId: "application.start.failed",
              kind: "error",
              status: "failed",
              message: compiled.message,
              metadata: { code: compiled.code },
            });
            return { ok: false, view: view(), events: [failed], error: state.error };
          }
          state.status = "ready";
          await safeRefreshAuthState();
          const ready = publish({
            eventId: "application.ready",
            kind: "lifecycle",
            status: "ready",
            message: "application runtime is ready",
            metadata: {
              manifestId: compiled.manifest.manifestId,
              mountedTools: compiled.manifest.harness.tools.length,
            },
          });
          return { ok: true, view: view(), events: [ready] };
        }
        case "application.submitTurn":
          return await submitTurn(command);
        case "application.invokeAuxiliaryTask":
          return await submitAuxiliaryTask(command);
        case "application.cancelAuxiliaryTask": {
          applyCommandSession(command.sessionId);
          state.cancelledAuxiliaryTasks.add(command.correlationId);
          const cancelled = publish({
            eventId: `${command.correlationId}.cancelled`,
            kind: "runtime",
            status: state.status,
            message: command.reason ?? `auxiliary task cancelled: ${command.correlationId}`,
            metadata: {
              correlationId: command.correlationId,
              auxiliary: true,
            },
          });
          return { ok: true, view: view(), events: [cancelled] };
        }
        case "application.switchWorkspace": {
          applyCommandSession(command.sessionId);
          state.cwd = path.resolve(command.cwd);
          const switched = publish({
            eventId: "application.workspace.switched",
            kind: "workspace",
            status: state.status,
            message: state.cwd,
          });
          return { ok: true, view: view(), events: [switched] };
        }
        case "application.changeModel": {
          applyCommandSession(command.sessionId);
          state.model = {
            ...createApplicationModelState({
              model: command.model,
              reasoningEffort: command.reasoningEffort ?? state.model.reasoningEffort,
              provider: command.provider ?? state.model.provider,
              endpointShape: command.endpointShape ?? state.model.endpointShape,
              baseURL: command.baseURL ?? state.model.baseURL,
              providerRoute: command.providerRoute ?? state.model.providerRoute,
              maxOutputTokens: command.maxOutputTokens ?? state.model.maxOutputTokens,
            }),
          };
          await safeRefreshAuthState();
          const changed = publish({
            eventId: "application.model.changed",
            kind: "model",
            status: state.status,
            message: `${state.model.model}/${state.model.reasoningEffort}`,
          });
          return { ok: true, view: view(), events: [changed] };
        }
        case "application.changePermissionProfile": {
          applyCommandSession(command.sessionId);
          state.permissionProfile = command.profile;
          const changed = publish({
            eventId: "application.permission.changed",
            kind: "permission",
            status: state.status,
            message: command.profile,
          });
          return { ok: true, view: view(), events: [changed] };
        }
        case "application.changeToolProfile": {
          applyCommandSession(command.sessionId);
          state.toolProfile = command.profile;
          const changed = publish({
            eventId: "application.toolProfile.changed",
            kind: "tool",
            status: state.status,
            message: command.profile,
          });
          return { ok: true, view: view(), events: [changed] };
        }
        case "application.interrupt": {
          applyCommandSession(command.sessionId);
          state.status = "ready";
          const interrupted = publish({
            eventId: "application.interrupted",
            kind: "lifecycle",
            status: "ready",
            message: command.reason ?? "interrupted",
          });
          return { ok: true, view: view(), events: [interrupted] };
        }
        case "application.resume": {
          applyCommandSession(command.sessionId);
          state.status = "ready";
          const resumed = publish({
            eventId: "application.resumed",
            kind: "lifecycle",
            status: "ready",
            message: "session resumed",
          });
          return { ok: true, view: view(), events: [resumed] };
        }
        case "application.createSession": {
          const createdSessionId = command.sessionId?.trim()
            || `session.${applicationId}.${safeSessionName(command.name ?? String(state.sessions.size + 1))}`;
          state.sessionId = createdSessionId;
          if (command.cwd) state.cwd = path.resolve(command.cwd);
          state.status = "ready";
          state.sessions.set(state.sessionId, {
            sessionId: state.sessionId,
            name: command.name?.trim() || state.sessionId.split(".").at(-1),
            workspaceRoot: state.cwd,
            status: state.status,
            lastActiveAt: now(),
            turns: state.turns,
          });
          if (state.foundationProject !== undefined) {
            await praxis.runtime.session.createPraxisSessionManager(state.foundationProject).create({
              sessionId: state.sessionId,
              title: command.name,
              now: now(),
              metadata: { source: "application.createSession" },
            });
          }
          await safeRefreshAuthState();
          const created = publish({
            eventId: "application.session.created",
            kind: "lifecycle",
            status: "ready",
            message: state.sessionId,
          });
          return { ok: true, view: view(), events: [created] };
        }
        case "application.renameSession": {
          applyCommandSession(command.sessionId);
          const current = state.sessions.get(state.sessionId);
          state.sessions.set(state.sessionId, {
            sessionId: state.sessionId,
            name: command.name.trim(),
            workspaceRoot: current?.workspaceRoot ?? state.cwd,
            status: current?.status ?? state.status,
            lastActiveAt: now(),
            turns: current?.turns ?? state.turns,
          });
          const renamed = publish({
            eventId: "application.session.renamed",
            kind: "lifecycle",
            status: state.status,
            message: `${state.sessionId}:${command.name.trim()}`,
          });
          return { ok: true, view: view(), events: [renamed] };
        }
        case "application.rewind": {
          applyCommandSession(command.sessionId);
          const rewound = publish({
            eventId: "application.rewind.planned",
            kind: "runtime",
            status: state.status,
            message: command.turnId ?? String(command.turnIndex ?? "latest"),
          });
          return { ok: true, view: view(), events: [rewound] };
        }
        case "application.approvalDecision": {
          applyCommandSession(command.sessionId);
          const existing = state.approvals.get(command.approvalId);
          if (command.decision === "approve_always" && existing?.featureKey) {
            state.alwaysApprovedApprovalKeys.add(existing.featureKey);
          }
          state.approvals.set(command.approvalId, {
            ...existing,
            approvalId: command.approvalId,
            decision: command.decision,
            status: "decided",
            note: command.note,
            updatedAt: now(),
          });
          const resolver = state.pendingApprovalResolvers.get(command.approvalId);
          if (resolver) {
            state.pendingApprovalResolvers.delete(command.approvalId);
            state.status = "running";
            resolver({
              status: command.decision === "reject" ? "denied" : "approved",
              resolvedBy: "application.approvalDecision",
              reason: command.note ?? command.decision,
              metadata: {
                approvalId: command.approvalId,
                decision: command.decision,
                featureKey: existing?.featureKey,
              },
            });
          }
          const approval = publish({
            eventId: "application.approval.decided",
            kind: "approval",
            status: state.status,
            message: `${command.approvalId}:${command.decision}`,
            metadata: {
              approvalId: command.approvalId,
              decision: command.decision,
              note: command.note,
            },
          });
          return { ok: true, view: view(), events: [approval] };
        }
        case "application.requestApproval": {
          applyCommandSession(command.sessionId);
          state.status = "awaiting-approval";
          state.approvals.set(command.approvalId, {
            approvalId: command.approvalId,
            status: "pending",
            note: command.reason,
            updatedAt: now(),
          });
          const requested = publish({
            eventId: "application.approval.requested",
            kind: "approval",
            status: "awaiting-approval",
            message: `${command.approvalId}:${command.reason}`,
            metadata: {
              approvalId: command.approvalId,
              reason: command.reason,
            },
          });
          return { ok: true, view: view(), events: [requested] };
        }
        case "application.close": {
          applyCommandSession(command.sessionId);
          state.status = "closed";
          await state.foundationProject?.release();
          const closed = publish({
            eventId: "application.closed",
            kind: "lifecycle",
            status: "closed",
            message: "application runtime closed",
          });
          return { ok: true, view: view(), events: [closed] };
        }
      }
    },
  };
}

export async function createApplicationProjectRuntime(
  projectRoot: string,
  options: CreateApplicationProjectRuntimeOptions = {},
): Promise<
  | { ok: true; runtime: PraxisApplicationRuntime }
  | { ok: false; error: { code: string; message: string } }
> {
  const loaded = await loadApplicationProject(projectRoot);
  if (!loaded.ok) return loaded;
  const foundationProject = options.foundationProject ?? (
    options.openFoundationProject === true
      ? (await praxis.runtime.project.open({
        cwd: loaded.project.projectRoot,
        kind: "chat",
        mode: "open-or-create",
        runtimeId: options.runtimeId,
        ownerId: options.applicationId ?? loaded.project.applicationId,
      }))
      : undefined
  );
  if (foundationProject !== undefined && !("kind" in foundationProject)) {
    if (!foundationProject.ok) {
      return {
        ok: false,
        error: foundationProject.error,
      };
    }
  }
  return {
    ok: true,
    runtime: createPraxisApplicationRuntime({
      ...options,
      project: loaded.project,
      cwd: options.cwd ?? loaded.project.projectRoot,
      foundationProject: foundationProject === undefined
        ? undefined
        : "kind" in foundationProject
          ? foundationProject
          : foundationProject.runtime,
    }),
  };
}
