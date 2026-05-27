export {
  canonicalDependencyId,
  dependencyKindFromId,
  legacyDependencyIds,
  type DependencyAvailability,
  type DependencyCommandSpec,
  type DependencyDeclaration,
  type DependencyInstallPlan,
  type DependencyInstallPolicy,
  type DependencyInstallStep,
  type DependencyKind,
  type DependencyPlaneContext,
  type DependencyPlaneError,
  type DependencyPlaneResult,
  type DependencyProbe,
  type DependencyReadinessStatus,
  type DependencySafety,
  type DependencySource,
  type ManagedDependencyRecord,
  type ManagedDependencyState,
  type ProjectDependencyLock,
  type ProjectDependencyLockEntry,
} from "./dependencyTypes.js";

export {
  createDependencySourceRegistry,
  defaultManagedRoot,
  dependencySourceRegistryDescriptor,
  lookupDependencySource,
  officialDependencySources,
  planDependencyInstallation,
  type DependencySourceLayer,
  type DependencySourceRegistry,
} from "./dependencySourceRegistry.js";

export {
  dependencyManagedStateDescriptor,
  readManagedDependencyRecord,
  readManagedDependencyState,
  readProjectDependencyLock,
  writeManagedDependencyRecord,
  writeProjectDependencyLockEntry,
} from "./dependencyManagedState.js";

export {
  dependencyProbeRunnerDescriptor,
  probeDependency,
} from "./dependencyProbeRunner.js";

export {
  dependencyInstallerDescriptor,
  ensureDependencyAvailable,
} from "./dependencyInstaller.js";

export {
  declarationsFromLspProfile,
  resolveLspDependency,
  type LspDependencyProfile,
  type LspDependencyResolverInput,
} from "./lspDependencyResolver.js";

export {
  planDependencyReadiness,
  type DependencyPrepareMode,
  type DependencyReadinessPlan,
  type DependencyReadinessStep,
} from "./dependencyReadinessPlanner.js";
