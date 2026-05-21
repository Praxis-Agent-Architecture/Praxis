export type ShellWorkspaceWriteGuardReason =
  | "outside-workspace"
  | "readonly-workspace"
  | "blocked-by-policy"
  | "unknown";

export function describeShellWorkspaceWrite(reason: ShellWorkspaceWriteGuardReason | string): string {
  return `shell workspace write guard: ${reason}`;
}

export function shellWorkspaceWriteGuardMessage(reason: ShellWorkspaceWriteGuardReason | string): string {
  return describeShellWorkspaceWrite(reason);
}
