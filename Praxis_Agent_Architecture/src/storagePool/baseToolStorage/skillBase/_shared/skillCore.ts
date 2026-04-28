import type { SkillToolAuditEvent, SkillToolResult } from "./baseToolAdapter.js";

export type SkillBasePermission = "skill:read" | "skill:write" | "filesystem:read" | "filesystem:write";
export type SkillBaseBoundary = "input" | "scope" | "permission" | "governance" | "provider" | "contract" | "resource";

export type SkillBaseGuard = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type SkillBaseContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: SkillBaseGuard;
  allowedRoots?: readonly string[];
  allowedSkillIds?: readonly string[];
  grantedPermissions?: readonly SkillBasePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SkillFilesystemProvider = {
  readText?(request: { path: string; encoding?: string; maxBytes?: number }): Promise<{ content: string; truncated: boolean }>;
  writeText?(request: { path: string; content: string; encoding?: string }): Promise<{ bytesWritten: number }>;
  deletePath?(request: { path: string; recursive?: boolean }): Promise<{ deleted: boolean }>;
  list?(request: {
    path: string;
    maxEntries?: number;
    depth?: number;
    includeGlobs?: readonly string[];
    excludeGlobs?: readonly string[];
  }): Promise<{ entries: readonly string[] }>;
};

export type SkillRipgrepProvider = {
  ripgrep(request: {
    command: readonly string[];
    query: string;
    directoryPath: string;
    fileGlob?: string;
    maxMatches: number;
    literal: boolean;
    caseSensitive: boolean;
    includeHidden: boolean;
    multiline: boolean;
    contextLines: number;
    context?: Readonly<Record<string, unknown>>;
  }): Promise<{
    exitCode: number;
    matches: readonly { path: string; line: number; column?: number; text: string }[];
    stderr?: string;
  }>;
};

export type SkillFrontmatter = {
  name: string;
  description: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SkillResourceIndex = {
  root: string;
  entries: readonly string[];
  truncated: boolean;
};

export const skillNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u;
const skillDirNamePattern = /^[a-z0-9][a-z0-9_-]{1,63}$/u;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function stringArrayValue(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return undefined;
    const trimmed = item.trim();
    if (trimmed.length > 0) values.push(trimmed);
  }
  return [...new Set(values)];
}

export function dryRunEnabled(context: SkillBaseContext | undefined): boolean {
  return context?.dryRun !== false;
}

export function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/u, "");
}

export function unsafePath(value: string): boolean {
  return value.includes("\0") || value.split("/").some((segment) => segment === "..");
}

export function joinPath(root: string, ...segments: readonly string[]): string {
  return [normalizeRoot(root), ...segments.map((segment) => segment.replace(/^\/+|\/+$/gu, ""))]
    .filter((segment) => segment.length > 0)
    .join("/");
}

export function relativeSkillPath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !unsafePath(path);
}

export function isSafeSkillName(skillId: string): boolean {
  return skillNamePattern.test(skillId) && !unsafePath(skillId);
}

export function isSafeSkillDirectoryName(skillName: string): boolean {
  return skillDirNamePattern.test(skillName) && !unsafePath(skillName);
}

export function isInsideAllowedRoots(targetPath: string, allowedRoots: readonly string[] | undefined): boolean {
  if (allowedRoots === undefined || allowedRoots.length === 0) return true;
  const target = normalizeRoot(targetPath);
  return allowedRoots.map(normalizeRoot).some((root) => target === root || target.startsWith(`${root}/`));
}

export function isAllowedSkillId(skillId: string | undefined, allowedSkillIds: readonly string[] | undefined): boolean {
  return skillId === undefined || allowedSkillIds === undefined || allowedSkillIds.includes(skillId);
}

export function affirmativeGuard(context: SkillBaseContext | undefined): boolean {
  return context?.guard?.accepted === true || context?.guard?.allowed === true;
}

