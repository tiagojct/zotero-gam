#!/bin/sh
# Build build/gam-<version>.xpi from the plugin files.
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' manifest.json | head -1)
mkdir -p build
out="build/gam-$version.xpi"
rm -f "$out"
zip -q -r "$out" manifest.json bootstrap.js prefs.js content locale -x '*.DS_Store'
echo "$out"
