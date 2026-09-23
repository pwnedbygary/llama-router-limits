# OpenCode llama.cpp Router Limits

A native OpenCode 2 plugin that reads resolved model limits from llama.cpp router mode and updates the corresponding limits in the existing OpenCode JSONC configuration.

The default configuration is tailored to this setup:

- Provider ID: `llama-cpp-router`
- Router endpoint: `http://127.0.0.1:8080/models?reload=1`
- Context source: `status.args` → `--ctx-size`
- Output source: `status.args` → `--n-predict`
- Refresh interval: 5 minutes

## What it changes

For an exact model-ID match—or an OpenCode alias whose `modelID` matches the router ID—the plugin changes only these fields under `provider.llama-cpp-router.models` in `~/.config/opencode/opencode.jsonc`:

```text
model.limit.context
model.limit.output
```

Names, provider settings, capabilities/modalities, reasoning settings, headers, variants, pricing, comments, and every other field are left intact. OpenCode's config watcher then reloads the catalog.

The supplied fixture reflects the current router presets:

| Model ID | Context | Output |
|---|---:|---:|
| `TIEL-CODER-35B-A3B-Q4_K_XL` | 163840 | 32768 |
| `CYBER-TIEL-CODER-35B-A3B-Q4_K_XL` | 163840 | 32768 |
| `Qwen3.8-27B-GSQ-RCO-IQ3_S-MTP` | 98304 | 32768 |
| `Qwen3.8-27B-GSQ-RCO-IQ3_XXS-MTP` | 163840 | 32768 |
| `Dirk-3.8-27B-IQ3_XXS-MTP` | 163840 | 32768 |

These values were cross-checked against `/home/garyb/Mounts/NVME/llama.cpp/presets.ini`. The chat template does not define either limit and is intentionally not parsed.

## Safety behavior

- If the router is offline, times out, returns non-JSON, or returns no valid limits, the plugin leaves the OpenCode config unchanged.
- Each change first creates a timestamped backup of `opencode.jsonc` beside the original, then replaces the file atomically.
- The plugin checks for concurrent config changes before replacement and skips the write if it detects one. A simultaneous edit in the final instant before replacement is still possible; the timestamped backup provides recovery.
- Missing or invalid `--ctx-size` leaves `limit.context` untouched.
- Missing or invalid `--n-predict` leaves `limit.output` untouched.
- Zero, negative, fractional, and unsafe integer values are ignored.
- The plugin never starts or stops llama.cpp. It writes `opencode.jsonc` only when a matching limit changes.

## Requirements

- OpenCode 2.0.8 or newer within the 2.x native plugin API
- A global `opencode.jsonc` containing the `llama-cpp-router` provider and its models
- A llama.cpp router response shaped as `{ "data": [{ "id": "...", "status": { "args": [...] } }] }`

The plugin targets and was type-checked against `@opencode/plugin` 2.0.8, matching the installed `opencode v2.0.8` used for development.

## Install

From this repository root (or an extracted archive), run:

```bash
chmod +x install.sh uninstall.sh
./install.sh
opencode service restart
```

OpenCode globally discovers package directories under:

```text
~/.config/opencode/plugins/
```

The installer puts the package at `~/.config/opencode/plugins/llama-router-limits/` and installs its small `jsonc-parser` runtime dependency there. It does not edit the `plugins` array. If an earlier local copy exists, the installer moves it into `~/.config/opencode/plugin-backups/`.

With server logs enabled, a successful initial fetch reports:

```text
[llama-router-limits] updated 5 limit value(s) for 5 model(s); backup: ...
```

Then confirm the five model limits in OpenChamber or through the OpenCode model catalog.

`opencode plugin list` manages configured npm/Git packages and may not display a directly discovered local directory. This is expected for the archive-based development install.

## Seamless updates after GitHub publication

This package has a publishable `exports` entry, so it can use OpenCode's native package manager from the public GitHub repository:

```bash
./uninstall.sh
opencode plugin add github:pwnedbygary/llama-router-limits
opencode service restart
```

From then on, updates use the same commands as other OpenCode plugins:

```bash
opencode plugin check
opencode plugin update github:pwnedbygary/llama-router-limits
opencode service restart
```

Or update every managed plugin together:

```bash
opencode plugin update
```

Uninstall the local development copy before adding the GitHub package to avoid a duplicate plugin ID. OpenCode checks unpinned Git packages in the background and its explicit update command refreshes them. Pinning a full commit intentionally disables update checks for that entry.

## Configuration

Defaults work without configuration. The following environment variables are optional:

| Variable | Default |
|---|---|
| `OPENCODE_LLAMA_ROUTER_PROVIDER_ID` | `llama-cpp-router` |
| `OPENCODE_LLAMA_ROUTER_URL` | `http://127.0.0.1:8080/models?reload=1` |
| `OPENCODE_LLAMA_ROUTER_CONFIG_PATH` | `~/.config/opencode/opencode.jsonc` |
| `OPENCODE_LLAMA_ROUTER_REFRESH_MS` | `300000` |
| `OPENCODE_LLAMA_ROUTER_TIMEOUT_MS` | `5000` |

If the plugin is loaded explicitly as a package/path entry, equivalent OpenCode plugin options are `providerID`, `routerURL`, `configPath`, `refreshIntervalMs`, and `requestTimeoutMs`. Plugin options take precedence over environment variables.

## Test

The test suite uses Node's built-in test runner. The archive's local installer runs `npm ci` inside its private plugin directory; it needs npm and network access on first install.

```bash
npm install
npm test
npm run typecheck
npm run test:live
```

The unit tests cover the five observed model IDs, alternate `--flag=value` syntax, missing and invalid fields, malformed/empty responses, provider isolation, alias matching, backups, and preservation of non-limit metadata. `test:live` additionally queries the running router and compares its five limits with the checked-in fixture.

## Uninstall

From the extracted package directory:

```bash
./uninstall.sh
opencode service restart
```

The uninstaller moves only `~/.config/opencode/plugins/llama-router-limits/` into `~/.config/opencode/plugin-backups/` for recovery. It does not revert model limits already synchronized into `opencode.jsonc`; use the timestamped config backup if a rollback is needed.

## API basis

This is a V2 plugin that default-exports an `{ id, setup }` definition typed against the `@opencode/plugin` V2 interface. A live test against OpenCode 2.0.8 showed that both provider and model transforms ran but explicit JSONC model limits still won when OpenCode committed the catalog. The plugin therefore performs a narrow JSONC edit from its V2 lifecycle. This behavior is specific to the tested 2.0.8 config-backed provider path; a future OpenCode API may allow a fully in-memory override.
