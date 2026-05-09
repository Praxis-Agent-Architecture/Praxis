/*
 * 文件定位：raxode-cli / 前后端装配入口。
 * 核心目的：把干净 TUI 壳和 agentCore 后端适配通过 application contract 接起来。
 * 边界：入口只做参数解析和装配，不承载旧 raxode 后端逻辑。
 */

import { pathToFileURL } from "node:url";

import { createAgentCoreRaxodeBackend } from "./backend/agentCoreBackend.js";
import { renderRaxodeApplicationTui } from "./frontend/tuiShell.js";

export { createAgentCoreRaxodeBackend } from "./backend/agentCoreBackend.js";
export type {
  RaxodeApplicationBackend,
  RaxodeApplicationBackendResult,
  RaxodeApplicationCommand,
  RaxodeApplicationEvent,
  RaxodeApplicationRunMode,
  RaxodeApplicationStatus,
  RaxodeApplicationViewModel,
} from "./contracts.js";
export { RaxodeApplicationTui, renderRaxodeApplicationTui } from "./frontend/tuiShell.js";

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

export async function runRaxodeCli(argv = process.argv.slice(2)): Promise<number> {
  if (hasFlag(argv, "--help") || argv.length === 0) {
    process.stdout.write("Usage: raxode-cli [agent-path] [task...] [--profile coding-full|framework-proof|custom-agent] [--export name] [--json] [--live] [--allow-tools]\n");
    return 0;
  }
  const firstValue = argv.find((value) => !value.startsWith("--"));
  const agentPath = firstValue;
  const task = argv
    .filter((value) => value !== agentPath)
    .filter((value, index, values) => {
      if (value.startsWith("--")) return false;
      const previous = values[index - 1];
      return previous !== "--export" && previous !== "--profile";
    })
    .join(" ")
    .trim();
  const backend = createAgentCoreRaxodeBackend();
  const result = await backend.run({
    kind: "run-agent",
    agentPath,
    exportName: argValue(argv, "--export"),
    task: task || undefined,
    profile: (argValue(argv, "--profile") as never) ?? undefined,
    mode: hasFlag(argv, "--live") ? "live" : "dry-run",
    allowToolExecution: hasFlag(argv, "--allow-tools"),
  });
  if (hasFlag(argv, "--json")) {
    process.stdout.write(`${JSON.stringify(result.view, null, 2)}\n`);
  } else {
    renderRaxodeApplicationTui(result.view);
  }
  return result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runRaxodeCli();
}
