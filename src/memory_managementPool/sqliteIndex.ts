import { createHash } from "node:crypto";
import { access, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

import type {
  MemoryArtifactRef,
  MemoryIndexedFile,
  MemoryLayout,
  MemoryReindexResult,
  MemoryScope,
  MemorySourceType,
} from "./types.js";

type SqliteDatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
};

type FileRow = {
  path: string;
  root: string;
  scope: string;
  source_type: string;
  sha256: string;
  mtime_ms: number;
  size_bytes: number;
  line_count: number;
  indexed_at: string;
};

type ArtifactRow = {
  artifact_id: string;
  scope: string | null;
  summary: string;
  source_path: string | null;
  line: number | null;
  metadata_json: string | null;
};

const schema = `
CREATE TABLE IF NOT EXISTS memory_files (
  path TEXT PRIMARY KEY,
  root TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mtime_ms REAL NOT NULL,
  size_bytes INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_artifacts (
  artifact_id TEXT NOT NULL,
  scope TEXT,
  summary TEXT NOT NULL,
  source_path TEXT,
  line INTEGER,
  metadata_json TEXT,
  PRIMARY KEY (artifact_id, source_path, line)
);

CREATE TABLE IF NOT EXISTS memory_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export async function openMemoryIndex(indexPath: string): Promise<SqliteDatabaseSync> {
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(indexPath) as SqliteDatabaseSync;
  configureSqlite(db);
  db.exec(schema);
  return db;
}

function configureSqlite(db: SqliteDatabaseSync): void {
  db.exec("PRAGMA busy_timeout = 5000;");
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    db.exec("PRAGMA journal_mode = DELETE;");
  }
  db.exec("PRAGMA synchronous = NORMAL;");
}

export async function reindexMemoryLayouts(layouts: readonly MemoryLayout[]): Promise<MemoryReindexResult> {
  const indexedAt = new Date().toISOString();
  const nextFiles: MemoryIndexedFile[] = [];
  const artifactRefs: MemoryArtifactRef[] = [];
  for (const layout of layouts) {
    const files = await collectMarkdownFiles(layout);
    for (const filePath of files) {
      const indexed = await indexFile(layout, filePath, indexedAt);
      nextFiles.push(indexed);
      artifactRefs.push(...extractArtifactRefs(filePath, layout.scope, await readFile(filePath, "utf8")));
    }
  }

  const changedFiles: MemoryIndexedFile[] = [];
  for (const layout of layouts) {
    const db = await openMemoryIndexWithRecovery(layout.indexPath);
    try {
      const previous = readIndexedFilesFromDb(db);
      const previousByPath = new Map(previous.map((item) => [item.path, item]));
      for (const item of nextFiles.filter((file) => file.root === layout.root)) {
        const before = previousByPath.get(item.path);
        if (before === undefined || before.sha256 !== item.sha256 || before.mtimeMs !== item.mtimeMs) {
          changedFiles.push(item);
        }
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec("DELETE FROM memory_files");
        const fileInsert = db.prepare(`
          INSERT INTO memory_files (path, root, scope, source_type, sha256, mtime_ms, size_bytes, line_count, indexed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of nextFiles.filter((file) => file.root === layout.root)) {
          fileInsert.run(item.path, item.root, item.scope, item.sourceType, item.sha256, item.mtimeMs, item.sizeBytes, item.lineCount, item.indexedAt);
        }
        db.exec("DELETE FROM memory_artifacts");
        const artifactInsert = db.prepare(`
          INSERT INTO memory_artifacts (artifact_id, scope, summary, source_path, line, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const ref of artifactRefs.filter((ref) => ref.scope === layout.scope || ref.sourcePath?.startsWith(layout.root) === true)) {
          artifactInsert.run(ref.artifactId, ref.scope ?? null, ref.summary, ref.sourcePath ?? null, ref.line ?? null, JSON.stringify(ref.metadata ?? {}));
        }
        db.prepare("INSERT OR REPLACE INTO memory_meta (key, value) VALUES (?, ?)").run("indexed_at", indexedAt);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  }

  return {
    ok: true,
    profile: "full",
    changedFiles,
    indexedFiles: nextFiles,
    artifactRefs,
  };
}

export async function readMemoryIndex(layouts: readonly MemoryLayout[]): Promise<{
  indexAvailable: boolean;
  indexedFiles: readonly MemoryIndexedFile[];
  artifactRefs: readonly MemoryArtifactRef[];
  error?: string;
}> {
  const indexedFiles: MemoryIndexedFile[] = [];
  const artifactRefs: MemoryArtifactRef[] = [];
  let indexAvailable = true;
  let errorMessage: string | undefined;
  for (const layout of layouts) {
    try {
      await access(layout.indexPath);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        indexAvailable = false;
        continue;
      }
      indexAvailable = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      continue;
    }
    try {
      const db = await openMemoryIndex(layout.indexPath);
      try {
        indexedFiles.push(...readIndexedFilesFromDb(db));
        artifactRefs.push(...readArtifactRefsFromDb(db));
      } finally {
        db.close();
      }
    } catch (error) {
      indexAvailable = false;
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }
  return { indexAvailable, indexedFiles, artifactRefs, error: errorMessage };
}

async function openMemoryIndexWithRecovery(indexPath: string): Promise<SqliteDatabaseSync> {
  try {
    return await openMemoryIndex(indexPath);
  } catch {
    await rm(indexPath, { force: true });
    return await openMemoryIndex(indexPath);
  }
}

async function collectMarkdownFiles(layout: MemoryLayout): Promise<readonly string[]> {
  const collected: string[] = [];
  await collect(layout.root, collected);
  return collected.filter((filePath) =>
    filePath.endsWith(".md") &&
    !filePath.includes(`${path.sep}.memory.lock${path.sep}`) &&
    !filePath.endsWith(`${path.sep}.memory.lock`),
  );
}

async function collect(dir: string, output: string[]): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".memory.lock") continue;
      await collect(child, output);
    } else if (entry.isFile()) {
      output.push(child);
    }
  }
}

async function indexFile(layout: MemoryLayout, filePath: string, indexedAt: string): Promise<MemoryIndexedFile> {
  const [content, fileStat] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
  return {
    path: filePath,
    root: layout.root,
    scope: layout.scope,
    sourceType: sourceTypeForPath(layout, filePath),
    sha256: createHash("sha256").update(content).digest("hex"),
    mtimeMs: fileStat.mtimeMs,
    sizeBytes: fileStat.size,
    lineCount: content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length,
    indexedAt,
  };
}

function sourceTypeForPath(layout: MemoryLayout, filePath: string): MemorySourceType {
  if (filePath === layout.longTermPath) return "longTerm";
  if (filePath.startsWith(layout.dailyDir + path.sep)) return "dailyNote";
  if (filePath.startsWith(layout.artifactDir + path.sep)) return "artifact";
  return "externalMarkdown";
}

function extractArtifactRefs(filePath: string, scope: MemoryScope, content: string): MemoryArtifactRef[] {
  const refs: MemoryArtifactRef[] = [];
  const lines = content.split(/\r\n|\r|\n/);
  const artifactPattern = /\bartifact:([A-Za-z0-9._:-]+)/g;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const match of line.matchAll(artifactPattern)) {
      refs.push({
        artifactId: match[1],
        scope,
        summary: line.trim(),
        sourcePath: filePath,
        line: index + 1,
      });
    }
  }
  return refs;
}

function readIndexedFilesFromDb(db: SqliteDatabaseSync): readonly MemoryIndexedFile[] {
  const rows = db.prepare("SELECT * FROM memory_files ORDER BY scope, path").all() as FileRow[];
  return rows.map((row) => ({
    path: row.path,
    root: row.root,
    scope: row.scope as MemoryScope,
    sourceType: row.source_type as MemorySourceType,
    sha256: row.sha256,
    mtimeMs: row.mtime_ms,
    sizeBytes: row.size_bytes,
    lineCount: row.line_count,
    indexedAt: row.indexed_at,
  }));
}

function readArtifactRefsFromDb(db: SqliteDatabaseSync): readonly MemoryArtifactRef[] {
  const rows = db.prepare("SELECT * FROM memory_artifacts ORDER BY scope, artifact_id").all() as ArtifactRow[];
  return rows.map((row) => ({
    artifactId: row.artifact_id,
    scope: row.scope === "project" || row.scope === "global" ? row.scope : undefined,
    summary: row.summary,
    sourcePath: row.source_path ?? undefined,
    line: row.line ?? undefined,
    metadata: parseMetadata(row.metadata_json),
  }));
}

function parseMetadata(value: string | null): Readonly<Record<string, unknown>> | undefined {
  if (value === null || value.trim().length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Readonly<Record<string, unknown>>
      : undefined;
  } catch {
    return undefined;
  }
}
