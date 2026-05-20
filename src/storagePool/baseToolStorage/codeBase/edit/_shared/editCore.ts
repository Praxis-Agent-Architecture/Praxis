import { createHash } from "node:crypto";

import type { BaseToolLspTextEdit } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";

export type CodeEditGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CodeEditContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  guard?: CodeEditGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CodeEditReadResult = {
  content: string;
  truncated?: boolean;
  encoding?: string;
};

export type CodeEditWriteResult = {
  bytesWritten: number;
} & Readonly<Record<string, unknown>>;

export type CodeEditDeleteResult = {
  deleted: boolean;
};

export type CodeEditFormatResult = {
  content: string;
  editsCount: number;
};

export type CodeEditProvider = {
  readText?(request: {
    targetPath: string;
    encoding?: string;
    maxBytes?: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<CodeEditReadResult>;
  writeText?(request: {
    targetPath: string;
    content: string;
    encoding?: string;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<CodeEditWriteResult>;
  deletePath?(request: {
    targetPath: string;
    recursive?: boolean;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<CodeEditDeleteResult>;
  formatText?(request: {
    targetPath: string;
    content: string;
    languageHint?: string;
    range?: { startLine: number; endLine: number };
    options?: { tabSize?: number; insertSpaces?: boolean };
    context?: Readonly<Record<string, unknown>>;
  }): Promise<CodeEditFormatResult>;
};

export type CodeEditNormalizedPath =
  | {
      ok: true;
      path: string;
    }
  | {
      ok: false;
      code: "MISSING_TARGET_PATH" | "TARGET_OUT_OF_SCOPE";
      message: string;
    };

export type CodeEditScopeResult =
  | {
      ok: true;
      acceptedScopes: readonly string[];
    }
  | {
      ok: false;
      code: "SCOPE_DENIED";
      message: string;
    };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeRelativeTargetPath(targetPath: string | undefined, toolId: string): CodeEditNormalizedPath {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    return { ok: false, code: "MISSING_TARGET_PATH", message: `${toolId} requires a targetPath` };
  }

  const normalized = targetPath.trim().replaceAll("\\", "/").replace(/\/+/g, "/");
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    parts.some((part) => part === "..")
  ) {
    return { ok: false, code: "TARGET_OUT_OF_SCOPE", message: `${toolId} targetPath must stay inside the workspace scope` };
  }

  const path = parts.filter((part) => part !== "." && part.length > 0).join("/");
  if (path.length === 0) {
    return { ok: false, code: "TARGET_OUT_OF_SCOPE", message: `${toolId} targetPath must stay inside the workspace scope` };
  }

  return { ok: true, path };
}

export function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
  toolId: string,
): CodeEditScopeResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return { ok: true, acceptedScopes: [] };
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return { ok: false, code: "SCOPE_DENIED", message: `${toolId} scope ${denied[0]} is outside runtime governance` };
  }

  return { ok: true, acceptedScopes: requested };
}

export function shouldDryRun(requestDryRun: boolean | undefined, contextDryRun: boolean | undefined): boolean {
  return requestDryRun !== false && contextDryRun !== false;
}

export function gateRejected(...gates: readonly (CodeEditGate | undefined)[]): CodeEditGate | undefined {
  return gates.find((gate) => gate?.accepted === false || gate?.allowed === false);
}

export function hasExecutionApproval(...gates: readonly (CodeEditGate | undefined)[]): boolean {
  return gates.some((gate) => gate?.accepted === true || gate?.allowed === true);
}

export function providerFailureMessage(toolId: string): string {
  return `${toolId} provider failed while applying the runtime-supported operation`;
}

export function providerUnavailableMessage(toolId: string, capability: string): string {
  return `${toolId} requires runtime ${capability} support for non-dry-run execution`;
}

export function replaceOccurrences(
  content: string,
  searchText: string,
  replacementText: string,
  occurrence: "first" | "all",
  maxReplacements: number,
): { content: string; replacements: number } {
  if (searchText.length === 0) {
    return { content, replacements: 0 };
  }

  let replacements = 0;
  let offset = 0;
  let nextContent = "";
  const limit = occurrence === "first" ? 1 : maxReplacements;

  while (replacements < limit) {
    const index = content.indexOf(searchText, offset);
    if (index < 0) {
      break;
    }
    nextContent += content.slice(offset, index) + replacementText;
    offset = index + searchText.length;
    replacements += 1;
  }

  if (replacements === 0) {
    return { content, replacements };
  }

  return { content: nextContent + content.slice(offset), replacements };
}

export function deleteLineRange(
  content: string,
  range: { startLine: number; endLine: number },
): { content: string; deletedLines: number } {
  const lines = content.split(/\r?\n/);
  const startIndex = Math.max(0, range.startLine - 1);
  const endExclusive = Math.min(lines.length, range.endLine);
  const deletedLines = Math.max(0, endExclusive - startIndex);
  const nextLines = [...lines.slice(0, startIndex), ...lines.slice(endExclusive)];
  return { content: nextLines.join("\n"), deletedLines };
}

export function isValidPositiveRange(range: { startLine: number; endLine: number } | undefined): boolean {
  return (
    range !== undefined &&
    Number.isInteger(range.startLine) &&
    Number.isInteger(range.endLine) &&
    range.startLine > 0 &&
    range.endLine >= range.startLine
  );
}

function offsetForPosition(content: string, position: { line: number; character: number }): number {
  const lines = content.split(/\n/);
  let offset = 0;
  for (let line = 0; line < Math.min(position.line, lines.length); line += 1) {
    offset += lines[line].length + 1;
  }
  return Math.min(content.length, offset + Math.max(0, position.character));
}

export function applyLspTextEdits(content: string, edits: readonly BaseToolLspTextEdit[]): string {
  const sorted = [...edits].sort((left, right) => {
    if (left.range.start.line !== right.range.start.line) {
      return right.range.start.line - left.range.start.line;
    }
    return right.range.start.character - left.range.start.character;
  });

  let nextContent = content;
  for (const edit of sorted) {
    const start = offsetForPosition(nextContent, edit.range.start);
    const end = offsetForPosition(nextContent, edit.range.end);
    nextContent = `${nextContent.slice(0, start)}${edit.newText}${nextContent.slice(end)}`;
  }
  return nextContent;
}
