# Praxis

Praxis is the agent framework and runtime behind Raxode. It provides the OAO authoring surface, manifest compilation, runtime governance, provider adapters, baseTool contracts, and application-layer bridge used to build agent products.

Praxis is the lower framework layer. Raxode, dumbagent, and future products should depend on Praxis instead of carrying their own hidden runtime.

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
- `@praxis-ai/praxis/agentCore`
- `@praxis-ai/praxis/agent-core`
- `@praxis-ai/praxis/application`
- `@praxis-ai/praxis/application-layer`
- `@praxis-ai/praxis/rax`

Internal runtime folders are open-source implementation details. Build agents through the public facade instead of importing deep files.

## Examples And Doctor

The repository keeps runnable framework examples and diagnostics in separate places:

- `examples/minimal`: smallest public-API agent example.
- `examples/fullstack`: application-shaped backend example aligned with Raxode-style integration.
- `examples/scripts`: example frontends, live chat, tool labs, and live matrix runners for the examples.
- `doctor`: built-in diagnostic project used by `rax devdoctor`.
- `automations`: repository maintenance automation only, such as build and dist helpers.

`examples/` and `doctor/` are included in the npm package because they are part of the developer verification surface. Top-level `automations/` is repository maintenance surface and is not shipped as runtime API.

## CLI

```bash
rax build init minimal --dir ./hello-agent
rax inspect ./hello-agent/agents/mainAgent.ts
rax test ./hello-agent/agents/mainAgent.ts
rax devdoctor run
npm run example:minimal
npm run example:fullstack
```

## Runtime Records

Runtime and diagnostic records should go under `.devdoctor/` or `.rax_workspace/`.
Short-lived test scratch should use `.tmp/` or an OS temporary directory.
The old `tasks/` directory was historical planning material and has been removed; do not recreate it for logs.

## License

AGPL-3.0-only.
