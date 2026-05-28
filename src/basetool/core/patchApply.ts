import type {
  BaseToolDefinition,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
} from "../types.js";
import { callRuntimePort, errorResult, okResult, providerUnavailable } from "./results.js";
import { inputRecord, namespaceMethod, requiredStringField } from "./validation.js";

type PatchFileChange =
  | { type: "add"; path: string; content: string }
  | { type: "delete"; path: string }
  | { type: "update"; path: string; hunks: readonly PatchHunk[] };

type PatchHunk = {
  readonly lines: readonly string[];
};

const PATCH_DIFF_PREVIEW_MAX_LINES = 18;
const PATCH_DIFF_PREVIEW_MAX_BYTES = 3_500;

type PatchChangeEntry = {
  readonly path: string;
  readonly changeType: PatchFileChange["type"];
  readonly additions?: number;
  readonly deletions?: number;
};

function countContentLines(content: string): number {
  if (content.length === 0) return 0;
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  if (normalized.length === 0) return 0;
  return normalized.split("\n").length;
}

function statsForChange(change: PatchFileChange): PatchChangeEntry {
  if (change.type === "add") {
    return {
      path: change.path,
      changeType: change.type,
      additions: countContentLines(change.content),
      deletions: 0,
    };
  }
  if (change.type === "delete") {
    return {
      path: change.path,
      changeType: change.type,
    };
  }
  let additions = 0;
  let deletions = 0;
  for (const hunk of change.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      if (line.startsWith("-")) deletions++;
    }
  }
  return {
    path: change.path,
    changeType: change.type,
    additions,
    deletions,
  };
}

