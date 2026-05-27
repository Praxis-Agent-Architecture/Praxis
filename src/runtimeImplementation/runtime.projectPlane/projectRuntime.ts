/*
 * 文件定位：Runtime foundation / project runtime。
 * 核心目的：打开或创建 project 存根，绑定 main workspace，获取独占 lease，并提供上层可消费的 project handle。
 */

import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  createAndApplyStoragePlaneRuntime,
  createStoragePlaneRuntime,
  type StoragePlaneRuntime,
} from "../runtime.storagePlane/storagePlaneRuntime.js";
import type { PraxisProjectSpec } from "./projectSpec.js";
import {
  createInMemoryProjectStore,
  createSqliteProjectStore,
  type PraxisArtifactRecord,
  type PraxisFoundationStore,
  type PraxisProjectKind,
  type PraxisProjectLeaseRecord,
  type PraxisProjectRecord,
  type PraxisProjectWorkspaceRecord,
  type PraxisSessionRecord,
} from "./projectStore.js";

export type PraxisProjectStub = {
  schema: "praxis.project.v1";
  projectId: string;
  kind: PraxisProjectKind;
  name?: string;
  mainWorkspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  defaultSessionId?: string;
  defaultAgentId?: string;
  agentEntries: Readonly<Record<string, {
    agentId?: string;
    role?: "primary" | "sidecar" | "auxiliary";
    entry?: string;
    exportName?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }>>;
  metadata: Readonly<Record<string, unknown>>;
};

export type PraxisProjectOpenMode = "open-or-create" | "create" | "open";

export type PraxisProjectOpenOptions = {
  spec?: PraxisProjectSpec;
  cwd?: string;
  projectId?: string;
  kind?: PraxisProjectKind;
  name?: string;
  ownerId?: string;
  runtimeId?: string;
  homeDir?: string;
  raxHome?: string;
  workspaceRoot?: string;
  persistence?: "sqlite" | "memory";
  mode?: PraxisProjectOpenMode;
  overwrite?: boolean;
  acquireLock?: boolean;
  now?: () => string;
};

export type PraxisProjectRuntime = {
  kind: "praxis.projectRuntime";
  project: PraxisProjectRecord;
  stub: PraxisProjectStub;
  storage: StoragePlaneRuntime;
  store: PraxisFoundationStore;
  lease?: PraxisProjectLeaseRecord;
  paths: {
    projectStubPath: string;
    projectLockPath: string;
    sessionSqlitePath: string;
    artifactRoot: string;
  };
  sessions: {
    list(): Promise<readonly PraxisSessionRecord[]>;
  };
  artifacts: {
    importFile(input: { sourcePath: string; sessionId?: string; kind?: PraxisArtifactRecord["kind"]; artifactId?: string; now?: string }): Promise<PraxisArtifactRecord>;
    list(sessionId?: string): Promise<readonly PraxisArtifactRecord[]>;
  };
  upgradeChatProject(input?: { now?: string }): Promise<PraxisProjectRecord>;
  release(): Promise<void>;
};

export type PraxisProjectOpenResult =
  | { ok: true; runtime: PraxisProjectRuntime; events: readonly string[] }
  | { ok: false; error: { code: string; message: string; publicSafe: true }; events: readonly string[] };

const PROJECT_STUB_SCHEMA = "praxis.project.v1" as const;
const DEFAULT_LEASE_TTL_MS = 90_000;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "project";
}

function defaultProjectId(workspaceRoot: string): string {
  return `project.${safeSlug(path.basename(path.dirname(workspaceRoot)) || path.basename(workspaceRoot))}`;
}

function failure(code: string, message: string, events: readonly string[] = []): PraxisProjectOpenResult {
  return {
    ok: false,
    error: { code, message, publicSafe: true },
    events: ["runtime.projectPlane.rejected", ...events],
  };
}

