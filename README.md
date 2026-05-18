# Praxis

Praxis is the agent framework and runtime behind Raxode. It provides the OAO authoring surface, manifest compilation, runtime governance, provider adapters, baseTool contracts, and application-layer bridge used to build agent products.

## Install

```bash
npm install @praxis-ai/praxis
```

Node.js `>=24.15.0` is required.

## Public Entrypoints

```ts
import { praxis } from "@praxis-ai/praxis";
import { createApplicationProjectRuntime } from "@praxis-ai/praxis/application-layer";
```

Stable public exports:

- `@praxis-ai/praxis`
- `@praxis-ai/praxis/agent-core`
- `@praxis-ai/praxis/application-layer`
- `@praxis-ai/praxis/rax`

Internal runtime folders are open-source implementation details. Build agents through the public facade instead of importing deep files.

## CLI

```bash
rax build init minimal --dir ./hello-agent
rax inspect ./hello-agent/agents/mainAgent.ts
rax test ./hello-agent/agents/mainAgent.ts
```

## License

AGPL-3.0-only.
