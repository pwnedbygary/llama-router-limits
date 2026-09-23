#!/usr/bin/env sh
set -eu

config_root=${XDG_CONFIG_HOME:-"${HOME}/.config"}
opencode_dir="${config_root}/opencode"
plugin_dir="${opencode_dir}/plugins"
backup_dir="${opencode_dir}/plugin-backups"
target="${plugin_dir}/llama-router-limits"
legacy="${plugin_dir}/llama-router-limits.js"
timestamp="$(date +%Y%m%d-%H%M%S)-$$"

mkdir -p "$backup_dir"
if [ -e "$target" ]; then
  mv "$target" "${backup_dir}/llama-router-limits-removed-${timestamp}"
  printf 'Moved plugin to %s for recovery.\n' "$backup_dir"
fi
if [ -f "$legacy" ]; then
  mv "$legacy" "${backup_dir}/llama-router-limits.js-removed-${timestamp}"
fi

printf 'Restart OpenCode (or run: opencode service restart) to unload it.\n'