export function createAuditEvent(
  toolId: string,
  type: string,
  context: SkillBaseContext | undefined,
  targetRef?: string,
  metadata?: Readonly<Record<string, unknown>>,
): SkillToolAuditEvent {
  return {
    type,
    toolId,
    invocationId: context?.invocationId ?? `${toolId}:dry-run`,
    dryRun: dryRunEnabled(context),
    targetRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function failure<Output, Code extends string>(
  toolId: string,
  code: Code,
  message: string,
  boundary: SkillBaseBoundary,
  context: SkillBaseContext | undefined,
  targetRef?: string,
): SkillToolResult<Output, Code> {
  return {
    ok: false,
    toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [createAuditEvent(toolId, `agentCore.basicTool.${toolId}.rejected`, context, targetRef, { code })],
    events: [`basicTool.${toolId}.rejected`],
  };
}

export function ensureRealExecutionAllowed<Output, Code extends string>(
  toolId: string,
  context: SkillBaseContext | undefined,
  targetRef: string | undefined,
): SkillToolResult<Output, Code> | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (!affirmativeGuard(context)) {
    return failure(
      toolId,
      "GOVERNANCE_REJECTED" as Code,
      context?.guard?.reason ?? `${toolId} real execution requires an affirmative runtime guard`,
      "governance",
      context,
      targetRef,
    );
  }
  return undefined;
}

export function ensurePermissions<Output, Code extends string>(
  toolId: string,
  required: readonly SkillBasePermission[],
  context: SkillBaseContext | undefined,
  targetRef?: string,
): SkillToolResult<Output, Code> | undefined {
  if (dryRunEnabled(context)) return undefined;
  const granted = context?.grantedPermissions ?? [];
  const missing = required.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) return undefined;
  return failure(
    toolId,
    "PERMISSION_DENIED" as Code,
    `${toolId} is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    targetRef,
  );
}

export function parseSkillFrontmatter(content: string, fallbackName: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u);
  const metadata: Record<string, unknown> = {};
  let name = fallbackName;
  let description = "";
  if (match !== null) {
    for (const line of match[1].split(/\r?\n/u)) {
      const field = line.match(/^([A-Za-z0-9_.:-]+):\s*(.*)$/u);
      if (field === null) continue;
      const key = field[1];
      const value = field[2].replace(/^["']|["']$/gu, "").trim();
      metadata[key] = value;
      if (key === "name" && value.length > 0) name = value;
      if (key === "description" && value.length > 0) description = value;
    }
  }
  if (description.length === 0) {
    const heading = content.match(/^#\s+(.+)$/mu)?.[1]?.trim();
    description = heading ?? "Skill instructions";
  }
  return { name, description, metadata };
}

export async function listSkillResources(
  provider: SkillFilesystemProvider | undefined,
  skillRoot: string,
  maxEntries = 200,
): Promise<SkillResourceIndex> {
  if (provider?.list === undefined) {
    return { root: skillRoot, entries: [], truncated: false };
  }
  const result = await provider.list({
    path: skillRoot,
    maxEntries,
    depth: 4,
    includeGlobs: ["SKILL.md", "scripts/**", "references/**", "assets/**", "examples/**"],
    excludeGlobs: ["node_modules/**", ".git/**"],
  });
  return {
    root: skillRoot,
    entries: result.entries.slice(0, maxEntries),
    truncated: result.entries.length > maxEntries,
  };
}

export function buildSkillMarkdown(name: string, description: string, purpose: string, tags: readonly string[]): string {
  const tagLine = tags.length > 0 ? `\ntags: ${tags.join(", ")}` : "";
  return `---\nname: ${name}\ndescription: ${description || purpose}${tagLine}\n---\n\n# ${name}\n\n## Goal\n${purpose}\n\n## Steps\n- Follow this skill when the task matches the description.\n`;
}

export function sourcePreview(content: string, limit = 260): string {
  return content.replace(/\s+/gu, " ").trim().slice(0, limit);
}