async function readStub(stubPath: string): Promise<PraxisProjectStub | undefined> {
  try {
    const raw = JSON.parse(await readFile(stubPath, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
    const record = raw as Partial<PraxisProjectStub>;
    if (record.schema !== PROJECT_STUB_SCHEMA || !hasText(record.projectId) || !hasText(record.mainWorkspaceRoot)) {
      return undefined;
    }
    return {
      schema: PROJECT_STUB_SCHEMA,
      projectId: record.projectId,
      kind: record.kind === "chat" ? "chat" : "workspace-project",
      name: record.name,
      mainWorkspaceRoot: path.resolve(record.mainWorkspaceRoot),
      createdAt: record.createdAt ?? new Date(0).toISOString(),
      updatedAt: record.updatedAt ?? new Date(0).toISOString(),
      defaultSessionId: record.defaultSessionId,
      defaultAgentId: record.defaultAgentId,
      agentEntries: record.agentEntries ?? {},
      metadata: record.metadata ?? {},
    };
  } catch {
    return undefined;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, filePath);
}

function projectRecordFromStub(stub: PraxisProjectStub): PraxisProjectRecord {
  return {
    projectId: stub.projectId,
    kind: stub.kind,
    name: stub.name,
    mainWorkspaceRoot: stub.mainWorkspaceRoot,
    createdAt: stub.createdAt,
    updatedAt: stub.updatedAt,
    defaultSessionId: stub.defaultSessionId,
    defaultAgentId: stub.defaultAgentId,
    metadata: stub.metadata,
  };
}

function stubFromRecord(record: PraxisProjectRecord, agentEntries: PraxisProjectStub["agentEntries"]): PraxisProjectStub {
  return {
    schema: PROJECT_STUB_SCHEMA,
    projectId: record.projectId,
    kind: record.kind,
    name: record.name,
    mainWorkspaceRoot: record.mainWorkspaceRoot,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    defaultSessionId: record.defaultSessionId,
    defaultAgentId: record.defaultAgentId,
    agentEntries,
    metadata: record.metadata,
  };
}

function processLooksAlive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLease(lockPath: string): Promise<PraxisProjectLeaseRecord | undefined> {
  try {
    const raw = JSON.parse(await readFile(lockPath, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
    const record = raw as Partial<PraxisProjectLeaseRecord>;
    if (!hasText(record.projectId) || !hasText(record.ownerId) || !hasText(record.acquiredAt)) return undefined;
    const metadata = typeof record.metadata === "object" && record.metadata !== null && !Array.isArray(record.metadata)
      ? record.metadata
      : {};
    return {
      leaseId: hasText(record.leaseId) ? record.leaseId : typeof metadata.leaseId === "string" ? metadata.leaseId : `${record.ownerId}:${record.acquiredAt}`,
      projectId: record.projectId,
      ownerId: record.ownerId,
      runtimeId: record.runtimeId,
      processId: record.processId,
      acquiredAt: record.acquiredAt,
      heartbeatAt: record.heartbeatAt ?? record.acquiredAt,
      expiresAt: record.expiresAt ?? record.acquiredAt,
      status: record.status ?? "active",
      metadata,
    };
  } catch {
    return undefined;
  }
}

function isSameLease(left: PraxisProjectLeaseRecord | undefined, right: PraxisProjectLeaseRecord): boolean {
  return left?.projectId === right.projectId && left.leaseId === right.leaseId;
}

function isLeaseTakeoverAllowed(lease: PraxisProjectLeaseRecord | undefined, now: string): boolean {
  if (lease === undefined) return true;
  if (lease.status !== "active") return true;
  if (Date.parse(lease.expiresAt) <= Date.parse(now)) return true;
  return !processLooksAlive(lease.processId);
}

async function acquireProjectLease(input: {
  projectId: string;
  lockPath: string;
  ownerId: string;
  runtimeId?: string;
  now: string;
  store: PraxisFoundationStore;
}): Promise<{ ok: true; lease: PraxisProjectLeaseRecord; events: readonly string[] } | { ok: false; message: string }> {
  const lockDir = `${input.lockPath}.d`;
  let previous = await readLease(input.lockPath);
  let ownsLockDir = false;
  try {
    await mkdir(lockDir);
    ownsLockDir = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (previous === undefined) {
      const lockDirStat = await stat(lockDir).catch(() => undefined);
      const staleAt = lockDirStat === undefined
        ? Number.POSITIVE_INFINITY
        : lockDirStat.mtimeMs + DEFAULT_LEASE_TTL_MS;
      if (Date.parse(input.now) < staleAt) {
        return { ok: false, message: `project ${input.projectId} is already being initialized by another owner` };
      }
      await rm(lockDir, { recursive: true, force: true });
      try {
        await mkdir(lockDir);
        ownsLockDir = true;
      } catch (retryError) {
        if ((retryError as NodeJS.ErrnoException).code === "EEXIST") {
          return { ok: false, message: `project ${input.projectId} is already being initialized by another owner` };
        }
        throw retryError;
      }
      previous = await readLease(input.lockPath);
      if (previous !== undefined && !isLeaseTakeoverAllowed(previous, input.now)) {
        if (ownsLockDir) await rm(lockDir, { recursive: true, force: true });
        return { ok: false, message: `project ${input.projectId} is already locked by ${previous.ownerId}` };
      }
    }
    if (!isLeaseTakeoverAllowed(previous, input.now)) {
      return { ok: false, message: `project ${input.projectId} is already locked by ${previous?.ownerId ?? "another owner"}` };
    }
    await rm(lockDir, { recursive: true, force: true });
    try {
      await mkdir(lockDir);
      ownsLockDir = true;
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code === "EEXIST") {
        previous = await readLease(input.lockPath);
        return { ok: false, message: `project ${input.projectId} is already locked by ${previous?.ownerId ?? "another owner"}` };
      }
      throw retryError;
    }
  }
  if (!isLeaseTakeoverAllowed(previous, input.now)) {
    if (ownsLockDir) await rm(lockDir, { recursive: true, force: true });
    return { ok: false, message: `project ${input.projectId} is already locked by ${previous?.ownerId ?? "another owner"}` };
  }
  const expiresAt = new Date(Date.parse(input.now) + DEFAULT_LEASE_TTL_MS).toISOString();
  const leaseId = `lease.${randomUUID()}`;
  const lease: PraxisProjectLeaseRecord = {
    leaseId,
    projectId: input.projectId,
    ownerId: input.ownerId,
    runtimeId: input.runtimeId,
    processId: process.pid,
    acquiredAt: input.now,
    heartbeatAt: input.now,
    expiresAt,
    status: "active",
    metadata: previous === undefined
      ? { leaseId }
      : { leaseId, tookOverOwnerId: previous.ownerId, tookOverLeaseId: previous.leaseId },
  };
  await writeJsonAtomic(input.lockPath, lease);
  await input.store.appendLease(lease);
  return {
    ok: true,
    lease,
    events: previous === undefined ? ["runtime.projectPlane.lock.acquired"] : ["runtime.projectPlane.lock.takenOver"],
  };
}

function normalizeAgentEntries(spec: PraxisProjectSpec | undefined): PraxisProjectStub["agentEntries"] {
  return Object.fromEntries(Object.entries(spec?.agents ?? {}).map(([key, entry]) => [key, {
    agentId: entry.agentId,
    role: entry.role,
    entry: entry.entry,
    exportName: entry.exportName,
    metadata: entry.metadata,
  }]));
}

function defaultAgentId(stub: PraxisProjectStub, spec: PraxisProjectSpec | undefined): string | undefined {
  const defaultKey = spec?.sessions.defaultAgent ?? "primary";
  return stub.agentEntries[defaultKey]?.agentId ?? stub.defaultAgentId;
}

export async function openPraxisProject(input: PraxisProjectOpenOptions = {}): Promise<PraxisProjectOpenResult> {
  const now = input.now?.() ?? new Date().toISOString();
  const mode = input.mode ?? "open-or-create";
  const persistence = input.persistence ?? input.spec?.workspace.persistence ?? "sqlite";
  const storageResult = persistence === "sqlite"
    ? await createAndApplyStoragePlaneRuntime({
      cwd: input.cwd,
      raxHome: input.raxHome,
      homeDir: input.homeDir,
      workspaceRoot: input.workspaceRoot === undefined && input.spec?.workspace.root !== "auto" ? input.spec?.workspace.root : input.workspaceRoot,
      initMode: "on-run",
    })
    : createStoragePlaneRuntime({
      cwd: input.cwd,
      raxHome: input.raxHome,
      homeDir: input.homeDir,
      workspaceRoot: input.workspaceRoot === undefined && input.spec?.workspace.root !== "auto" ? input.spec?.workspace.root : input.workspaceRoot,
      initMode: "never",
    });
  if (!storageResult.ok) return failure(storageResult.error.code, storageResult.error.message, storageResult.events);
  const storage = storageResult.runtime;
  const stubPath = path.join(storage.layout.workspace.root, "project.json");
  const lockPath = path.join(storage.layout.workspace.root, "project.lock");
  const existingStub = await readStub(stubPath);
  if (mode === "open" && existingStub === undefined) {
    return failure("PROJECT_NOT_FOUND", `project stub was not found: ${stubPath}`, storageResult.events);
  }
  if (mode === "create" && existingStub !== undefined && input.overwrite !== true) {
    return failure("PROJECT_ALREADY_EXISTS", `project already exists in workspace: ${stubPath}`, storageResult.events);
  }

  const projectId = input.projectId?.trim()
    || input.spec?.projectId
    || existingStub?.projectId
    || defaultProjectId(storage.layout.workspace.root);
  const kind = input.kind ?? input.spec?.projectKind ?? existingStub?.kind ?? "chat";
  const agentEntries = existingStub?.agentEntries ?? normalizeAgentEntries(input.spec);
  const record: PraxisProjectRecord = existingStub === undefined || input.overwrite === true
    ? {
        projectId,
        kind,
        name: input.name ?? input.spec?.name,
        mainWorkspaceRoot: storage.layout.workspace.root,
        createdAt: now,
        updatedAt: now,
        defaultAgentId: undefined,
        metadata: input.spec?.metadata ?? {},
      }
    : {
        ...projectRecordFromStub(existingStub),
        updatedAt: now,
      };
  const stub = stubFromRecord({ ...record, defaultAgentId: record.defaultAgentId ?? defaultAgentId({ ...stubFromRecord(record, agentEntries), agentEntries }, input.spec) }, agentEntries);
  const store = persistence === "sqlite"
    ? await createSqliteProjectStore(storage.layout.workspace.sessionSqlitePath)
    : createInMemoryProjectStore();
  const mainWorkspace: PraxisProjectWorkspaceRecord = {
    workspaceId: "workspace.main",
    projectId: stub.projectId,
    root: storage.layout.workspace.root,
    role: "main",
    createdAt: existingStub?.createdAt ?? now,
    metadata: { source: storage.workspace.source },
  };

  let lease: PraxisProjectLeaseRecord | undefined;
  let storeClosed = false;
  async function closeStoreOnce(): Promise<void> {
    if (storeClosed) return;
    storeClosed = true;
    await store.close?.();
  }
  async function releaseCurrentLease(currentLease: PraxisProjectLeaseRecord): Promise<void> {
    const releasedAt = new Date().toISOString();
    await store.releaseLease(currentLease, releasedAt);
    const current = await readLease(lockPath);
    if (isSameLease(current, currentLease)) {
      await writeJsonAtomic(lockPath, { ...current, status: "released", heartbeatAt: releasedAt, expiresAt: releasedAt });
      await rm(`${lockPath}.d`, { recursive: true, force: true });
    }
  }
  const events = [...storageResult.events, "runtime.projectPlane.project.opened"];
  if (input.acquireLock ?? true) {
    const acquired = await acquireProjectLease({
      projectId: stub.projectId,
      lockPath,
      ownerId: input.ownerId ?? `owner.${process.pid}`,
      runtimeId: input.runtimeId,
      now,
      store,
    });
    if (!acquired.ok) {
      await closeStoreOnce();
      return failure("PROJECT_LOCKED", acquired.message, events);
    }
    lease = acquired.lease;
    events.push(...acquired.events);
  }
  try {
    await store.upsertProject(projectRecordFromStub(stub));
    await store.upsertWorkspace(mainWorkspace);
    await writeJsonAtomic(stubPath, stub);
  } catch (error) {
    if (lease !== undefined) {
      await releaseCurrentLease(lease).catch(() => undefined);
      lease = undefined;
    }
    await closeStoreOnce();
    return failure("PROJECT_OPEN_FAILED", error instanceof Error ? error.message : String(error), events);
  }

  const runtime: PraxisProjectRuntime = {
    kind: "praxis.projectRuntime",
    project: projectRecordFromStub(stub),
    stub,
    storage,
    store,
    lease,
    paths: {
      projectStubPath: stubPath,
      projectLockPath: lockPath,
      sessionSqlitePath: storage.layout.workspace.sessionSqlitePath,
      artifactRoot: storage.layout.workspace.artifacts,
    },
    sessions: {
      list: async () => await store.listSessions(stub.projectId),
    },
    artifacts: {
      importFile: async (artifactInput) => {
        const createdAt = artifactInput.now ?? new Date().toISOString();
        const artifactId = artifactInput.artifactId ?? `artifact.${artifactInput.kind ?? "file"}.${Date.now()}.${randomUUID().slice(0, 8)}`;
        const month = createdAt.slice(0, 7);
        const targetDir = path.join(storage.layout.workspace.artifacts, month, artifactId);
        await mkdir(targetDir, { recursive: true });
        const sourceName = path.basename(artifactInput.sourcePath);
        const targetPath = path.join(targetDir, sourceName);
        await copyFile(artifactInput.sourcePath, targetPath, constants.COPYFILE_FICLONE_FORCE).catch(async () => {
          await copyFile(artifactInput.sourcePath, targetPath);
        });
        const artifact: PraxisArtifactRecord = {
          artifactId,
          projectId: stub.projectId,
          sessionId: artifactInput.sessionId,
          kind: artifactInput.kind ?? "file",
          uri: targetPath,
          createdAt,
          metadata: {
            sourcePath: artifactInput.sourcePath,
            copiedIntoProject: true,
          },
        };
        await store.upsertArtifact(artifact);
        return artifact;
      },
      list: async (sessionId) => await store.listArtifacts(stub.projectId, sessionId),
    },
    upgradeChatProject: async (upgradeInput = {}) => {
      const updatedAt = upgradeInput.now ?? new Date().toISOString();
      await store.updateProjectKind(stub.projectId, "workspace-project", updatedAt);
      const updated: PraxisProjectRecord = { ...projectRecordFromStub(stub), kind: "workspace-project", updatedAt };
      const upgradedStub = stubFromRecord(updated, stub.agentEntries);
      await writeJsonAtomic(stubPath, upgradedStub);
      runtime.project = updated;
      runtime.stub = upgradedStub;
      return updated;
    },
    release: async () => {
      if (lease !== undefined) {
        await releaseCurrentLease(lease);
        lease = undefined;
        runtime.lease = undefined;
      }
      await closeStoreOnce();
    },
  };
  return { ok: true, runtime, events };
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function defaultPraxisProjectHome(): string {
  return path.join(os.homedir(), ".rax");
}
