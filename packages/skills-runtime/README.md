# @apogee/skills-runtime

Runtime for APOGEE skill manifests, registry, sandboxed execution, provenance capture, and typed UI-safe errors.

## isolated-vm install notes

The sandbox uses `isolated-vm` 5.x. It is a native dependency and may need a working C++ toolchain when a prebuild is unavailable:

- Node 20.18.x, matching the repository engine.
- Python 3, `make`, and a C++ compiler available to `node-gyp`.
- On Linux: `build-essential`/`g++` or equivalent.

APOGEE executes every skill in a fresh isolate with a 128 MB memory limit. Skills do not receive `fs`, `child_process`, or `net`; all external capabilities must go through the provided context clients and declared egress allowlist.
