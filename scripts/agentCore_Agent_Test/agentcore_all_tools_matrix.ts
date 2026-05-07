import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { listBaseToolDeveloperCatalog } from "../../src/agentCore/index.js";

type MatrixScript = {
  readonly family: string;
  readonly path: string;
  readonly coveragePaths?: readonly string[];
};

type MatrixRunSummary = {
  readonly ok: boolean;
  readonly total?: number;
  readonly passed?: number;
  readonly failed?: number;
  readonly failedTools?: readonly string[];
};

const args = process.argv.slice(2);
const argSet = new Set(args);
const scriptPath = fileURLToPath(import.meta.url);
const architectureRoot = path.resolve(path.dirname(scriptPath), "../..");

const matrixScripts: readonly MatrixScript[] = [
  {
    family: "shell",
    path: "scripts/agentCore_Agent_Test/agentcore_shell_live_matrix.ts",
    coveragePaths: ["scripts/agentCore_Agent_Test/shellFullCapabilities.ts"],
  },
  { family: "git", path: "scripts/agentCore_Agent_Test/agentcore_git_live_matrix.ts" },
  { family: "code", path: "scripts/agentCore_Agent_Test/agentcore_codebase_explore_live_matrix.ts" },
  { family: "skill", path: "scripts/agentCore_Agent_Test/agentcore_skill_live_matrix.ts" },
  { family: "omni", path: "scripts/agentCore_Agent_Test/agentcore_omni_live_matrix.ts" },
  { family: "computeruse", path: "scripts/agentCore_Agent_Test/agentcore_computeruse_live_matrix.ts" },
] as const;

function extractCoveredToolIds(filePaths: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const filePath of filePaths) {
    const content = readFileSync(path.join(architectureRoot, filePath), "utf8");
    for (const match of content.matchAll(/toolId:\s*"([^"]+)"/gu)) {
      ids.add(match[1] ?? "");
    }
  }
  ids.delete("");
  return [...ids].sort();
}

function parseJsonLines(output: string): MatrixRunSummary | undefined {
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of [...lines].reverse()) {
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      if (typeof record.ok === "boolean" && typeof record.total === "number") {
        return {
          ok: record.ok,
          total: record.total,
          passed: typeof record.passed === "number" ? record.passed : undefined,
          failed: typeof record.failed === "number" ? record.failed : undefined,
          failedTools: Array.isArray(record.failedTools) ? record.failedTools.filter((item): item is string => typeof item === "string") : undefined,
        };
      }
    } catch {
      continue;
    }
  }
  const summaryStart = output.lastIndexOf("{\n  \"ok\"");
  if (summaryStart >= 0) {
    try {
      const parsed = JSON.parse(output.slice(summaryStart).trim()) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (typeof record.ok === "boolean" && typeof record.total === "number") {
          return {
            ok: record.ok,
            total: record.total,
            passed: typeof record.passed === "number" ? record.passed : undefined,
            failed: typeof record.failed === "number" ? record.failed : undefined,
            failedTools: Array.isArray(record.failedTools) ? record.failedTools.filter((item): item is string => typeof item === "string") : undefined,
          };
        }
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function runMatrix(script: MatrixScript): Promise<MatrixRunSummary> {
  const childArgs = ["--import", "tsx", script.path, "--no-model"];
  return await new Promise<MatrixRunSummary>((resolve) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: architectureRoot,
      env: { ...process.env, AGENTCORE_LIVE_TEST: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      const parsed = parseJsonLines(stdout);
      if (parsed !== undefined && code === 0) {
        resolve(parsed);
        return;
      }
      resolve({
        ok: false,
        failedTools: [`${script.family}:matrix-process-failed:${code ?? "unknown"}:${stderr.slice(0, 240)}`],
      });
    });
  });
}

async function main(): Promise<void> {
  const catalog = listBaseToolDeveloperCatalog();
  const catalogIds = catalog.map((tool) => tool.toolId).sort();
  const catalogByFamily: Record<string, number> = {};
  for (const tool of catalog) {
    catalogByFamily[tool.family] = (catalogByFamily[tool.family] ?? 0) + 1;
  }

  const coveredByScript = new Map<string, string[]>();
  for (const script of matrixScripts) {
    coveredByScript.set(script.family, extractCoveredToolIds(script.coveragePaths ?? [script.path]));
  }

  const coveredIds = [...new Set([...coveredByScript.values()].flat())].sort();
  const missingMatrixCoverage = catalogIds.filter((id) => !coveredIds.includes(id));
  const unknownCoveredIds = coveredIds.filter((id) => !catalogIds.includes(id));

  const runMatrices = !argSet.has("--coverage-only");
  const matrixRuns: Record<string, MatrixRunSummary> = {};
  if (runMatrices) {
    for (const script of matrixScripts) {
      matrixRuns[script.family] = await runMatrix(script);
    }
  }

  const summary = {
    ok: missingMatrixCoverage.length === 0 && Object.values(matrixRuns).every((run) => run.ok !== false),
    catalog: {
      total: catalogIds.length,
      byFamily: catalogByFamily,
    },
    matrixCoverage: {
      covered: coveredIds.length,
      missing: missingMatrixCoverage.length,
      byScript: Object.fromEntries([...coveredByScript.entries()].map(([family, ids]) => [family, ids.length])),
      missingToolIds: missingMatrixCoverage,
      unknownCoveredIds,
    },
    matrixRuns,
    note: "This script runs existing safe no-model matrices and reports coverage gaps. Missing coverage means no repeatable matrix case exists yet, not necessarily that the tool handler is absent.",
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

await main();
