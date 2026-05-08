import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  listBaseToolDeveloperCatalog,
  lowerPraxisToolsForProvider,
  snapshotBaseToolRealityLedger,
  tryBaseToolById,
  type ProviderToolSchemaFamily,
} from "../../src/agentCore/index.js";

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

type RealityMatrixRow = {
  readonly toolId: string;
  readonly family: string;
  readonly group: string;
  readonly catalogMounted: boolean;
  readonly providerSchemaReady: boolean;
  readonly modelCallable: boolean;
  readonly governanceReady: boolean;
  readonly dependencyReady: boolean;
  readonly hostAdapterReady: boolean;
  readonly liveSmokeReady: boolean;
  readonly officialShape: string;
  readonly missingReason?: string;
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
  const reality = snapshotBaseToolRealityLedger();
  const realityByToolId = new Map(reality.entries.map((entry) => [entry.toolId, entry]));
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

  const providerFamilies: readonly ProviderToolSchemaFamily[] = ["openaiResponses", "anthropicMessages", "geminiGenerateContent"];
  const realityMatrix: RealityMatrixRow[] = catalog.map((tool) => {
    const lookup = tryBaseToolById(tool.toolId);
    const entry = realityByToolId.get(tool.toolId);
    let schemaReady = lookup.ok;
    let schemaError: string | undefined;
    if (lookup.ok) {
      for (const providerFamily of providerFamilies) {
        try {
          const lowered = lowerPraxisToolsForProvider({
            providerFamily,
            tools: [lookup.tool],
            includeRuntimeDecisionTools: false,
          });
          if (lowered.tools.length !== 1 || lowered.mappings[0]?.toolId !== tool.toolId) {
            schemaReady = false;
            schemaError = `${providerFamily} lowering did not preserve tool mapping`;
            break;
          }
        } catch (error) {
          schemaReady = false;
          schemaError = error instanceof Error ? error.message : `${providerFamily} lowering failed`;
          break;
        }
      }
    }

    const catalogMounted = entry?.registry === "mounted";
    const hostAdapterReady = entry?.stages.hostReady === "ready";
    const dependencyReady = entry?.stages.dependencyReady === "ready" || entry?.stages.dependencyReady === "requiresApproval";
    const governanceReady = entry?.stages.mounted === "ready" && entry?.stages.contractReady === "ready";
    const liveSmokeReady = coveredIds.includes(tool.toolId);
    const missingReason = [
      catalogMounted ? undefined : "not mounted in registry",
      schemaReady ? undefined : `provider schema not ready${schemaError === undefined ? "" : `: ${schemaError}`}`,
      governanceReady ? undefined : "governance/contract not ready",
      dependencyReady ? undefined : "dependency preflight not ready",
      hostAdapterReady ? undefined : "host adapter not ready",
      liveSmokeReady ? undefined : "not yet covered by repeatable live/no-model matrix",
    ].filter((item): item is string => item !== undefined).join("; ") || undefined;

    return {
      toolId: tool.toolId,
      family: tool.family,
      group: tool.group,
      catalogMounted,
      providerSchemaReady: schemaReady,
      modelCallable: schemaReady,
      governanceReady,
      dependencyReady,
      hostAdapterReady,
      liveSmokeReady,
      officialShape: tool.family === "search"
        ? "search.fetch/searchEngine/nativeSearch/ground"
        : tool.family === "mcp"
          ? "mcp.local+remote/native+custom"
          : tool.family === "omni"
            ? "runtime.omni+provider-media-adapter"
            : tool.family === "computeruse"
              ? "linux-desktop-host-adapter"
              : tool.family === "skill"
                ? "local-context-skill-injection"
                : "BaseToolExecutorPort",
      missingReason,
    };
  }).sort((left, right) => left.toolId.localeCompare(right.toolId));

  const runtimeReadyRows = realityMatrix.filter((row) => (
    row.catalogMounted &&
    row.providerSchemaReady &&
    row.modelCallable &&
    row.governanceReady &&
    row.dependencyReady &&
    row.hostAdapterReady
  ));

  const summary = {
    ok: runtimeReadyRows.length === catalogIds.length && Object.values(matrixRuns).every((run) => run.ok !== false),
    catalog: {
      total: catalogIds.length,
      byFamily: catalogByFamily,
    },
    realityMatrixCoverage: {
      covered: runtimeReadyRows.length,
      missing: catalogIds.length - runtimeReadyRows.length,
      liveSmokeCovered: realityMatrix.filter((row) => row.liveSmokeReady).length,
      liveSmokeMissing: realityMatrix.filter((row) => !row.liveSmokeReady).length,
      byExecutorSupport: reality.byExecutorSupport,
      byDependencyStatus: reality.byDependencyStatus,
      missingToolIds: realityMatrix.filter((row) => row.missingReason !== undefined && !runtimeReadyRows.some((ready) => ready.toolId === row.toolId)).map((row) => row.toolId),
      rows: realityMatrix,
    },
    matrixCoverage: {
      covered: coveredIds.length,
      missing: missingMatrixCoverage.length,
      byScript: Object.fromEntries([...coveredByScript.entries()].map(([family, ids]) => [family, ids.length])),
      missingToolIds: missingMatrixCoverage,
      unknownCoveredIds,
    },
    matrixRuns,
    note: "realityMatrixCoverage is the 175-tool runtime readiness ledger. matrixCoverage is the stricter repeatable smoke coverage and may lag behind host readiness.",
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

await main();
