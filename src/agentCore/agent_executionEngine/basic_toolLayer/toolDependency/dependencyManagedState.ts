import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ManagedDependencyRecord = {
  dependencyId: string;
  sourceId: string;
  status: "installed" | "available" | "failed";
  managedRoot: string;
  resolvedPath?: string;
  version?: string;
  observedAt: string;
  lastError?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ManagedDependencyState = {
  version: 1;
  records: Readonly<Record<string, ManagedDependencyRecord>>;
};

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function managedDependencyStatePath(managedRoot: string): string {
  return path.join(managedRoot, "state.json");
}

export async function readManagedDependencyState(managedRoot: string): Promise<ManagedDependencyState> {
  const statePath = managedDependencyStatePath(managedRoot);
  if (!existsSync(statePath)) {
    return { version: 1, records: {} };
  }

  try {
    const content = await readFile(statePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ManagedDependencyState>;
    return {
      version: 1,
      records: typeof parsed.records === "object" && parsed.records !== null ? parsed.records : {},
    };
  } catch {
    return { version: 1, records: {} };
  }
}

export async function writeManagedDependencyState(managedRoot: string, state: ManagedDependencyState): Promise<void> {
  await mkdir(managedRoot, { recursive: true });
  await writeFile(managedDependencyStatePath(managedRoot), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function updateManagedDependencyRecord(
  managedRoot: string,
  record: ManagedDependencyRecord,
): Promise<ManagedDependencyState> {
  const nextRecord: ManagedDependencyRecord = {
    ...record,
    managedRoot,
    observedAt: record.observedAt,
    resolvedPath: isBlank(record.resolvedPath) ? undefined : record.resolvedPath?.trim(),
    version: isBlank(record.version) ? undefined : record.version?.trim(),
    lastError: isBlank(record.lastError) ? undefined : record.lastError?.trim(),
  };
  const current = await readManagedDependencyState(managedRoot);
  const next: ManagedDependencyState = {
    version: 1,
    records: {
      ...current.records,
      [nextRecord.dependencyId]: nextRecord,
    },
  };
  await writeManagedDependencyState(managedRoot, next);
  return next;
}

export async function readManagedDependencyRecord(
  managedRoot: string,
  dependencyId: string,
): Promise<ManagedDependencyRecord | undefined> {
  const state = await readManagedDependencyState(managedRoot);
  return state.records[dependencyId];
}
