#!/usr/bin/env bash
# Usage: new-project.sh <folder> [cast.js]
# Scaffolds a HyperFrames project (1080x1920) and drops the Life Constellation
# engine into it. Without a cast file it starts from the default cast.
set -euo pipefail
dir="$1"; cast="${2:-}"
here="$(cd "$(dirname "$0")/.." && pwd)"
HF="hyperframes@0.8.210"
if [ ! -f "$dir/hyperframes.json" ]; then
  npx --yes "$HF" init "$dir" --example blank --resolution portrait --non-interactive --skip-skills >/dev/null
fi
cp "$here/engine/index.html" "$here/engine/lc-core.js" "$here/engine/lc-render.js" "$here/engine/gsap.min.js" "$dir/"
mkdir -p "$dir/fonts" && cp "$here/engine/fonts/"*.woff2 "$dir/fonts/"
if [ -n "$cast" ]; then cp "$cast" "$dir/cast.js"; elif [ ! -f "$dir/cast.js" ]; then cp "$here/engine/cast.example.js" "$dir/cast.js"; fi
rm -f "$dir/CLAUDE.md" "$dir/AGENTS.md"
printf '.hyperframes/\nreview/\nrenders/\npreview.html\nnode_modules/\n' > "$dir/.gitignore"
node "$here/scripts/plan.mjs" "$dir" --write >/dev/null
echo "ready: $dir  (edit $dir/cast.js, then: node $here/scripts/plan.mjs $dir --write)"
