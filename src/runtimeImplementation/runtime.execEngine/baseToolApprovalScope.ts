/*
 * 文件定位：Agent 运行态实现层 / BaseTool 审批作用域。
 * 核心目的：把“第一次问，以后不问”的人类审批缓存限定在 session 内的稳定 scope key。
 * 边界：只计算 public-safe scope，不执行工具，不读取目标文件内容。
 */

import { createHash } from "node:crypto";

import type {
  RuntimeApprovalRecord,
  RuntimeSessionStateEventStore,
} from "../runtimeSessionStateEventStore.js";

export type BaseToolApprovalScope = {
  kind: "runtime.execEngine.baseTool.approvalScope";
  toolId: string;
  scopeKey: string;
  scopeKind:
    | "none"
    | "tool"
    | "path"
    | "search"
    | "domain"
    | "patch-files"
    | "command"
    | "process"
    | "agent"
    | "mcp"
    | "registered-source";
  humanReadable: string;
  publicSafe: true;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalize(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, " ") ?? "";
}

function normalizedNumberOrText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return normalize(text(value));
}

function domainFromUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function patchFiles(patch: string | undefined): readonly string[] {
  if (patch === undefined) return [];
  const files = new Set<string>();
  for (const line of patch.split(/\r?\n/u)) {
    const addFile = line.match(/^\*\*\* Add File:\s+(.+)$/u)?.[1];
    const updateFile = line.match(/^\*\*\* Update File:\s+(.+)$/u)?.[1];
    const deleteFile = line.match(/^\*\*\* Delete File:\s+(.+)$/u)?.[1];
    const diffFile = line.match(/^diff --git a\/(.+?) b\/(.+)$/u)?.[2];
    const file = addFile ?? updateFile ?? deleteFile ?? diffFile;
    if (file !== undefined && file.trim().length > 0) files.add(file.trim());
  }
  return [...files].sort();
}

export function createBaseToolApprovalScope(input: {
  toolId: string;
  args?: Readonly<Record<string, unknown>>;
}): BaseToolApprovalScope {
  const toolId = input.toolId.trim();
  const args = input.args ?? {};

  if (toolId === "file.read") {
    const path = normalize(text(args.path));
    return scope(toolId, "path", path || "unknown-path");
  }
  if (toolId === "file.search") {
    const target = JSON.stringify({
      cwd: normalize(text(args.cwd)),
      glob: normalize(text(args.glob)),
      query: normalize(text(args.query)),
    });
    return scope(toolId, "search", shortHash(target), target);
  }
  if (toolId === "patch.apply") {
    const files = patchFiles(text(args.patch));
    const key = files.length === 0 ? shortHash(text(args.patch) ?? "") : shortHash(files.join("\n"));
    return scope(toolId, "patch-files", key, files.length === 0 ? "patch:unknown-files" : files.join(", "));
  }
  if (toolId === "web.fetch") {
    const domain = domainFromUrl(text(args.url)) ?? "unknown-domain";
    return scope(toolId, "domain", domain);
  }
  if (toolId === "web.search") {
    const query = normalize(text(args.query));
    return scope(toolId, "domain", `search:${shortHash(query)}`, query || "search:unknown-query");
  }
  if (toolId === "shell.run") {
    const command = normalize(text(args.command));
    return scope(toolId, "command", shortHash(command), command || "unknown-command");
  }
  if (toolId === "process.kill") {
    const processId = normalizedNumberOrText(args.processId);
    return scope(toolId, "process", processId || "unknown-process");
  }
  if (toolId === "agent.spawn") {
    const target = JSON.stringify({
      definition: normalize(text(args.agentDefinitionId)),
      lifecycle: normalize(text(args.lifecycle)),
      model: normalize(text(args.model)),
      task: normalize(text(args.task)),
      workingDirectory: normalize(text(args.workingDirectory)),
    });
    return scope(toolId, "agent", shortHash(target), target);
  }
  if (toolId === "agent.message") {
    const targetSession = normalize(text(args.toSessionId)) || "unknown-session";
    return scope(toolId, "agent", `message:${targetSession}`, targetSession);
  }
  if (toolId === "agent.inbox" || toolId === "agent.inspect" || toolId === "agent.stop" || toolId === "agent.kill") {
    const sessionId = normalize(text(args.sessionId)) || "unknown-session";
    return scope(toolId, "agent", sessionId);
  }
  if (toolId === "agent.list") {
    const projectId = normalize(text(args.projectId)) || "current-project";
    return scope(toolId, "agent", `list:${projectId}`, projectId);
  }
  if (toolId === "agent.wait") {
    const messageId = normalize(text(args.messageId)) || "unknown-message";
    return scope(toolId, "agent", `wait:${messageId}`, messageId);
  }
  if (toolId === "mcp.use") {
    const key = `${normalize(text(args.serverId)) || "default"}:${normalize(text(args.toolName)) || "unknown-tool"}`;
    return scope(toolId, "mcp", key);
  }
  if (toolId === "mcp.resources") {
    const key = `${normalize(text(args.serverId)) || "default"}:${normalize(text(args.operation)) || "unknown-operation"}:${normalize(text(args.uri)) || "*"}`;
    return scope(toolId, "mcp", key);
  }
  if (toolId === "mcp.prompts") {
    const key = `${normalize(text(args.serverId)) || "default"}:${normalize(text(args.operation)) || "unknown-operation"}:${normalize(text(args.name)) || "*"}`;
    return scope(toolId, "mcp", key);
  }
  if (toolId === "skill.load") {
    const key = normalize(text(args.name)) || normalize(text(args.path)) || "unknown-skill";
    return scope(toolId, "registered-source", key);
  }
  if (toolId === "context.load") {
    const kind = normalize(text(args.kind)) || "unknown-kind";
    const selector = normalize(text(args.ref)) || normalize(text(args.query)) || "unknown-selector";
    return scope(toolId, "registered-source", `${kind}:${selector}`, `${kind}:${selector}`);
  }
  if (toolId === "tool.discover" || toolId === "tool.describe") {
    const key = toolId === "tool.describe" ? normalize(text(args.toolId)) || "*" : normalize(text(args.query)) || "*";
    return scope(toolId, "tool", key);
  }

  return scope(toolId, "tool", toolId);
}

function scope(
  toolId: string,
  scopeKind: BaseToolApprovalScope["scopeKind"],
  key: string,
  humanReadable = key,
): BaseToolApprovalScope {
  return {
    kind: "runtime.execEngine.baseTool.approvalScope",
    toolId,
    scopeKind,
    scopeKey: `${toolId}:${scopeKind}:${key}`,
    humanReadable,
    publicSafe: true,
  };
}

export function approvalRecordMatchesScope(record: RuntimeApprovalRecord, approvalScopeKey: string): boolean {
  if (record.status !== "approved") return false;
  return isRecord(record.metadata) && record.metadata.approvalScopeKey === approvalScopeKey;
}

export async function hasApprovedBaseToolScope(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  approvalScopeKey: string;
}): Promise<boolean> {
  const snapshot = await input.store.readSession(input.sessionId);
  return snapshot.approvals.some((record) => approvalRecordMatchesScope(record, input.approvalScopeKey));
}

export const baseToolApprovalScopeDescriptor = {
  surface: "runtime.execEngine.baseToolApprovalScope",
  scopeLifetime: "session",
  publicSafe: true,
} as const;
