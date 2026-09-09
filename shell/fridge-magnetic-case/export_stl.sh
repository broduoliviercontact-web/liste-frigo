#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v openscad >/dev/null 2>&1; then
  echo "OpenSCAD CLI not found. Install OpenSCAD, then rerun this script." >&2
  exit 1
fi

openscad -o fridge_magnetic_case_front.stl -D 'part="front"' fridge_magnetic_case.scad
openscad -o fridge_magnetic_case_back.stl -D 'part="back"' fridge_magnetic_case.scad

echo "Generated:"
echo "  shell/fridge-magnetic-case/fridge_magnetic_case_front.stl"
echo "  shell/fridge-magnetic-case/fridge_magnetic_case_back.stl"
