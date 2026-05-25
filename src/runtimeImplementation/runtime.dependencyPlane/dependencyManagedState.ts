/*
 * Runtime dependency plane / managed state.
 * Purpose: persist public-safe dependency availability records and project locks.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalDependencyId,
  type ManagedDependencyRecord,
  type ManagedDependencyState,
  type ProjectDependencyLock,
  type ProjectDependencyLockEntry,
} from "./dependencyTypes.js";

export const dependencyManagedStateDescriptor = {
  surface: "runtime.dependencyPlane.managedState",
  globalStateFile: "tool-deps/state.json",
  projectLockFile: ".rax_workspace/config/dependency-lock.json",
  storesSecrets: false,
} as const;

function emptyState(): ManagedDependencyState {
  return {
    kind: "praxis.dependencyState",
    version: "praxis.dependencyState.v1",
    records: {},
  };
}

function emptyLock(): ProjectDependencyLock {
  return {
    kind: "praxis.projectDependencyLock",
    version: "praxis.projectDependencyLock.v1",
    entries: {},
  };
}

async function readJson<TValue>(filePath: string, fallback: TValue): Promise<TValue> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as TValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readManagedDependencyState(managedRoot: string): Promise<ManagedDependencyState> {
  return readJson(path.join(managedRoot, "state.json"), emptyState());
}

export async function writeManagedDependencyRecord(input: {
  managedRoot: string;
  record: ManagedDependencyRecord;
}): Promise<ManagedDependencyState> {
  const state = await readManagedDependencyState(input.managedRoot);
  const dependencyId = canonicalDependencyId(input.record.dependencyId);
  state.records[dependencyId] = {
    ...input.record,
    dependencyId,
  };
  await writeJson(path.join(input.managedRoot, "state.json"), state);
  return state;
}

export async function readManagedDependencyRecord(input: {
  dependencyId: string;
  managedRoot?: string;
}): Promise<ManagedDependencyRecord | undefined> {
  if (input.managedRoot === undefined) return undefined;
  const state = await readManagedDependencyState(input.managedRoot);
  return state.records[canonicalDependencyId(input.dependencyId)];
}

export async function readProjectDependencyLock(lockPath: string): Promise<ProjectDependencyLock> {
  return readJson(lockPath, emptyLock());
}

export async function writeProjectDependencyLockEntry(input: {
  lockPath: string;
  entry: ProjectDependencyLockEntry;
}): Promise<ProjectDependencyLock> {
  const lock = await readProjectDependencyLock(input.lockPath);
  const dependencyId = canonicalDependencyId(input.entry.dependencyId);
  lock.entries[dependencyId] = {
    ...input.entry,
    dependencyId,
  };
  await writeJson(input.lockPath, lock);
  return lock;
}