function patchDiffPreviewLines(patch: string): string[] {
  if (Buffer.byteLength(patch) > PATCH_DIFF_PREVIEW_MAX_BYTES) return [];
  const lines = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const preview: string[] = [];
  let currentPath = "patch";
  const pushHeader = (path: string): void => {
    currentPath = path.trim() || currentPath;
    const header = `@@ ${currentPath} @@`;
    if (preview[preview.length - 1] !== header) preview.push(header);
  };
  const pushDiff = (marker: "+" | "-", content: string): void => {
    preview.push(`${marker} ${content.length > 0 ? content : " "}`);
  };

  for (const line of lines) {
    if (line === "*** End Patch") break;
    const pathMatch = line.match(/^\*\*\* (?:Add|Create|Create New|Update|Delete) File: (.+)$/u)
      ?? line.match(/^\*\*\* File: (.+)$/u);
    if (pathMatch !== null) {
      pushHeader(pathMatch[1] ?? currentPath);
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice("+++ ".length).replace(/^b\//u, "");
      if (path !== "/dev/null") pushHeader(path);
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = line.slice("--- ".length).replace(/^a\//u, "");
      if (path !== "/dev/null") pushHeader(path);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      pushDiff("+", line.slice(1));
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      pushDiff("-", line.slice(1));
    }
  }

  if (!preview.some((line) => line.startsWith("+") || line.startsWith("-"))) return [];
  if (preview.length <= PATCH_DIFF_PREVIEW_MAX_LINES) return preview;
  return [
    ...preview.slice(0, PATCH_DIFF_PREVIEW_MAX_LINES - 1),
    "... diff preview trimmed",
  ];
}

function sumKnownStats(entries: readonly PatchChangeEntry[], key: "additions" | "deletions"): number | undefined {
  const known = entries.flatMap((entry) => typeof entry[key] === "number" ? [entry[key]] : []);
  if (known.length === 0) return undefined;
  return known.reduce((total, item) => total + item, 0);
}

function parsePatch(patch: string): { ok: true; changes: readonly PatchFileChange[] } | { ok: false; message: string } {
  const normalized = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "*** Begin Patch") return { ok: false, message: "Patch must start with *** Begin Patch." };
  if (!lines.includes("*** End Patch")) return { ok: false, message: "Patch must include *** End Patch." };

  const changes: PatchFileChange[] = [];
  let index = 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line === "*** End Patch") break;
    const addFileMatch = line.match(/^\*\*\* (?:Add|Create|Create New) File: (.+)$/u);
    if (addFileMatch !== null) {
      const filePath = (addFileMatch[1] ?? "").trim();
      if (filePath.length === 0) return { ok: false, message: "Add File path cannot be empty." };
      index++;
      const content: string[] = [];
      while (index < lines.length && !lines[index].startsWith("*** ")) {
        const item = lines[index];
        if (!item.startsWith("+")) return { ok: false, message: `Add File line must start with '+': ${item}` };
        content.push(item.slice(1));
        index++;
      }
      changes.push({ type: "add", path: filePath, content: content.join("\n") + (content.length > 0 ? "\n" : "") });
      continue;
    }
    const fileMatch = line.match(/^\*\*\* File: (.+)$/u);
    if (fileMatch !== null) {
      const filePath = (fileMatch[1] ?? "").trim();
      if (filePath.length === 0) return { ok: false, message: "File path cannot be empty." };
      index++;
      const content: string[] = [];
      while (index < lines.length && !lines[index].startsWith("*** ")) {
        const item = lines[index];
        if (!item.startsWith("+")) return { ok: false, message: `File line must start with '+': ${item}` };
        content.push(item.slice(1));
        index++;
      }
      changes.push({ type: "add", path: filePath, content: content.join("\n") + (content.length > 0 ? "\n" : "") });
      continue;
    }
    if (line === "--- /dev/null" && (lines[index + 1] ?? "").startsWith("+++ ")) {
      const rawFilePath = (lines[index + 1] ?? "").slice("+++ ".length).trim();
      const filePath = rawFilePath.startsWith("b/") ? rawFilePath.slice(2) : rawFilePath;
      if (filePath.length === 0 || filePath === "/dev/null") return { ok: false, message: "Unified add file path cannot be empty." };
      index += 2;
      if ((lines[index] ?? "").startsWith("@@")) index++;
      const content: string[] = [];
      while (index < lines.length && !lines[index].startsWith("*** ") && lines[index] !== "--- /dev/null") {
        const item = lines[index];
        if (item.startsWith("+")) {
          content.push(item.slice(1));
          index++;
          continue;
        }
        if (item.startsWith("-") || item.startsWith(" ")) return { ok: false, message: `Unified add file line must be added content: ${item}` };
        if (item.trim().length === 0) {
          content.push("");
          index++;
          continue;
        }
        return { ok: false, message: `Unified add file line must start with '+': ${item}` };
      }
      changes.push({ type: "add", path: filePath, content: content.join("\n") + (content.length > 0 ? "\n" : "") });
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length).trim();
      if (filePath.length === 0) return { ok: false, message: "Delete File path cannot be empty." };
      changes.push({ type: "delete", path: filePath });
      index++;
      continue;
    }
    if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim();
      if (filePath.length === 0) return { ok: false, message: "Update File path cannot be empty." };
      index++;
      const hunks: PatchHunk[] = [];
      let current: string[] = [];
      while (index < lines.length && !lines[index].startsWith("*** ")) {
        const item = lines[index];
        if (item.startsWith("@@")) {
          if (current.length > 0) {
            hunks.push({ lines: current });
            current = [];
          }
          index++;
          continue;
        }
        if (!item.startsWith(" ") && !item.startsWith("-") && !item.startsWith("+")) {
          return { ok: false, message: `Update hunk line must start with space, '-' or '+': ${item}` };
        }
        current.push(item);
        index++;
      }
      if (current.length > 0) hunks.push({ lines: current });
      if (hunks.length === 0) return { ok: false, message: `Update File ${filePath} has no hunks.` };
      changes.push({ type: "update", path: filePath, hunks });
      continue;
    }
    if (line.trim().length === 0) {
      index++;
      continue;
    }
    return { ok: false, message: `Unsupported patch directive: ${line}` };
  }

  if (changes.length === 0) return { ok: false, message: "Patch has no file changes." };
  return { ok: true, changes };
}

function applyHunks(content: string, hunks: readonly PatchHunk[]): { ok: true; content: string } | { ok: false; message: string } {
  let next = content;
  for (const hunk of hunks) {
    const before = hunk.lines
      .filter((line) => line.startsWith(" ") || line.startsWith("-"))
      .map((line) => line.slice(1))
      .join("\n");
    const after = hunk.lines
      .filter((line) => line.startsWith(" ") || line.startsWith("+"))
      .map((line) => line.slice(1))
      .join("\n");
    const candidates = [before, before + "\n"].filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
    const found = candidates.find((candidate) => next.includes(candidate));
    if (found === undefined) {
      return { ok: false, message: "Patch hunk did not match current file content." };
    }
    const replacement = found.endsWith("\n") && !after.endsWith("\n") ? after + "\n" : after;
    next = next.replace(found, replacement);
  }
  return { ok: true, content: next };
}

