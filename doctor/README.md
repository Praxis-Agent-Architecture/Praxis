# Praxis Doctor Project

`doctor/` is the built-in diagnostic application project used by `rax devdoctor`.

It is intentionally small:

- runs through the public `applicationLayer`;
- defaults to dry-run, so it does not require provider credentials;
- mounts read-only inspection tools;
- keeps runtime records under `.devdoctor/runs/<timestamp>/`.

Run:

```bash
rax devdoctor run
rax devdoctor inspect --run latest
rax devdoctor cache-xray --run latest
```
