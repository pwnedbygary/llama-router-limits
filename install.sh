#!/usr/bin/env sh
set -eu

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_root=${XDG_CONFIG_HOME:-"${HOME}/.config"}
opencode_dir="${config_root}/opencode"
plugin_dir="${opencode_dir}/plugins"
backup_dir="${opencode_dir}/plugin-backups"
target="${plugin_dir}/llama-router-limits"
legacy="${plugin_dir}/llama-router-limits.js"

mkdir -p "$plugin_dir" "$backup_dir"
staging=$(mktemp -d "${opencode_dir}/.llama-router-limits-install.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT HUP INT TERM

cp "$package_dir/package.json" "$package_dir/package-lock.json" "$package_dir/index.js" "$staging/"
cp -R "$package_dir/plugin" "$staging/plugin"
npm ci --prefix "$staging" --omit=dev --ignore-scripts --no-audit --no-fund

timestamp="$(date +%Y%m%d-%H%M%S)-$$"
if [ -e "$target" ]; then
  mv "$target" "${backup_dir}/llama-router-limits-${timestamp}"
fi
if [ -f "$legacy" ]; then
  mv "$legacy" "${backup_dir}/llama-router-limits.js-${timestamp}"
fi

mv "$staging" "$target"
trap - EXIT HUP INT TERM

printf 'Installed llama-router-limits at %s\n' "$target"
printf 'Restart OpenCode (or run: opencode service restart) to load it.\n'
