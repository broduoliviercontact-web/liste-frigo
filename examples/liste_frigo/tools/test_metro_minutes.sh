#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/friiigooo-metro-test.XXXXXX")
trap 'rm -rf "$build_dir"' EXIT INT TERM

c++ -std=c++17 \
  -I"$root/../../.pio/libdeps/T5-ePaper-S3/ArduinoJson/src" \
  -I"$root" \
  "$root/../../tests/metro_minutes.cpp" \
  -o "$build_dir/test_metro_minutes"
"$build_dir/test_metro_minutes"
