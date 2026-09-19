#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
mkdir -p dist

# Copy the application payload while keeping repository/docs/config files
# out of the public Pages output. Unknown future runtime files are copied
# automatically so upstream can add local modules/assets without changing
# this script.
tar   --exclude='./.git'   --exclude='./.github'   --exclude='./dist'   --exclude='./README.md'   --exclude='./LICENSE'   --exclude='./CHANGELOG'   --exclude='./.gitignore'   --exclude='./wrangler.toml'   --exclude='./img.png'   -cf - . | tar -xf - -C dist

if [[ ! -s dist/_worker.js ]]; then
  echo "dist/_worker.js is missing or empty" >&2
  exit 1
fi

node --check dist/_worker.js
echo "Pages payload prepared in dist/"
