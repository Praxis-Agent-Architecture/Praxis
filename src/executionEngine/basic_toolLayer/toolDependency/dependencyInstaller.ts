export type EnsureDependencyAvailableResult = {
  ok: true;
  availability: {
    dependencyId: string;
    status: "available" | "installed";
    installedNow: boolean;
  };
  events: readonly string[];
} | {
  ok: false;
  error: {
    code: "DEPENDENCY_INSTALL_APPROVAL_REQUIRED" | "DEPENDENCY_INSTALL_FAILED";
    message: string;
    publicSafe: true;
  };
  events: readonly string[];
};

export type EnsureDependencyAvailableRequest = {
  dependencyId: string;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  timeoutMs?: number;
};

export async function ensureDependencyAvailable(
  request: EnsureDependencyAvailableRequest,
): Promise<EnsureDependencyAvailableResult> {
  return {
    ok: false,
    error: {
      code: "DEPENDENCY_INSTALL_APPROVAL_REQUIRED",
      message: `Dependency ${request.dependencyId} requires approval while basic_toolLayer is being rewritten`,
      publicSafe: true,
    },
    events: ["agentCore.basicTool.dependencyInstaller.approvalRequired"],
  };
}
