# Praxis Memory Plane

`memoryPlane` is the passive durable-memory surface for Praxis applications.
It is not MP, not RAG, and not an automatic summarizer.

## Shape

Applications inject memory roots:

```ts
const memory = praxis.memory.create({
  projectMemoryRoot: "/workspace/.rax_workspace/memory",
  globalMemoryRoot: "/home/user/.raxode/memory",
  profile: "readonly",
});
```

Each root uses Markdown as the truth source:

```text
memory/
  MEMORY.md
  daily/YYYY-MM-DD.md
  artifacts/
  index.sqlite
```

SQLite is only a lightweight index for file metadata and artifact references.
If the index is missing or corrupt, the application can rebuild it with
`praxis.memory.reindex(...)`.

## Search

Memory search is a special guide for `basetool` `file.search`, not a new model
tool. The model should search memory roots with `file.search`, then read
matching Markdown with `file.read`.

## Profiles

- `off`: memory is disabled.
- `readonly`: read/search/reindex guidance only.
- `appendOnly`: application may allow append-only daily notes.
- `full`: application may allow complete memory maintenance.

Risk metadata is exposed through `praxis.memory.describeRisk(...)` so the
application/runtime policy layer can decide approvals.
