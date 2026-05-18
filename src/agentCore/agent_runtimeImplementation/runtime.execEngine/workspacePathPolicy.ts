/*
 * 文件定位：Agent 运行态实现层 / 执行引擎路径契约。
 * 核心目的：把模型可见的 /workspace 逻辑路径、相对路径和宿主绝对路径统一归一到真实 workspaceRoot。
 * 边界：只负责路径映射、allowedRoots 判断和可观测元数据，不执行文件或进程副作用。
 */

import path from "node:path";

export type WorkspacePathMappingSource = "workspace-alias" | "relative-to-workspace" | "absolute";

export type WorkspacePathRejectReason = "OUTSIDE_ALLOWED_ROOTS" | "CWD_REJECTED" | "INVALID_PATH";

export type WorkspacePathContext = {
  workspaceRoot: string;
  allowedRoots?: readonly string[];
  kind?: "path" | "cwd";
};

export type WorkspacePathSuccess = {
  ok: true;
  requestedPath: string;
  normalizedPath: string;
  workspaceRoot: string;
  allowedRoots: readonly string[];
  pathWasMapped: boolean;
  mappingSource: WorkspacePathMappingSource;
  suggestedCwd: string;
};

export type WorkspacePathFailure = {
  ok: false;
  reason: WorkspacePathRejectReason;
  message: string;
  requestedPath: string;
  normalizedPath?: string;
  workspaceRoot: string;
  allowedRoots: readonly string[];
  pathWasMapped: boolean;
  mappingSource?: WorkspacePathMappingSource;
  suggestedCwd: string;
};

export type WorkspacePathResult = WorkspacePathSuccess | WorkspacePathFailure;

function cleanPath(value: string): string {
  return value.trim();
}

export function normalizeAllowedRoots(input: WorkspacePathContext): readonly string[] {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const roots = [workspaceRoot, ...(input.allowedRoots ?? [])]
    .map((root) => cleanPath(root))
    .filter((root) => root.length > 0)
    .map((root) => path.resolve(root));
  return [...new Set(roots)];
}

export function isInsideAllowedRoots(candidatePath: string, allowedRoots: readonly string[]): boolean {
  const resolved = path.resolve(candidatePath);
  return allowedRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    const relative = path.relative(resolvedRoot, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

export function mapWorkspaceAlias(value: string, workspaceRoot: string): string | undefined {
  const input = cleanPath(value).replaceAll("\\", "/");
  if (input === "/workspace") return path.resolve(workspaceRoot);
  if (input.startsWith("/workspace/")) {
    return path.resolve(workspaceRoot, input.slice("/workspace/".length));
  }
  return undefined;
}

function computeNormalizedPath(
  value: string,
  workspaceRoot: string,
): { normalizedPath: string; mappingSource: WorkspacePathMappingSource; pathWasMapped: boolean } {
  const requested = cleanPath(value);
  const aliasMapped = mapWorkspaceAlias(requested, workspaceRoot);
  if (aliasMapped !== undefined) {
    return {
      normalizedPath: aliasMapped,
      mappingSource: "workspace-alias",
      pathWasMapped: true,
    };
  }
  if (path.isAbsolute(requested)) {
    return {
      normalizedPath: path.resolve(requested),
      mappingSource: "absolute",
      pathWasMapped: false,
    };
  }
  return {
    normalizedPath: path.resolve(workspaceRoot, requested),
    mappingSource: "relative-to-workspace",
    pathWasMapped: requested !== path.resolve(workspaceRoot, requested),
  };
}

export function normalizeWorkspacePath(value: string | undefined, context: WorkspacePathContext): WorkspacePathResult {
  const workspaceRoot = path.resolve(context.workspaceRoot);
  const allowedRoots = normalizeAllowedRoots({ ...context, workspaceRoot });
  const requestedPath = typeof value === "string" ? cleanPath(value) : "";
  const suggestedCwd = workspaceRoot;

  if (requestedPath.length === 0 || requestedPath.includes("\0")) {
    return {
      ok: false,
      reason: context.kind === "cwd" ? "CWD_REJECTED" : "INVALID_PATH",
      message: context.kind === "cwd" ? "requested cwd is empty or invalid" : "requested path is empty or invalid",
      requestedPath,
      workspaceRoot,
      allowedRoots,
      pathWasMapped: false,
      suggestedCwd,
    };
  }

  const mapped = computeNormalizedPath(requestedPath, workspaceRoot);
  if (!isInsideAllowedRoots(mapped.normalizedPath, allowedRoots)) {
    return {
      ok: false,
      reason: context.kind === "cwd" ? "CWD_REJECTED" : "OUTSIDE_ALLOWED_ROOTS",
      message: context.kind === "cwd"
        ? "requested cwd is outside runtime allowed roots"
        : "requested path is outside runtime allowed roots",
      requestedPath,
      normalizedPath: mapped.normalizedPath,
      workspaceRoot,
      allowedRoots,
      pathWasMapped: mapped.pathWasMapped,
      mappingSource: mapped.mappingSource,
      suggestedCwd,
    };
  }

  return {
    ok: true,
    requestedPath,
    normalizedPath: mapped.normalizedPath,
    workspaceRoot,
    allowedRoots,
    pathWasMapped: mapped.pathWasMapped,
    mappingSource: mapped.mappingSource,
    suggestedCwd,
  };
}

export function normalizeToolCwd(value: string | undefined, context: WorkspacePathContext): WorkspacePathResult {
  return normalizeWorkspacePath(value ?? ".", { ...context, kind: "cwd" });
}

export function workspaceRelativePath(normalizedPath: string, workspaceRoot: string): string | undefined {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(normalizedPath);
  const relative = path.relative(root, resolved);
  if (relative === "") return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join("/");
}

export function workspacePathMetadata(
  result: WorkspacePathSuccess | WorkspacePathFailure,
  field: "path" | "cwd",
): Readonly<Record<string, unknown>> {
  const requestedKey = field === "cwd" ? "requestedCwd" : "requestedPath";
  const normalizedKey = field === "cwd" ? "normalizedCwd" : "normalizedPath";
  const mappedKey = field === "cwd" ? "cwdWasMapped" : "pathWasMapped";
  return {
    workspaceRoot: result.workspaceRoot,
    allowedRoots: result.allowedRoots,
    [requestedKey]: result.requestedPath,
    ...(result.normalizedPath === undefined ? {} : { [normalizedKey]: result.normalizedPath }),
    [mappedKey]: result.pathWasMapped,
    mappingSource: result.mappingSource,
    suggestedCwd: result.suggestedCwd,
    ...(!result.ok ? { reason: result.reason } : {}),
  };
}
