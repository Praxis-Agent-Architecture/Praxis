/*
 * 文件定位：raxode-cli/backend application Raxcell provider bridge。
 * 核心目的：把 TUI/backend 的 linuxBubblewrap 配置解析成 Praxis 沙箱执行端口。
 * 边界：这里只装配执行 provider；策略、审批和 fallback 仍由 Praxis runtime/policy middleware 决定。
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import type { SandboxExecutionProviderPort } from "@praxis-ai/praxis/agent-core";

import type { RaxodeOptions } from "../agents/codingAgent/config/raxodeOptions.js";

export type RaxodeRaxcellSandboxProviderOptions = Pick<RaxodeOptions, "sandboxProfile"> & {
  sandboxProvider?: SandboxExecutionProviderPort;
  env?: Readonly<Record<string, string | undefined>>;
  pathEnv?: string;
  platform?: NodeJS.Platform;
  fileExists?: (filePath: string) => boolean;
};

function executableNames(name: string, platform: NodeJS.Platform): readonly string[] {
  if (platform !== "win32") return [name];
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  return [name, ...extensions.map((extension) => `${name}${extension.toLowerCase()}`), ...extensions.map((extension) => `${name}${extension.toUpperCase()}`)];
}

export function resolveRaxodeRaxcellBinaryPath(
  options: Pick<RaxodeRaxcellSandboxProviderOptions, "env" | "pathEnv" | "platform" | "fileExists"> = {},
): string | undefined {
  const explicitBinary = (options.env?.RAXCELL_BIN ?? process.env.RAXCELL_BIN)?.trim();
  const fileExists = options.fileExists ?? existsSync;
  if (explicitBinary !== undefined && explicitBinary.length > 0) {
    return fileExists(explicitBinary) ? explicitBinary : undefined;
  }
  const platform = options.platform ?? process.platform;
  const entries = (options.pathEnv ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    for (const name of executableNames("raxcell", platform)) {
      const candidate = path.join(entry, name);
      if (fileExists(candidate)) return candidate;
    }
  }
  return undefined;
}

export function resolveRaxodeRaxcellSandboxProvider(
  options: RaxodeRaxcellSandboxProviderOptions,
): SandboxExecutionProviderPort | undefined {
  if (options.sandboxProvider !== undefined) return options.sandboxProvider;
  if (options.sandboxProfile !== "linuxBubblewrap") return undefined;
  const binaryPath = resolveRaxodeRaxcellBinaryPath(options);
  if (binaryPath === undefined) return undefined;
  return praxis.sandboxPlane.createRaxcellSandboxProvider({ binaryPath });
}
