/*
 * 文件定位：raxode-cli/backend application local runner。
 * 核心目的：用与 TUI/GUI 相同的 Raxode 后端入口做本地 smoke，而不是绕开 readiness/auth/model/sandbox 配置。
 */

import type {
  RaxodeBackendCommand,
  RaxodeBackendOptions,
} from "../raxodeBackend.js";
import { createRaxodeBackend } from "../raxodeBackend.js";
import { raxodeApplication } from "./raxodeApplication.js";

function optionValue(arg: string, prefix: string): string | undefined {
  return arg.startsWith(prefix) ? arg.slice(prefix.length).trim() || undefined : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseRunnerArgs(argv: readonly string[]): {
  backend: RaxodeBackendOptions;
  command: RaxodeBackendCommand;
} {
  const backend: RaxodeBackendOptions = {};
  const command: RaxodeBackendCommand = {
    mode: argv.includes("--live") ? "live" : "dry-run",
  };
  const taskParts: string[] = [];

  for (const arg of argv) {
    if (arg === "--live" || arg === "--dry-run") continue;
    if (arg === "--minimal-tools") {
      backend.includeAllCatalogTools = false;
      continue;
    }
    if (arg === "--all-catalog-tools") {
      backend.includeAllCatalogTools = true;
      continue;
    }
    const policy = optionValue(arg, "--policy=");
    if (policy !== undefined) {
      backend.policyProfile = policy as RaxodeBackendOptions["policyProfile"];
      command.permissionProfile = backend.policyProfile;
      continue;
    }
    const sandbox = optionValue(arg, "--sandbox=");
    if (sandbox !== undefined) {
      backend.sandboxProfile = sandbox as RaxodeBackendOptions["sandboxProfile"];
      continue;
    }
    const persistence = optionValue(arg, "--persistence=");
    if (persistence !== undefined) {
      backend.persistence = persistence as RaxodeBackendOptions["persistence"];
      continue;
    }
    const model = optionValue(arg, "--model=");
    if (model !== undefined) {
      backend.model = model;
      command.model = model;
      continue;
    }
    const reasoningEffort = optionValue(arg, "--reasoning=");
    if (reasoningEffort !== undefined) {
      backend.reasoningEffort = reasoningEffort as RaxodeBackendOptions["reasoningEffort"];
      command.reasoningEffort = backend.reasoningEffort;
      continue;
    }
    const maxOutputTokens = parsePositiveInteger(optionValue(arg, "--max-output-tokens="));
    if (maxOutputTokens !== undefined) {
      backend.maxOutputTokens = maxOutputTokens;
      continue;
    }
    const provider = optionValue(arg, "--provider=");
    if (provider !== undefined) {
      backend.provider = provider as RaxodeBackendOptions["provider"];
      continue;
    }
    const endpointShape = optionValue(arg, "--endpoint-shape=");
    if (endpointShape !== undefined) {
      backend.endpointShape = endpointShape as RaxodeBackendOptions["endpointShape"];
      continue;
    }
    const providerRoute = optionValue(arg, "--provider-route=");
    if (providerRoute !== undefined) {
      backend.providerRoute = providerRoute as RaxodeBackendOptions["providerRoute"];
      continue;
    }
    const baseURL = optionValue(arg, "--base-url=");
    if (baseURL !== undefined) {
      backend.baseURL = baseURL;
      continue;
    }
    if (!arg.startsWith("--")) {
      taskParts.push(arg);
    }
  }

  command.task = taskParts.join(" ").trim() || "Describe the Raxode application backend readiness.";
  return { backend, command };
}

async function main(): Promise<void> {
  const parsed = parseRunnerArgs(process.argv.slice(2));
  const backend = await createRaxodeBackend(parsed.backend);
  const readiness = await backend.inspectReadiness();
  const result = await backend.run({
    ...parsed.command,
    cwd: process.cwd(),
  });

  console.log(JSON.stringify({
    application: raxodeApplication,
    backend: {
      backendId: backend.backendId,
      projectRoot: backend.projectRoot,
      readiness,
    },
    result,
  }, null, 2));

  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
