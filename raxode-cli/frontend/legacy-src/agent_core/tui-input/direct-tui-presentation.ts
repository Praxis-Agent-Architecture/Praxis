import stringWidth from "string-width";

import {
  getSelectionColumnsForRow,
  splitTextBySelectionColumns,
  type TextSelectionScope,
  type TextSelectionState,
} from "../../../tui-input/selection.js";
import type { SurfaceMessage } from "../surface/types.js";

export type DirectTuiConversationPhase = "intro" | "conversation";

export interface DirectTuiContextUsageSnapshot {
  promptTokens?: number;
  lastRequestInputTokens?: number;
  lastRequestTotalTokens?: number;
}

const DIRECT_TUI_CONTEXT_BASELINE_TOKENS = 12_000;

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

export function resolveDirectTuiContextUsedTokens(input: {
  snapshot?: DirectTuiContextUsageSnapshot | null;
  draftContextTokens?: number;
}): number {
  const providerTotalTokens = finiteNonNegativeNumber(input.snapshot?.lastRequestTotalTokens);
  const providerInputTokens = finiteNonNegativeNumber(input.snapshot?.lastRequestInputTokens);
  const promptTokens = finiteNonNegativeNumber(input.snapshot?.promptTokens);
  const draftTokens = finiteNonNegativeNumber(input.draftContextTokens) ?? 0;
  return (providerTotalTokens ?? providerInputTokens ?? promptTokens ?? 0) + draftTokens;
}

export function resolveDirectTuiContextRemainingPercent(used: number, total: number): number {
  if (total <= DIRECT_TUI_CONTEXT_BASELINE_TOKENS) {
    return 0;
  }
  const effectiveWindow = total - DIRECT_TUI_CONTEXT_BASELINE_TOKENS;
  const effectiveUsed = Math.max(0, used - DIRECT_TUI_CONTEXT_BASELINE_TOKENS);
  const remaining = Math.max(0, effectiveWindow - effectiveUsed);
  return Math.round(Math.max(0, Math.min(100, (remaining / effectiveWindow) * 100)));
}

export function formatDirectTuiContextRemainingPercent(used: number, total: number): string {
  return `${resolveDirectTuiContextRemainingPercent(used, total)}%`;
}

export function formatDirectTuiContextUsedPercent(used: number, total: number): string {
  return `${100 - resolveDirectTuiContextRemainingPercent(used, total)}%`;
}

export function hasDirectTuiFormalConversation(
  messages: readonly Pick<SurfaceMessage, "kind">[],
): boolean {
  return messages.some((message) => message.kind === "user");
}

export function resolveDirectTuiConversationPhase(input: {
  conversationActivated: boolean;
  messages: readonly Pick<SurfaceMessage, "kind">[];
}): DirectTuiConversationPhase {
  if (input.conversationActivated || hasDirectTuiFormalConversation(input.messages)) {
    return "conversation";
  }
  return "intro";
}

export function shouldRenderDirectTuiConversationHeader(input: {
  conversationActivated: boolean;
  messages: readonly Pick<SurfaceMessage, "kind">[];
  pendingSessionSwitch: boolean;
}): boolean {
  if (input.pendingSessionSwitch) {
    return false;
  }
  return resolveDirectTuiConversationPhase({
    conversationActivated: input.conversationActivated,
    messages: input.messages,
  }) === "intro" || input.messages.length > 0;
}

export function shouldBreakDirectTuiAssistantSegmentOnStageStart(stage?: string | null): boolean {
  const normalizedStage = stage?.trim();
  if (!normalizedStage) {
    return true;
  }
  if (normalizedStage === "core/run") {
    return false;
  }
  if (normalizedStage === "core/model.infer") {
    return false;
  }
  if (normalizedStage.startsWith("cmp/")) {
    return false;
  }
  return true;
}

export function resolveDirectTuiToolSummaryKey(input: {
  turnId: string;
  familyKey?: string | null;
  toolCallId?: string | null;
}): string {
  const normalizedToolCallId = input.toolCallId?.trim();
  if (normalizedToolCallId) {
    return `${input.turnId}:${normalizedToolCallId}`;
  }
  const normalizedFamilyKey = input.familyKey?.trim();
  return `${input.turnId}:${normalizedFamilyKey || "tool"}`;
}

function previewObjectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function previewStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function previewNumberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function previewStringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => previewStringValue(item) ?? [])
    : [];
}

function compactPreviewText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncatePreviewText(value: string, maxLength: number): string {
  const compacted = compactPreviewText(value);
  if (compacted.length <= maxLength) return compacted;
  const headLength = Math.max(0, Math.floor((maxLength - 15) / 2));
  const tailLength = Math.max(0, maxLength - 15 - headLength);
  return `${compacted.slice(0, headLength)} ...[truncated]... ${compacted.slice(-tailLength)}`;
}

function formatPreviewPathList(paths: readonly string[], maxItems = 4): string {
  const cleanPaths = paths.map((item) => item.trim()).filter((item) => item.length > 0);
  if (cleanPaths.length === 0) return "file";
  const shown = cleanPaths.slice(0, maxItems).join(", ");
  return cleanPaths.length > maxItems ? `${shown}, +${cleanPaths.length - maxItems} more` : shown;
}

function decodePreviewJsonStringFragment(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\"/gu, "\"")
      .replace(/\\\\/gu, "\\")
      .trim();
  }
}

function extractPreviewStringField(source: string | undefined | null, field: string): string | undefined {
  const text = source?.trim();
  if (!text) return undefined;
  const closedPattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u");
  const closed = text.match(closedPattern)?.[1];
  if (closed !== undefined) return previewStringValue(decodePreviewJsonStringFragment(closed));
  const openPattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)$`, "u");
  const open = text.match(openPattern)?.[1];
  return open === undefined ? undefined : previewStringValue(decodePreviewJsonStringFragment(open));
}

function extractPreviewNumberField(source: string | undefined | null, field: string): number | undefined {
  const text = source?.trim();
  if (!text) return undefined;
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "u"))?.[1];
  if (match === undefined) return undefined;
  const parsed = Number(match);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePreviewArguments(source: string | undefined | null): Record<string, unknown> | undefined {
  const text = source?.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return undefined;
  try {
    return previewObjectValue(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function flattenPreviewArguments(argumentsRecord: Record<string, unknown> | undefined): Record<string, unknown> {
  if (argumentsRecord === undefined) return {};
  const target = previewObjectValue(argumentsRecord.target);
  return target === undefined ? argumentsRecord : { ...argumentsRecord, ...target };
}

function previewToolIdFromProviderName(providerToolName?: string | null): string | undefined {
  const normalized = providerToolName?.trim();
  if (!normalized) return undefined;
  if (normalized === "praxis_ephemeral_procedure") return "praxis.ephemeralProcedure";
  if (normalized.startsWith("praxis_tool_")) {
    return normalized.slice("praxis_tool_".length).replace(/_/gu, ".");
  }
  return normalized.replace(/_/gu, ".");
}

function friendlyProviderToolName(providerToolName?: string | null): string {
  return previewToolIdFromProviderName(providerToolName) ?? "tool call";
}

function summarizeCodeToolPreview(input: {
  toolId: string;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  if (!input.toolId.startsWith("code.")) return undefined;
  const args = flattenPreviewArguments(input.argumentsRecord);
  const targetPath = previewStringValue(args.targetPath)
    ?? previewStringValue(args.path)
    ?? previewStringValue(args.filePath)
    ?? extractPreviewStringField(input.argumentsPreview, "targetPath")
    ?? extractPreviewStringField(input.argumentsPreview, "path")
    ?? extractPreviewStringField(input.argumentsPreview, "filePath");
  const targetPaths = [
    ...previewStringArrayValue(args.targetPaths),
    ...previewStringArrayValue(args.paths),
    ...previewStringArrayValue(args.files),
  ];
  const directoryPath = previewStringValue(args.directoryPath)
    ?? previewStringValue(args.workspaceRoot)
    ?? extractPreviewStringField(input.argumentsPreview, "directoryPath")
    ?? extractPreviewStringField(input.argumentsPreview, "workspaceRoot");
  const pathSummary = targetPaths.length > 0 ? formatPreviewPathList(targetPaths) : targetPath;
  switch (input.toolId) {
    case "code.scan": {
      const depth = previewNumberValue(args.depth) ?? extractPreviewNumberField(input.argumentsPreview, "depth");
      const maxEntries = previewNumberValue(args.maxEntries) ?? extractPreviewNumberField(input.argumentsPreview, "maxEntries");
      const detail = [
        depth !== undefined ? `depth ${depth}` : undefined,
        maxEntries !== undefined ? `up to ${maxEntries} entries` : undefined,
      ].filter((item): item is string => item !== undefined).join(", ");
      return `Scanning ${directoryPath ?? "."}${detail ? ` (${detail})` : ""}`;
    }
    case "code.read":
      return `Reading ${pathSummary ?? "file"}`;
    case "code.search.Ripgrep":
    case "code.search_Ripgrep": {
      const query = previewStringValue(args.query)
        ?? previewStringValue(args.pattern)
        ?? extractPreviewStringField(input.argumentsPreview, "query")
        ?? extractPreviewStringField(input.argumentsPreview, "pattern");
      return `Searching ${directoryPath ?? "."}${query ? ` for ${JSON.stringify(truncatePreviewText(query, 80))}` : ""}`;
    }
    case "code.overwrite":
      return `Writing ${targetPath ?? "file"}`;
    case "code.modify":
      return `Editing ${targetPath ?? "file"}`;
    case "code.replaceFile":
      return `Replacing ${targetPath ?? "file"}`;
    case "code.delete":
      return `Deleting from ${targetPath ?? "file"}`;
    case "code.format":
      return `Formatting ${targetPath ?? pathSummary ?? "file"}`;
    default:
      if (pathSummary) return `${input.toolId} on ${pathSummary}`;
      if (directoryPath) return `${input.toolId} in ${directoryPath}`;
      return undefined;
  }
}

function previewTextLineCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0) return 0;
  return value.split(/\r\n|\r|\n/u).length;
}

function previewRangeDeletionCount(value: unknown): number | undefined {
  const range = previewObjectValue(value);
  const startLine = previewNumberValue(range?.startLine) ?? previewNumberValue(range?.start);
  const endLine = previewNumberValue(range?.endLine) ?? previewNumberValue(range?.end);
  if (startLine === undefined || endLine === undefined || endLine < startLine) {
    return undefined;
  }
  return Math.floor(endLine - startLine + 1);
}

function formatCodePreviewDiffStats(input: {
  additions?: number;
  deletions?: number;
}): string | undefined {
  const additions = input.additions !== undefined && Number.isFinite(input.additions)
    ? Math.max(0, Math.floor(input.additions))
    : undefined;
  const deletions = input.deletions !== undefined && Number.isFinite(input.deletions)
    ? Math.max(0, Math.floor(input.deletions))
    : undefined;
  const parts = [
    additions !== undefined ? `+${additions}` : undefined,
    deletions !== undefined ? `-${deletions}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? `(${parts.join(" ")})` : undefined;
}

