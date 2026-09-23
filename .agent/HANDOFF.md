# Handoff checkpoint

## Scope and baseline

- Repository at `/home/garyb/LLM-Projects/llama-router-limits` on `main`; GitHub remote: `https://github.com/pwnedbygary/llama-router-limits` (private).
- Build a native OpenCode 2.0.8 plugin for the existing `llama-cpp-router` provider. The router's resolved `status.args` supplies `--ctx-size` and `--n-predict`.
- Preserve every other provider/model config field; skip writes when the router or data is unavailable; provide local install/uninstall and a future GitHub update path.

## Verified observations

- The user's live router returns five configured models, four at context `163840`, one IQ3_S model at `98304`, all with output `32768`.
- In an isolated OpenCode 2.0.8 server, provider and model transforms executed but explicit JSONC model limits still took precedence in `/api/model`. The initial in-memory approach did not achieve the requested catalog result.
- A V2 plugin that edits only matching JSONC `limit.context` and `limit.output` values was loaded as an active local package. Its isolated catalog showed Tiel `163840/32768` and Qwen IQ3_S `98304/32768`, replacing test values `65536/4096`. The test used an isolated `XDG_CONFIG_HOME`; the user's global config was not changed.

## Current implementation

- `plugin/llama-router-limits.js`: V2 lifecycle, router fetch/validation, five-minute refresh.
- `plugin/config-sync.js`: narrow JSONC edits, explicit upstream-ID matching, concurrent-change check, timestamped backup, atomic replacement. A simultaneous edit in the final instant before replacement remains possible.
- `install.sh` and `uninstall.sh`: isolated package-directory installation and recoverable removal.
- `index.js` and `package.json`: package entrypoint for future OpenCode-managed Git updates.
- Tests use observed router IDs and exercise config preservation, explicit upstream-ID precedence, missing fields, backups, and offline behavior.

## Checks actually run

- `npm test`: 7 passed after the explicit-ID regression fix.
- `npm run typecheck`: passed against `@opencode/plugin` 2.0.8.
- `npm run test:live`: matched five live router models.
- `npm pack --dry-run`: 7 expected publishable files.
- `sh -n install.sh uninstall.sh`: passed.
- `npm audit --omit=dev --audit-level=moderate`: no runtime advisories. Full development install audit reports 11 moderate advisories in dev dependencies.
- Isolated OpenCode server API: local plugin active; two configured test model limits updated as expected. Test installer and uninstaller both ran in isolated config.

## Review and publication state

- First independent review found a README GitHub repository-name mismatch; this was corrected. A subsequent full review found a model-key fallback that could write limits to an explicitly different upstream ID; fixed with a regression test. Final rereview passed.
- Initial reviewed source committed as `b4daec9` and pushed to `origin/main`. GitHub repository is private. The source archive is `llama-router-limits-0.1.0.tar.gz` in the local repository root and is not committed.
- The plugin has not been installed into the user's real OpenCode configuration. Next step is user-led installation and verification, then native GitHub package update testing once GitHub authentication is available to OpenCode. Do not assume either has already passed.
