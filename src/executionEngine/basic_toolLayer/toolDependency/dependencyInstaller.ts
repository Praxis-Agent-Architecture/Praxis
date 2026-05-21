export type EnsureDependencyAvailableResult = {
  dependencyId: string;
  status: "available" | "installed" | "requiresApproval" | "blocked";
  publicSafe: true;
  message: string;
};

export async function ensureDependencyAvailable(input: {
  dependencyId: string;
  allowInstall?: boolean;
}): Promise<EnsureDependencyAvailableResult> {
  return {
    dependencyId: input.dependencyId,
    status: input.allowInstall === true ? "requiresApproval" : "blocked",
    publicSafe: true,
    message: "Dependency installation is not implemented in the semantic basetool layer yet.",
  };
}