function resolveCodePreviewDiffStats(input: {
  toolId: string;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  if (!input.toolId.startsWith("code.")) return undefined;
  const args = flattenPreviewArguments(input.argumentsRecord);
  switch (input.toolId) {
    case "code.modify": {
      const searchText = previewStringValue(args.searchText)
        ?? extractPreviewStringField(input.argumentsPreview, "searchText");
      const replacementText = previewStringValue(args.replacementText)
        ?? extractPreviewStringField(input.argumentsPreview, "replacementText");
      return formatCodePreviewDiffStats({
        additions: previewTextLineCount(replacementText),
        deletions: previewTextLineCount(searchText),
      });
    }
    case "code.overwrite": {
      const content = previewStringValue(args.content)
        ?? extractPreviewStringField(input.argumentsPreview, "content");
      return formatCodePreviewDiffStats({
        additions: previewTextLineCount(content),
      });
    }
    case "code.replaceFile": {
      const newContent = previewStringValue(args.newContent)
        ?? extractPreviewStringField(input.argumentsPreview, "newContent");
      return formatCodePreviewDiffStats({
        additions: previewTextLineCount(newContent),
      });
    }
    case "code.delete":
      return formatCodePreviewDiffStats({
        deletions: previewRangeDeletionCount(args.range),
      });
    default:
      return undefined;
  }
}

function normalizeCodePreviewDiffStats(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^\((?:\+\d+|-\d+)(?:\s+(?:\+\d+|-\d+))*\)$/u.test(trimmed) ? trimmed : undefined;
}

const SHELL_FILE_WRITE_REDIRECTION_PATTERN = /(?:^|[\s;|&])(?:>|>>|1>|1>>)\s*(?!&|\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_CAT_WRITE_PATTERN = /(?:^|[\s;|&])cat\s+>\s*(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_CAT_HEREDOC_WRITE_PATTERN = /(?:^|[\s;|&])cat\b[^;&|]*<<[^;&|]*>\s*(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_TEE_WRITE_PATTERN = /(?:^|[\s;|&])tee\s+(?:-[a-zA-Z]*a[a-zA-Z]*\s+)?(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const SHELL_PROGRAMMATIC_FILE_WRITE_PATTERN =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|write_text|openSync\s*\([^)]*['"]w|open\s*\([^)]*['"]w)\b/u;
const SHELL_PROGRAMMATIC_FILE_WRITE_TARGET_PATTERN =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|write_text|openSync|open)\s*\(\s*['"]([^'"]+)['"]/u;

function compactShellPreviewSource(source: string): string {
  return source.replace(/\\\r?\n/gu, " ").replace(/\s+/gu, " ").trim();
}

function isAllowedTemporaryShellPreviewWriteTarget(target: string | undefined): boolean {
  if (target === undefined) return false;
  return target === "/dev/null"
    || target.startsWith("/tmp/")
    || target.startsWith("/var/tmp/")
    || target.startsWith("/run/user/");
}

function matchShellPreviewWorkspaceWriteTarget(pattern: RegExp, source: string): string | undefined {
  const match = pattern.exec(source);
  if (match === null) return undefined;
  const target = match[2];
  return isAllowedTemporaryShellPreviewWriteTarget(target) ? undefined : target;
}

function shellPreviewCommand(input: {
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  const args = flattenPreviewArguments(input.argumentsRecord);
  const commandArray = previewStringArrayValue(args.command);
  return previewStringValue(args.command)
    ?? (commandArray.length > 0 ? commandArray.join(" ") : undefined)
    ?? previewStringValue(args.script)
    ?? extractPreviewStringField(input.argumentsPreview, "command")
    ?? extractPreviewStringField(input.argumentsPreview, "script");
}

function shellPreviewWorkspaceWriteReason(command: string | undefined): string | undefined {
  if (command === undefined) return undefined;
  const compacted = compactShellPreviewSource(command);
  if (compacted.length === 0) return undefined;
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_CAT_WRITE_PATTERN, compacted) !== undefined) {
    return "cat redirection writes workspace files";
  }
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_CAT_HEREDOC_WRITE_PATTERN, compacted) !== undefined) {
    return "cat heredoc redirection writes workspace files";
  }
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_TEE_WRITE_PATTERN, compacted) !== undefined) {
    return "tee writes workspace files";
  }
  if (matchShellPreviewWorkspaceWriteTarget(SHELL_FILE_WRITE_REDIRECTION_PATTERN, compacted) !== undefined) {
    return "shell output redirection writes workspace files";
  }
  if (SHELL_PROGRAMMATIC_FILE_WRITE_PATTERN.test(compacted)) {
    const target = SHELL_PROGRAMMATIC_FILE_WRITE_TARGET_PATTERN.exec(compacted)?.[1];
    if (isAllowedTemporaryShellPreviewWriteTarget(target)) return undefined;
    return "ad-hoc shell scripts write workspace files";
  }
  return undefined;
}

function shellWorkspaceWriteBlockedLine(reason: string): string {
  return `${reason}; use code.overwrite, code.modify, or code.replaceFile for workspace file changes.`;
}

function summarizeShellToolPreview(input: {
  toolId: string;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string | undefined {
  if (!input.toolId.startsWith("shell.")) return undefined;
  const args = flattenPreviewArguments(input.argumentsRecord);
  const command = shellPreviewCommand(input);
  const cwd = previewStringValue(args.workingDirectory)
    ?? previewStringValue(args.cwd)
    ?? extractPreviewStringField(input.argumentsPreview, "workingDirectory")
    ?? extractPreviewStringField(input.argumentsPreview, "cwd");
  if (command) {
    const workspaceWriteReason = shellPreviewWorkspaceWriteReason(command);
    if (workspaceWriteReason !== undefined) {
      return shellWorkspaceWriteBlockedLine(workspaceWriteReason);
    }
    const verb = input.toolId === "shell.detachedExecution" || input.toolId === "shell.backgroundExecution"
      ? "Launching"
      : "Running";
    return `${verb} ${truncatePreviewText(command, 180)}${cwd ? ` in ${cwd}` : ""}`;
  }
  const executionId = previewStringValue(args.executionId)
    ?? previewStringValue(args.launchId)
    ?? extractPreviewStringField(input.argumentsPreview, "executionId")
    ?? extractPreviewStringField(input.argumentsPreview, "launchId");
  return executionId ? `${input.toolId} for ${executionId}` : undefined;
}

function summarizeProcedurePreview(input: {
  toolId: string;
  providerToolName?: string | null;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string[] | undefined {
  if (!isProcedureToolPreview(input)) {
    return undefined;
  }
  const purpose = previewStringValue(input.argumentsRecord?.purpose)
    ?? extractPreviewStringField(input.argumentsPreview, "purpose");
  const steps = Array.isArray(input.argumentsRecord?.steps)
    ? input.argumentsRecord.steps.flatMap((step) => {
      const stepRecord = previewObjectValue(step);
      return previewStringValue(stepRecord?.stepId)
        ?? previewStringValue(stepRecord?.baseToolId)
        ?? [];
    })
    : [];
  return [
    purpose ? `Composing procedure: ${truncatePreviewText(purpose, 160)}` : "Composing procedure",
    steps.length > 0 ? `Steps: ${formatPreviewPathList(steps, 3)}` : undefined,
  ].filter((line): line is string => line !== undefined);
}

function isProcedureToolPreview(input: {
  toolId: string;
  providerToolName?: string | null;
}): boolean {
  return input.toolId === "praxis.ephemeralProcedure"
    || input.providerToolName === "praxis_ephemeral_procedure";
}

function summarizeGenericToolPreview(input: {
  providerToolName?: string | null;
  argumentsRecord?: Record<string, unknown>;
  argumentsPreview?: string | null;
}): string {
  const args = flattenPreviewArguments(input.argumentsRecord);
  const command = previewStringValue(args.command) ?? extractPreviewStringField(input.argumentsPreview, "command");
  const query = previewStringValue(args.query) ?? extractPreviewStringField(input.argumentsPreview, "query");
  const url = previewStringValue(args.url) ?? extractPreviewStringField(input.argumentsPreview, "url");
  const target = command ?? query ?? url;
  return target
    ? truncatePreviewText(target, 180)
    : `Model is composing ${friendlyProviderToolName(input.providerToolName)}`;
}

export function resolveDirectTuiToolPreviewSummaryLines(input: {
  title: string;
  phase?: string | null;
  providerToolName?: string | null;
  capabilityKey?: string | null;
  argumentsPreview?: string | null;
  stableCodeDiffStats?: string | null;
}): string[] {
  const title = input.title.trim() || "Tool";
  const phase = input.phase?.trim() || "started";
  const toolId = input.capabilityKey?.trim()
    || previewToolIdFromProviderName(input.providerToolName)
    || "tool.call";
  const argumentsRecord = parsePreviewArguments(input.argumentsPreview);
  const isProcedurePreview = isProcedureToolPreview({ toolId, providerToolName: input.providerToolName });
  const shellWorkspaceWriteReason = isProcedurePreview
    ? undefined
    : shellPreviewWorkspaceWriteReason(shellPreviewCommand({
      argumentsRecord,
      argumentsPreview: input.argumentsPreview,
    }));
  const shellWorkspaceWriteBlocked = shellWorkspaceWriteReason !== undefined;
  const codePreviewDiffStats = resolveCodePreviewDiffStats({
    toolId,
    argumentsRecord,
    argumentsPreview: input.argumentsPreview,
  }) ?? normalizeCodePreviewDiffStats(input.stableCodeDiffStats);
  const procedureLines = summarizeProcedurePreview({
    toolId,
    providerToolName: input.providerToolName,
    argumentsRecord,
    argumentsPreview: input.argumentsPreview,
  });
  const actionLine = procedureLines?.[0]
    ?? (shellWorkspaceWriteReason !== undefined ? shellWorkspaceWriteBlockedLine(shellWorkspaceWriteReason) : undefined)
    ?? summarizeCodeToolPreview({ toolId, argumentsRecord, argumentsPreview: input.argumentsPreview })
    ?? summarizeShellToolPreview({ toolId, argumentsRecord, argumentsPreview: input.argumentsPreview })
    ?? summarizeGenericToolPreview({
      providerToolName: input.providerToolName,
      argumentsRecord,
      argumentsPreview: input.argumentsPreview,
    });
  const displayTitle = shellWorkspaceWriteBlocked && title === "Tool" ? "Shell" : title;
  const displayPhase = shellWorkspaceWriteBlocked
    ? "blocked"
    : phase === "done"
      ? "ready"
      : "composing";
  return [
    `${displayTitle} ${displayPhase}${codePreviewDiffStats ? ` ${codePreviewDiffStats}` : ""}`,
    actionLine,
    ...(procedureLines?.slice(1) ?? []),
  ];
}

export function isDirectTuiCodeDiffPreviewLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("@@")
    || /^[-+]\s*[0-9?]+\s+\|/u.test(trimmed)
    || trimmed === "... diff preview trimmed";
}

export function resolveDirectTuiToolSummaryResultLineLimit(input: {
  familyKey?: string | null;
  resultLines: readonly string[];
}): number {
  const familyKey = input.familyKey?.trim().toLowerCase();
  const hasCodeDiff = familyKey === "code" && input.resultLines.some(isDirectTuiCodeDiffPreviewLine);
  return hasCodeDiff ? 16 : 3;
}

export function isDirectTuiLiveToolSummaryState(summaryState: unknown): boolean {
  return summaryState === "active" || summaryState === "composing";
}

export function isDirectTuiCmpActivityStage(stage?: string | null): boolean {
  const normalizedStage = stage?.trim();
  if (!normalizedStage || !normalizedStage.startsWith("cmp/")) {
    return false;
  }
  return normalizedStage !== "cmp/infra_bootstrap";
}

export function createDirectTuiCmpActivityKey(input: {
  turnIndex?: number | null;
  stage?: string | null;
}): string | null {
  if (!isDirectTuiCmpActivityStage(input.stage)) {
    return null;
  }
  const normalizedTurnIndex = typeof input.turnIndex === "number" && Number.isFinite(input.turnIndex)
    ? input.turnIndex
    : 0;
  return `${normalizedTurnIndex}:${input.stage?.trim()}`;
}

export interface DirectTuiCmpStatusDescriptor {
  label: string;
  animated: boolean;
  tone: "muted" | "active" | "warning" | "danger";
}

export function deriveDirectTuiCmpStatusDescriptor(input: {
  activeStage?: string | null;
  snapshot?: {
    status?: string;
    readbackStatus?: string;
    emptyReason?: string;
  } | null;
}): DirectTuiCmpStatusDescriptor {
  const activeStage = input.activeStage?.trim();
  if (activeStage) {
    return {
      label: `CMP ${activeStage.replace(/^cmp\//u, "")} running`,
      animated: true,
      tone: "active",
    };
  }

  const readbackStatus = input.snapshot?.readbackStatus?.trim().toLowerCase();
  const status = input.snapshot?.status?.trim().toLowerCase();
  if (readbackStatus === "failed" || status === "failed") {
    return {
      label: "CMP readback failed",
      animated: false,
      tone: "danger",
    };
  }
  if (readbackStatus === "degraded" || status === "degraded") {
    return {
      label: "CMP readback degraded",
      animated: false,
      tone: "warning",
    };
  }
  if (readbackStatus === "ready" && status === "empty") {
    return {
      label: "CMP ready but empty",
      animated: false,
      tone: "muted",
    };
  }
  if (readbackStatus === "ready" || status === "ready") {
    return {
      label: "CMP ready",
      animated: false,
      tone: "muted",
    };
  }
  if (status === "booting") {
    return {
      label: "CMP warming up",
      animated: false,
      tone: "muted",
    };
  }
  return {
    label: "CMP status pending",
    animated: false,
    tone: "muted",
  };
}

export interface DirectTuiTextSelectionSegment {
  text: string;
  backgroundColor?: string;
}

export function applyDirectTuiTextSelectionToRenderSegments<
  TSegment extends DirectTuiTextSelectionSegment,
>(input: {
  text: string;
  segments?: readonly TSegment[];
  row: number;
  scope: TextSelectionScope;
  selection: TextSelectionState | null;
  selectionBackgroundColor: string;
}): TSegment[] | undefined {
  if (input.selection?.scope !== input.scope) {
    return input.segments ? [...input.segments] : undefined;
  }
  const lineWidth = Math.max(1, stringWidth(input.text));
  const range = getSelectionColumnsForRow(input.selection, input.row, lineWidth);
  if (!range || range.endColumnExclusive <= range.startColumn) {
    return input.segments ? [...input.segments] : undefined;
  }
  const sourceSegments: readonly TSegment[] = input.segments?.length
    ? input.segments
    : ([{ text: input.text }] as TSegment[]);
  const output: TSegment[] = [];
  let segmentColumn = 0;
  for (const segment of sourceSegments) {
    for (const piece of splitTextBySelectionColumns(segment.text, range, segmentColumn)) {
      output.push({
        ...segment,
        text: piece.text,
        backgroundColor: piece.selected ? input.selectionBackgroundColor : segment.backgroundColor,
      });
    }
    segmentColumn += stringWidth(segment.text);
  }
  return output;
}

export function resolveDirectTuiComposerSelectionTopRow(input: {
  transcriptViewportLineCount: number;
  overlayLineCount: number;
  pendingPreviewLineCount: number;
}): number {
  return Math.max(0, input.transcriptViewportLineCount)
    + 3
    + Math.max(0, input.overlayLineCount)
    + Math.max(0, input.pendingPreviewLineCount);
}

export type DirectTuiAssistantTurnResultAction =
  | { kind: "noop" }
  | { kind: "append"; text: string }
  | { kind: "update"; text: string; messageId: string };

export type DirectTuiAssistantDeltaAction =
  | { kind: "noop" }
  | { kind: "append"; text: string }
  | { kind: "delta"; textDelta: string; messageId: string }
  | { kind: "update"; text: string; messageId: string };

export interface DirectTuiStreamingAssistantText {
  messageId: string;
  turnId: string;
  text: string;
}

export function mergeDirectTuiStreamingAssistantLine(input: {
  transcriptLines: readonly string[];
  streamingAssistant?: DirectTuiStreamingAssistantText | null;
}): string[] {
  if (!input.streamingAssistant?.text) {
    return [...input.transcriptLines];
  }
  return [
    ...input.transcriptLines,
    `● ${input.streamingAssistant.text}`,
    "",
  ];
}

export function resolveDirectTuiAssistantDeltaAction(input: {
  decodedText: string;
  previousDisplayedText: string;
  activeMessageId?: string;
}): DirectTuiAssistantDeltaAction {
  if (!input.activeMessageId) {
    if (input.previousDisplayedText.length > 0 && input.decodedText.startsWith(input.previousDisplayedText)) {
      const textDelta = input.decodedText.slice(input.previousDisplayedText.length);
      if (!textDelta) {
        return { kind: "noop" };
      }
      return {
        kind: "append",
        text: textDelta,
      };
    }
    if (!input.decodedText) {
      return { kind: "noop" };
    }
    return {
      kind: "append",
      text: input.decodedText,
    };
  }
  if (!input.decodedText.startsWith(input.previousDisplayedText)) {
    return {
      kind: "update",
      text: input.decodedText,
      messageId: input.activeMessageId,
    };
  }
  const textDelta = input.decodedText.slice(input.previousDisplayedText.length);
  if (!textDelta) {
    return { kind: "noop" };
  }
  return {
    kind: "delta",
    textDelta,
    messageId: input.activeMessageId,
  };
}

export function resolveDirectTuiAssistantTurnResultAction(input: {
  finalAnswer: string | null;
  streamedText: string;
  activeMessageId?: string;
}): DirectTuiAssistantTurnResultAction {
  if (!input.finalAnswer) {
    return { kind: "noop" };
  }
  if (!input.activeMessageId) {
    if (input.streamedText.length > 0) {
      return { kind: "noop" };
    }
    return {
      kind: "append",
      text: input.finalAnswer,
    };
  }
  if (input.finalAnswer === input.streamedText) {
    return { kind: "noop" };
  }
  return {
    kind: "update",
    text: input.finalAnswer,
    messageId: input.activeMessageId,
  };
}
