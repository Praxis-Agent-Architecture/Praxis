# Runtime Readiness Map

Praxis has grown runtime and application surfaces across recent PRs: the runtime kernel, application management plane, MCP/MCP+ mount inspection, skill/BaseTool support, sandbox execution, and dry-run smoke paths. The repo inspector should not only list those surfaces. It should also say whether each surface is backed by evidence that a reviewer can use for business-readiness decisions.

The runtime readiness map is the small contract that turns inspector output into that review surface.

## What It Reports

Each readiness entry includes surface, status, evidence, risk, and nextAction fields.

The current fullstack repo inspector reports these surfaces:

| Surface | Evidence Source | Why It Matters |
| --- | --- | --- |
| application management plane | runtime surface inspection | Shows whether inspect output can answer readiness questions, not just enumerate modules. |
| MCP and MCP+ runtime adapter | MCP mount matrix | Shows whether native and MCP+ tool paths have runtime ports and evidence. |
| sandbox and execution substrate | sandbox mount matrix | Keeps host-observed smoke evidence separate from real isolation claims. |
| skill plane and BaseTool readiness | framework inspection findings | Shows whether skill/BaseTool support is ready or still needs adapter work. |
| runtime smoke evidence | session store and dry-run result | Proves the inspected surface can execute through the runtime path. |

## Review Use

This map is intentionally an inspector-output contract, not a runtime behavior change. It helps reviewers answer three questions quickly:

1. Which surfaces already have evidence?
2. Which surfaces are only wired but not proven by smoke or acceptance checks?
3. What is the next concrete action that moves Praxis closer to business use?

When a future PR adds a runtime/application surface, it should either add that surface to the readiness map or explain why the surface is not part of the business-readiness review path yet.
