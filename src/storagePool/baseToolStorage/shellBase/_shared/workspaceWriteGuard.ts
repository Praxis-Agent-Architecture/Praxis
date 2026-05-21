export function describeShellWorkspaceWrite(input: string | {
  cwd?: string;
  command?: string;
  args?: readonly string[];
}): string {
  if (typeof input === "string") return input;
  return [input.command, ...(input.args ?? [])].filter(Boolean).join(" ") || input.cwd || "workspace write";
}

export function shellWorkspaceWriteGuardMessage(input: string | {
  cwd?: string;
  command?: string;
  args?: readonly string[];
}): string {
  return `Shell workspace write requires approval: ${describeShellWorkspaceWrite(input)}`;
}
