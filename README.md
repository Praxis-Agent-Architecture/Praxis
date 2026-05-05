# Praxis

Praxis is an agent framework kernel.

It gives developers a TypeScript-first way to define an Agent object, compile it into a manifest, and run it through a governed runtime.

The current public surface is intentionally small:

```text
agentCore/    framework kernel: Agent authoring, manifest compile, runtime, model, governance, session/event
storagePool/  BaseTool storage: canonical tool implementations and dependency contracts
```

Everything above this layer, such as raxode, raxos, TAP/CMP/MP modules, package distribution, and hosted documentation, should enter through these contracts instead of bypassing them.

## Status

This repository is currently the framework-core release surface for Praxis.

Working pieces:

- `PraxisAgent` / `PraxisAgentArchetype` authoring contracts
- `compileAgent(...) -> AgentManifest`
- `PraxisRuntimeKernel.runManifest(...)`
- PromptPack and MainLoop formal handoff contracts
- BaseTool registry, runtime governance, executor ports, dependency readiness, and developer catalog
- SQLite-ready session/state/event storage contracts
- `storagePool/baseToolStorage` canonical BaseTool implementations

Still evolving:

- final rax package manager and remote registry
- hosted docs site
- TAP/CMP/MP/multiagent concrete advanced module implementations
- production sandbox/container backends

## Requirements

- Node.js `>=22`
- npm, matching `package-lock.json`

Do not commit `node_modules/`. Install dependencies from the lockfile:

```bash
npm ci
```

## Quick Start

Clone and verify the framework surface:

```bash
git clone https://github.com/Praxis-Agent-Architecture/Praxis.git
cd Praxis
npm ci
npm run typecheck
```

The typecheck command validates the root-level `agentCore/` and `storagePool/` source tree.

## Minimal Agent

Create `quickstart-agent.ts`:

```ts
import {
  PraxisAgentArchetype,
  baseTools,
  compileAgent,
  harness,
  model,
  sandbox,
  session,
  toolPolicies,
  tools,
} from "./agentCore/index.js";

class RepoAgent extends PraxisAgentArchetype {
  identity = "agent.repo.quickstart";
  model = model("gpt-5.5");

  harness = harness({
    tools: tools([
      baseTools.code.read(),
      baseTools.code.searchRipgrep(),
      baseTools.git.getRepositoryStatus(),
    ]),
  });

  sandbox = sandbox.hostObserved();
  toolPolicy = toolPolicies.standard();
  session = session({ persistence: "sqlite", resume: "auto" });
}

const compiled = compileAgent(RepoAgent);

if (!compiled.ok) {
  console.error(compiled.error);
  process.exit(1);
}

console.log(JSON.stringify(compiled.manifest, null, 2));
```

Run it:

```bash
node --import tsx quickstart-agent.ts
```

This proves the authoring path:

```text
PraxisAgent class or instance
-> compileAgent(...)
-> AgentManifest
-> PraxisRuntimeKernel.runManifest(...)
```

The Agent class is the developer experience. The manifest is the runtime truth.

## BaseTool Usage

Use the public helper catalog instead of hand-writing tool ids when possible:

```ts
import { baseTools, toolSets } from "./agentCore/index.js";

const readonlyCodingTools = toolSets.coding.readonly({
  includeGit: true,
  includeSearch: true,
});

const explicitTools = [
  baseTools.code.read(),
  baseTools.code.searchRipgrep(),
  baseTools.git.getRepositoryStatus(),
];
```

BaseTool semantics live in `storagePool/baseToolStorage`.

Runtime owns execution ports, dependency readiness, policy checks, approval routing, resource limits, session/event records, and public-safe failures.

The tool invocation chain must stay:

```text
runtime request
-> invocation adapter
-> execEngine bridge
-> BaseTool registry lookup
-> storagePool handler invoke
-> BaseToolExecutorPort
```

## Storage Layout

Praxis uses two storage conventions:

```text
~/.rax           user-level config, auth refs, provider profiles, package cache
.rax_workspace  project-level sessions, state, events, approvals, artifacts, cache
```

The framework stores credential references, not raw secrets. Real auth is resolved through the model adapter/auth profile layer.

## Runtime Boundaries

Praxis uses a conservative default posture:

- default tool policy profile: `standard`
- default sandbox profile: `host-observed`
- runtime executes manifests, not arbitrary class internals
- constructors should only declare configuration
- provider-specific output is normalized before becoming Praxis core state

`host-observed` means there is no real container yet, but runtime still records, gates, and audits host actions.

## Remote Registry And Docs Site

The upcoming infrastructure site will serve two roles:

- documentation site for framework usage, API guides, and examples
- remote package/registry surface for rax-managed official and community packages

Until that registry is live, this repository is the source of truth for the kernel contracts.

## Useful Commands

```bash
npm ci
npm run typecheck
```

Future rax commands are expected to follow this shape:

```bash
rax inspect agent.ts
rax test agent.ts
rax run agent.ts
rax dev agent.ts
```

Those commands should compile Agent source into `AgentManifest` before execution.

## Project Shape

```text
agentCore/
  index.ts
  agent_executionEngine/
  agent_modelAdapter/
  agent_interfaceAdapter/
  agent_runtimeImplementation/

storagePool/
  baseToolStorage/
    codeBase/
    computeruseBase/
    gitBase/
    mcpBase/
    omniBase/
    searchBase/
    shellBase/
    skillBase/
```

## License

See project license information in the repository.
