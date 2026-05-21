export type ManagedDependencyRecord = {
  dependencyId: string;
  status: "available" | "installed" | "missing" | "failed";
  version?: string;
  resolvedPath?: string;
  observedAt?: string;
  lastError?: string;
};

export async function readManagedDependencyRecord(
  _managedRoot: string,
  _dependencyId: string,
): Promise<ManagedDependencyRecord | undefined> {
  return undefined;
}
