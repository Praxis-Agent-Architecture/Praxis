# Praxis Doctor Project

`src/devdoctor/` is the built-in diagnostic application project used by `rax devdoctor`.

It is intentionally small:

- runs through the public `applicationLayer`;
- defaults to dry-run, so it does not require provider credentials;
- mounts read-only inspection tools;
- keeps runtime records under `.devdoctor/runs/<timestamp>/`.

Run:

```bash
rax devdoctor run
rax devdoctor inspect --run latest
rax devdoctor monitor --run latest
rax devdoctor cache-xray --run latest
```

`monitor` reads the latest existing `.devdoctor/runs/<timestamp>/` artifact by default and writes:

- `execution-monitor.json`: full public-safe turn/session/project cache, cost, and health report;
- `execution-monitor.md`: terminal-friendly summary;
- `cache-xray.json`: compatibility alias output when `cache-xray` is used.

It does not auto-fix cache issues. It preserves pointers, hashes, token counts, and finding ids, but does not store raw prompts or raw provider request bodies.