async function readCurrentContent(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
  path: string,
): Promise<{ ok: true; content: string } | { ok: false; result: BaseToolInvokeResult }> {
  const readText = namespaceMethod(definition, request, "filesystem", "readText");
  if (!readText.ok) return { ok: false, result: readText.result };
  const result = await readText.value({ path });
  if (!result?.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        toolId: definition.toolId,
        error: result?.error ?? {
          code: "PATCH_READ_FAILED",
          message: `Failed to read ${path} before applying patch.`,
          publicSafe: true,
        },
        events: ["basetool.core.patch.apply.readFailed"],
        metadata: { path },
      },
    };
  }
  const output = result.output ?? result.value;
  const content = typeof output === "string"
    ? output
    : output !== null && typeof output === "object" && typeof (output as { content?: unknown }).content === "string"
      ? (output as { content: string }).content
      : undefined;
  if (content === undefined) {
    return {
      ok: false,
      result: errorResult(definition, "PATCH_READ_INVALID_RESULT", `Runtime read result for ${path} did not include text content.`, {
        metadata: { path },
      }),
    };
  }
  return { ok: true, content };
}

export async function invokePatchApplyCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const patch = requiredStringField(definition, input.value, "patch", { minLength: 1 });
  if (!patch.ok) return patch.result;
  const parsed = parsePatch(patch.value);
  if (!parsed.ok) return errorResult(definition, "INVALID_PATCH", parsed.message);
  const entries = parsed.changes.map(statsForChange);
  const additions = sumKnownStats(entries, "additions");
  const deletions = sumKnownStats(entries, "deletions");
  const diffPreview = patchDiffPreviewLines(patch.value);

  const writeText = namespaceMethod(definition, request, "filesystem", "writeText");
  if (!writeText.ok) return writeText.result;
  const deletePath = request.executor?.filesystem?.deletePath;

  const changed: string[] = [];
  for (const change of parsed.changes) {
    if (change.type === "add") {
      const result = await callRuntimePort(definition, writeText.value({ path: change.path, content: change.content }), {
        portPath: "filesystem.writeText",
        events: ["basetool.core.patch.apply.write"],
        metadata: { path: change.path, changeType: change.type },
      });
      if (!result.ok) return result;
      changed.push(change.path);
      continue;
    }
    if (change.type === "delete") {
      if (deletePath === undefined) return providerUnavailable(definition, "filesystem.deletePath");
      const result = await callRuntimePort(definition, deletePath({ path: change.path }), {
        portPath: "filesystem.deletePath",
        events: ["basetool.core.patch.apply.delete"],
        metadata: { path: change.path, changeType: change.type },
      });
      if (!result.ok) return result;
      changed.push(change.path);
      continue;
    }
    const current = await readCurrentContent(definition, request, change.path);
    if (!current.ok) return current.result;
    const updated = applyHunks(current.content, change.hunks);
    if (!updated.ok) return errorResult(definition, "PATCH_APPLY_FAILED", updated.message, { metadata: { path: change.path } });
    const result = await callRuntimePort(definition, writeText.value({ path: change.path, content: updated.content }), {
      portPath: "filesystem.writeText",
      events: ["basetool.core.patch.apply.update"],
      metadata: { path: change.path, changeType: change.type },
    });
    if (!result.ok) return result;
    changed.push(change.path);
  }

  return okResult(definition, {
    changed,
    changedFiles: changed,
    changeCount: changed.length,
    entries,
    ...(additions === undefined ? {} : { additions }),
    ...(deletions === undefined ? {} : { deletions }),
    ...(changed.length === 1 ? { targetPath: changed[0] } : {}),
    ...(diffPreview.length === 0 ? {} : { diffPreview }),
    summary: `Applied patch to ${changed.length} file${changed.length === 1 ? "" : "s"}.`,
    contextHint: "The patch output records changed files, line stats, and a compact diff preview. Do not reread these files only to confirm this successful patch; use targeted reads only for new evidence, follow-up edits, or failed verification.",
  }, {
    events: ["basetool.core.patch.apply.completed"],
    metadata: { changed, changedFiles: changed, entries, additions, deletions },
  });
}
