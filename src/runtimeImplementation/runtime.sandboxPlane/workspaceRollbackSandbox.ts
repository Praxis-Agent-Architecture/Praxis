/*
 * 文件定位：Agent 运行态实现层 / workspace rollback 沙箱基础设施。
 * 核心目的：为 yolo/降级强隔离提供跨平台 workspace-diff 回滚计划和审计对象。
 * 边界：只保护 workspace 文件；home、系统目录、全局缓存和外部服务必须由强沙箱或审批策略处理。
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WorkspaceRollbackSandboxPlan = {
  kind: "runtime.sandboxPlane.workspaceRollback.plan";
  workspaceRoot: string;
  rollbackRoot: string;
  invocationId: string;
  strategy: "workspace-diff";
  protects: readonly ["workspace-files"];
  doesNotProtect: readonly string[];
  autoMergeOnSuccess: true;
  publicSafe: true;
};

export type WorkspaceRollbackFileEntry = {
  path: string;
  absolutePath: string;
  exists: boolean;
  fileType?: "file" | "directory" | "symlink";
  size?: number;
  mtimeMs?: number;
  sha256?: string;
  linkTarget?: string;
  snapshotPath?: string;
};

export type WorkspaceRollbackSnapshot = {
  kind: "runtime.sandboxPlane.workspaceRollback.snapshot";
  plan: WorkspaceRollbackSandboxPlan;
  gitAware: boolean;
  baselineStatus?: readonly string[];
  files: readonly WorkspaceRollbackFileEntry[];
  createdAt: string;
  events: readonly string[];
  publicSafe: true;
};

export type WorkspaceRollbackChangedFile = {
  path: string;
  change: "created" | "modified" | "deleted";
  before?: WorkspaceRollbackFileEntry;
  after?: WorkspaceRollbackFileEntry;
  restorable: boolean;
};

export type WorkspaceRollbackFinalizeResult = {
  kind: "runtime.sandboxPlane.workspaceRollback.diff";
  snapshotRoot: string;
  changedFiles: readonly WorkspaceRollbackChangedFile[];
  uncoveredEffects: readonly string[];
  restored?: boolean;
  publicSafe: true;
  events: readonly string[];
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 96) || "invocation";
}

export function createWorkspaceRollbackSandboxPlan(input: {
  workspaceRoot: string;
  sandboxRoot?: string;
  sessionId: string;
  invocationId: string;
}): WorkspaceRollbackSandboxPlan {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const rollbackRoot = path.resolve(
    input.sandboxRoot ?? path.join(workspaceRoot, ".rax_workspace", "sandbox", "workspace-rollback"),
    safeSegment(input.sessionId),
    safeSegment(input.invocationId),
  );
  return {
    kind: "runtime.sandboxPlane.workspaceRollback.plan",
    workspaceRoot,
    rollbackRoot,
    invocationId: input.invocationId,
    strategy: "workspace-diff",
    protects: ["workspace-files"],
    doesNotProtect: ["home directory", "system paths", "global package caches", "external services"],
    autoMergeOnSuccess: true,
    publicSafe: true,
  };
}

async function gitStatus(workspaceRoot: string): Promise<readonly string[] | undefined> {
  try {
    const result = await execFileAsync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      cwd: workspaceRoot,
      timeout: 5_000,
      maxBuffer: 2_000_000,
    });
    return String(result.stdout ?? "").split("\0").filter((item) => item.length > 0).sort();
  } catch {
    return undefined;
  }
}

function ignoredSegment(name: string): boolean {
  return name === ".git" ||
    name === "node_modules" ||
    name === ".rax_workspace" ||
    name === "__pycache__";
}

async function walkFiles(root: string, current = root, out: string[] = []): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredSegment(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) {
      out.push(relative);
      await walkFiles(root, absolute, out);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      out.push(relative);
    }
  }
  return out;
}

async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function fileEntry(workspaceRoot: string, relativePath: string, snapshotRoot?: string): Promise<WorkspaceRollbackFileEntry> {
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  try {
    const info = await lstat(absolutePath);
    if (info.isDirectory()) {
      return {
        path: relativePath,
        absolutePath,
        exists: true,
        fileType: "directory",
        size: info.size,
        mtimeMs: info.mtimeMs,
      };
    }
    if (info.isSymbolicLink()) {
      return {
        path: relativePath,
        absolutePath,
        exists: true,
        fileType: "symlink",
        size: info.size,
        mtimeMs: info.mtimeMs,
        linkTarget: await readlink(absolutePath),
      };
    }
    if (!info.isFile()) return { path: relativePath, absolutePath, exists: false };
    const snapshotPath = snapshotRoot === undefined ? undefined : path.join(snapshotRoot, relativePath);
    if (snapshotPath !== undefined) {
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await copyFile(absolutePath, snapshotPath);
    }
    return {
      path: relativePath,
      absolutePath,
      exists: true,
      fileType: "file",
      size: info.size,
      mtimeMs: info.mtimeMs,
      sha256: await hashFile(absolutePath),
      snapshotPath,
    };
  } catch {
    return { path: relativePath, absolutePath, exists: false };
  }
}

export async function createWorkspaceRollbackSnapshot(plan: WorkspaceRollbackSandboxPlan): Promise<WorkspaceRollbackSnapshot> {
  const snapshotRoot = path.join(plan.rollbackRoot, "snapshot");
  await mkdir(snapshotRoot, { recursive: true });
  const baselineStatus = await gitStatus(plan.workspaceRoot);
  const files = await walkFiles(plan.workspaceRoot);
  const entries = await Promise.all(files.map((file) => fileEntry(plan.workspaceRoot, file, snapshotRoot)));
  await writeFile(path.join(plan.rollbackRoot, "baseline.json"), JSON.stringify({ baselineStatus, files: entries }, null, 2));
  return {
    kind: "runtime.sandboxPlane.workspaceRollback.snapshot",
    plan,
    gitAware: baselineStatus !== undefined,
    baselineStatus,
    files: entries,
    createdAt: new Date().toISOString(),
    events: ["runtime.sandboxPlane.workspaceRollback.snapshot.created"],
    publicSafe: true,
  };
}

function sameEntry(left: WorkspaceRollbackFileEntry | undefined, right: WorkspaceRollbackFileEntry | undefined): boolean {
  if (left?.exists !== right?.exists) return false;
  if (left?.exists !== true && right?.exists !== true) return true;
  if (left === undefined || right === undefined) return false;
  if (left?.fileType !== right?.fileType) return false;
  if (left?.fileType === "directory") return true;
  if (left?.fileType === "symlink") return left.linkTarget === right.linkTarget;
  return left?.sha256 === right?.sha256 && left?.size === right?.size;
}

export async function finalizeWorkspaceRollbackSnapshot(snapshot: WorkspaceRollbackSnapshot): Promise<WorkspaceRollbackFinalizeResult> {
  const before = new Map(snapshot.files.map((entry) => [entry.path, entry]));
  const currentFiles = await walkFiles(snapshot.plan.workspaceRoot);
  const names = [...new Set([...before.keys(), ...currentFiles])].sort();
  const changed: WorkspaceRollbackChangedFile[] = [];
  for (const name of names) {
    const current = await fileEntry(snapshot.plan.workspaceRoot, name);
    const previous = before.get(name);
    if (sameEntry(previous, current)) continue;
    const change = previous?.exists !== true && current.exists ? "created" : previous?.exists === true && !current.exists ? "deleted" : "modified";
    changed.push({
      path: name,
      change,
      before: previous,
      after: current,
      restorable: change === "created" || previous?.snapshotPath !== undefined || previous?.fileType === "directory" || previous?.fileType === "symlink",
    });
  }
  const result: WorkspaceRollbackFinalizeResult = {
    kind: "runtime.sandboxPlane.workspaceRollback.diff",
    snapshotRoot: path.join(snapshot.plan.rollbackRoot, "snapshot"),
    changedFiles: changed,
    uncoveredEffects: snapshot.gitAware ? [] : ["non-git workspace baseline cannot detect host effects outside workspace"],
    publicSafe: true,
    events: [
      "runtime.sandboxPlane.workspaceRollback.diff.created",
      ...(changed.some((file) => !file.restorable) ? ["runtime.sandboxPlane.workspaceRollback.diff.partial"] : []),
    ],
  };
  await mkdir(snapshot.plan.rollbackRoot, { recursive: true });
  await writeFile(path.join(snapshot.plan.rollbackRoot, "diff.json"), JSON.stringify(result, null, 2));
  return result;
}

export async function restoreWorkspaceRollbackSnapshot(
  snapshot: WorkspaceRollbackSnapshot,
  diff: WorkspaceRollbackFinalizeResult,
): Promise<WorkspaceRollbackFinalizeResult> {
  for (const file of diff.changedFiles) {
    const absolutePath = path.resolve(snapshot.plan.workspaceRoot, file.path);
    if (file.change === "created") {
      await rm(absolutePath, { force: true, recursive: true });
      continue;
    }
    if (file.before?.fileType === "directory") {
      await rm(absolutePath, { force: true, recursive: true });
      await mkdir(absolutePath, { recursive: true });
      continue;
    }
    if (file.before?.fileType === "symlink" && file.before.linkTarget !== undefined) {
      await rm(absolutePath, { force: true, recursive: true });
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await symlink(file.before.linkTarget, absolutePath);
      continue;
    }
    if (file.before?.snapshotPath !== undefined) {
      await rm(absolutePath, { force: true, recursive: true });
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await copyFile(file.before.snapshotPath, absolutePath);
      continue;
    }
    if (file.change === "deleted" && file.before?.snapshotPath === undefined) {
      // Cannot restore a deleted file without a snapshot; keep the public diff honest.
      continue;
    }
  }
  const restored = {
    ...diff,
    restored: true,
    events: [...diff.events, "runtime.sandboxPlane.workspaceRollback.restored"],
  };
  await writeFile(path.join(snapshot.plan.rollbackRoot, "restore.json"), JSON.stringify(restored, null, 2));
  return restored;
}

export const workspaceRollbackSandboxDescriptor = {
  surface: "runtime.sandboxPlane.workspaceRollbackSandbox",
  crossPlatform: true,
  protects: ["workspace-files"],
  strategy: "manifest-plus-file-snapshots",
  unsafeSideEffects: false,
} as const;
