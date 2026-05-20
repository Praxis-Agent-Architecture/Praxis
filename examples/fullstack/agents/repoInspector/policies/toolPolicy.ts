import { praxis } from "@praxis-ai/praxis";
import type { BaseToolPolicyMatrixSpec } from "@praxis-ai/praxis";

import type { RepoInspectorPolicyProfile } from "../config/repoInspectorOptions.js";

export function createRepoInspectorToolPolicy(profile: RepoInspectorPolicyProfile): BaseToolPolicyMatrixSpec {
  if (profile === "restricted") return praxis.toolPolicies.restricted({ matrixId: "toolPolicy.example.repoInspector.restricted" });
  if (profile === "permissive") return praxis.toolPolicies.permissive({ matrixId: "toolPolicy.example.repoInspector.permissive" });
  if (profile === "yolo") return praxis.toolPolicies.yolo({ matrixId: "toolPolicy.example.repoInspector.yolo" });
  if (profile === "bapr") return praxis.toolPolicies.bapr({ matrixId: "toolPolicy.example.repoInspector.bapr" });
  return praxis.toolPolicies.standard({ matrixId: "toolPolicy.example.repoInspector.standard" });
}
