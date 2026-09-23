# Changelog

## 0.1.0 - 2026-09-23

- Add an OpenCode 2 plugin that synchronizes llama.cpp router limits into the existing JSONC config.
- Parse `--ctx-size` and `--n-predict` from resolved `status.args`.
- Preserve all non-limit provider and model metadata.
- Keep the existing config intact across router failures and back up every changed config version.
- Add fixtures for five observed router models, automated tests, local install scripts, and Git/npm-compatible package metadata.
