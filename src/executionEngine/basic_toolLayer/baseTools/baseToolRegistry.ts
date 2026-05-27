/*
 * Legacy compatibility shim.
 * Current semantic basetool registry lives in src/basetool.
 */

export {
  baseToolRegistryDescriptor,
  builtinBaseToolHandlers,
  createBaseToolRegistry,
} from "../../../basetool/registry.js";
export type {
  BaseToolRegistry,
  BaseToolRegistryLookupResult,
} from "../../../basetool/types.js";
