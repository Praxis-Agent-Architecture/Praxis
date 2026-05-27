/*
 * Runtime storage plane / path resolver.
 * Purpose: resolve public-safe Praxis home and workspace roots without reading secrets
 * or creating directories during compile.
 */

import os from "node:os";
import path from "node:path";
import { existsSync, statSync } from "node:fs";

export type RaxPathResolutionErrorCode =
  | "EMPTY_PATH"
  | "RELATIVE_HOME"
  | "INVALID_CWD"
  | "INVALID_WORKSPACE_FOLDER_NAME"
  | "INVALID_AGENT_ID"
  | "PATH_ESCAPE";

export type RaxPathResolutionError = {
  code: RaxPathResolutionErrorCode;
  message: string;
  boundary: "input" | "filesystem" | "security";
  publicSafe: true;
};

export type RaxPathResolutionResult<TValue> =
  | { ok: true; value: TValue; events: readonly string[] }
  | { ok: false; error: RaxPathResolutionError; events: readonly string[] };

export type RaxHomeResolutionInput = {
  explicitHome?: string;
  homeDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
};

export type RaxHomeResolution = {
  root: string;
  source: "explicit" | "env" | "os";
};

export type RaxWorkspaceResolutionInput = {
  cwd?: string;
  explicitWorkspaceRoot?: string;
  workspaceFolderName?: string;
};

export type RaxWorkspaceResolution = {
  root: string;
  cwd: string;
  source: "explicit" | "discovered" | "planned";
  existing: boolean;
  workspaceFolderName: string;
};

function failure<TValue>(
  code: RaxPathResolutionErrorCode,
  message: string,
  boundary: RaxPathResolutionError["boundary"],
): RaxPathResolutionResult<TValue> {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.storagePlane.path.rejected"],
  };
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeAbsolute(input: string): string {
  return path.resolve(input);
}

function directoryExists(input: string): boolean {
  try {
    return existsSync(input) && statSync(input).isDirectory();
  } catch {
    return false;
  }
}

export function resolveRaxHome(input: RaxHomeResolutionInput = {}): RaxPathResolutionResult<RaxHomeResolution> {
  const envHome = hasText(input.env?.PRAXIS_HOME)
    ? input.env.PRAXIS_HOME
    : hasText(input.env?.RAX_HOME)
      ? input.env.RAX_HOME
      : undefined;
  const homeDir = hasText(input.homeDir) ? input.homeDir : undefined;
  const envUserHome = hasText(input.env?.HOME) ? input.env.HOME : undefined;
  const rawHome = input.explicitHome ?? envHome ?? homeDir ?? envUserHome ?? os.homedir();
  const source: RaxHomeResolution["source"] = input.explicitHome !== undefined
    ? "explicit"
    : envHome !== undefined || homeDir !== undefined || envUserHome !== undefined
      ? "env"
      : "os";

  if (!hasText(rawHome)) {
    return failure("EMPTY_PATH", "Praxis home requires a non-empty home path", "input");
  }

  if (!path.isAbsolute(rawHome)) {
    return failure("RELATIVE_HOME", "Praxis home must resolve from an absolute home path", "input");
  }

  return {
    ok: true,
    value: {
      root: envHome !== undefined && input.explicitHome === undefined
        ? normalizeAbsolute(rawHome)
        : path.join(normalizeAbsolute(rawHome), ".rax"),
      source,
    },
    events: ["runtime.storagePlane.home.resolved"],
  };
}

function findWorkspaceRoot(cwd: string, workspaceFolderName: string): string | undefined {
  let current = normalizeAbsolute(cwd);
  while (true) {
    const candidate = path.join(current, workspaceFolderName);
    if (directoryExists(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function safeWorkspaceFolderName(workspaceFolderName: string): RaxPathResolutionResult<string> {
  const trimmed = workspaceFolderName.trim();
  if (!hasText(trimmed)) {
    return failure("INVALID_WORKSPACE_FOLDER_NAME", "Workspace folder name must be non-empty", "input");
  }

  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    path.isAbsolute(trimmed) ||
    /[\u0000-\u001F\u007F]/u.test(trimmed)
  ) {
    return failure("INVALID_WORKSPACE_FOLDER_NAME", "Workspace folder name cannot contain path traversal or separators", "security");
  }

  return {
    ok: true,
    value: trimmed,
    events: ["runtime.storagePlane.workspaceFolderName.accepted"],
  };
}

export function resolveRaxWorkspace(
  input: RaxWorkspaceResolutionInput = {},
): RaxPathResolutionResult<RaxWorkspaceResolution> {
  const rawCwd = input.cwd ?? process.cwd();
  const workspaceFolderName = input.workspaceFolderName?.trim() || ".rax_workspace";
  const safeWorkspaceName = safeWorkspaceFolderName(workspaceFolderName);
  if (!safeWorkspaceName.ok) {
    return safeWorkspaceName;
  }

  if (!hasText(rawCwd)) {
    return failure("INVALID_CWD", "Praxis workspace resolution requires a non-empty cwd", "input");
  }

  const cwd = normalizeAbsolute(rawCwd);
  if (input.explicitWorkspaceRoot !== undefined) {
    if (!hasText(input.explicitWorkspaceRoot)) {
      return failure("EMPTY_PATH", "Praxis workspace override requires a non-empty path", "input");
    }

    const root = path.isAbsolute(input.explicitWorkspaceRoot)
      ? normalizeAbsolute(input.explicitWorkspaceRoot)
      : normalizeAbsolute(path.join(cwd, input.explicitWorkspaceRoot));

    return {
      ok: true,
      value: {
        root,
        cwd,
        source: "explicit",
        existing: directoryExists(root),
        workspaceFolderName: safeWorkspaceName.value,
      },
      events: ["runtime.storagePlane.workspace.resolved"],
    };
  }

  const discovered = findWorkspaceRoot(cwd, safeWorkspaceName.value);
  const root = discovered ?? path.join(cwd, safeWorkspaceName.value);
  return {
    ok: true,
    value: {
      root,
      cwd,
      source: discovered === undefined ? "planned" : "discovered",
      existing: discovered !== undefined,
      workspaceFolderName: safeWorkspaceName.value,
    },
    events: ["runtime.storagePlane.workspace.resolved"],
  };
}

export function safeAgentStorageId(agentId: string): RaxPathResolutionResult<string> {
  const trimmed = agentId.trim();
  if (!hasText(trimmed)) {
    return failure("INVALID_AGENT_ID", "Agent storage id must be non-empty", "input");
  }

  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    /[\u0000-\u001F\u007F]/u.test(trimmed)
  ) {
    return failure("INVALID_AGENT_ID", "Agent storage id cannot contain path traversal or separators", "security");
  }

  return {
    ok: true,
    value: trimmed,
    events: ["runtime.storagePlane.agentId.accepted"],
  };
}

export function assertChildPath(parent: string, child: string): RaxPathResolutionResult<string> {
  const normalizedParent = normalizeAbsolute(parent);
  const normalizedChild = normalizeAbsolute(child);
  const relative = path.relative(normalizedParent, normalizedChild);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return failure("PATH_ESCAPE", "Resolved storage path must remain inside its parent root", "security");
  }

  return {
    ok: true,
    value: normalizedChild,
    events: ["runtime.storagePlane.path.accepted"],
  };
}
