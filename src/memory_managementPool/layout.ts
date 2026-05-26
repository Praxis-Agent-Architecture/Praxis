import path from "node:path";

import type { MemoryLayout, MemoryPlaneOptions, MemoryRootConfig, MemoryScope } from "./types.js";

const DEFAULT_PROJECT_MEMORY_ROOT = ".rax_workspace/memory";

function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function formatMemoryDate(value: Date | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("memoryPlane now() returned an invalid date.");
  }
  return date.toISOString().slice(0, 10);
}

export function normalizeMemoryRoot(root: string): string {
  if (root.trim().length === 0) {
    throw new Error("memory root cannot be empty.");
  }
  return path.resolve(root);
}

export function resolveMemoryLayouts(options: MemoryPlaneOptions = {}): readonly MemoryLayout[] {
  const now = options.now?.() ?? new Date();
  const date = formatMemoryDate(now);
  const roots = resolveRootConfigs(options);

  return roots.map((item) => {
    const root = normalizeMemoryRoot(item.root);
    const label = item.label ?? item.scope;
    return {
      scope: item.scope,
      label,
      root,
      longTermPath: path.join(root, "MEMORY.md"),
      dailyDir: path.join(root, "daily"),
      dailyPath: path.join(root, "daily", `${date}.md`),
      artifactDir: path.join(root, "artifacts"),
      indexPath: path.join(root, "index.sqlite"),
      lockDir: path.join(root, ".memory.lock"),
    };
  });
}

function resolveRootConfigs(options: MemoryPlaneOptions): readonly MemoryRootConfig[] {
  if (options.roots !== undefined && options.roots.length > 0) {
    return options.roots;
  }
  const roots: MemoryRootConfig[] = [];
  roots.push({
    root: options.projectMemoryRoot ?? DEFAULT_PROJECT_MEMORY_ROOT,
    scope: "project",
    label: "project",
  });
  if (options.globalMemoryRoot !== undefined) {
    roots.push({
      root: options.globalMemoryRoot,
      scope: "global",
      label: "global",
    });
  }
  return roots;
}

export function scopeMatches(layout: MemoryLayout, scope: MemoryScope | "all" | undefined): boolean {
  return scope === undefined || scope === "all" || layout.scope === scope;
}
